/**
 * Carga gradual dos detalhes da Pieta no Postgres (entidade `pieta_projetos` da
 * tabela única). O resumo (lista de projetos) vem em 1 chamada; o detalhe é 1 chamada
 * por projeto, e a API devolve erro interno depois de 6 a 10 chamadas seguidas. Por isso:
 *  - concorrência 1 e pausa de ~3 s entre detalhes;
 *  - no máximo PIETA_MAX_DETALHES_POR_EXECUCAO detalhes por execução (padrão 3, teto 10);
 *  - para no primeiro erro 5xx/timeout/rede, sem nova tentativa (continua na próxima execução);
 *  - o resumo pode ser reaproveitado do estado (o tick de 5 min só pede um novo a cada ~30 min).
 * Roda no cron diário e, leve, no tick de 5 em 5 minutos. Só se busca de novo o que é novo,
 * mudou (status, last_status_change, due_date) ou tem detalhe com mais de 24 h.
 */
import { ENCERRADOS, ENTIDADE_PIETA, pietaRegistroParaArmazenar } from './pietaMetricas.js'
import { ehTransitorio } from './pietaClient.js'

export const MAX_DETALHES_PADRAO = 3
export const MAX_DETALHES_TETO = 10 // a API cai entre 6 e 10 chamadas seguidas
export const PAUSA_PADRAO_MS = 3000
export const PAUSA_MINIMA_MS = 1000
export const ORCAMENTO_MS = 40000 // cron diário: listagem + detalhes + gravação, dentro dos 60 s da função
export const TIMEOUT_CHAMADA_MS = 15000
export const TEMPO_MINIMO_CHAMADA_MS = 3000 // com menos que isso no orçamento, não inicia chamada nova
export const VALIDADE_DETALHE_MS = 24 * 60 * 60 * 1000
export const VALIDADE_RESUMO_TICK_MS = 30 * 60 * 1000
export const ESPERA_APOS_FALHA_MS = 6 * 60 * 60 * 1000 // projeto que falhou vai para o fim da fila por 6 h
export const FRACAO_MAX_REMOCAO = 0.1 // resumo com mais de 10% dos projetos sumidos é tratado como parcial

const dormirPadrao = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Máximo de detalhes por execução (env PIETA_MAX_DETALHES_POR_EXECUCAO), entre 0 e o teto. */
export function maxDetalhesDoAmbiente(env = process.env) {
  const n = Number.parseInt(env.PIETA_MAX_DETALHES_POR_EXECUCAO ?? '', 10)
  return Number.isFinite(n) && n >= 0 ? Math.min(n, MAX_DETALHES_TETO) : MAX_DETALHES_PADRAO
}

/** Pausa entre detalhes (env PIETA_PAUSA_ENTRE_DETALHES_MS), nunca abaixo de 1 s. */
export function pausaDoAmbiente(env = process.env) {
  const n = Number.parseInt(env.PIETA_PAUSA_ENTRE_DETALHES_MS ?? '', 10)
  return Number.isFinite(n) ? Math.max(n, PAUSA_MINIMA_MS) : PAUSA_PADRAO_MS
}

/** Do resumo só se guarda o que o planejamento e o registro usam (sem `message`). */
const reduzirProjetoResumo = (p) => ({
  project_id: p.project_id, status: p.status ?? null, client_name: p.client_name ?? null, power: p.power ?? null,
  power_distributor: p.power_distributor ?? null, created_at: p.created_at ?? null,
  last_status_change: p.last_status_change ?? null, due_date: p.due_date ?? null,
})

/**
 * Decide o que buscar e em que ordem: novos, depois alterados, depois vencidos por idade.
 * Projetos que falharam há menos de ESPERA_APOS_FALHA_MS vão para o fim (um projeto com defeito não trava a fila).
 */
export function planejarBusca(projetosResumo, armazenados, agora = Date.now(), falhasRecentes = {}) {
  const porId = new Map(armazenados.map((r) => [String(r.projectId), r]))
  const novos = []; const alterados = []; const velhos = []
  for (const p of projetosResumo) {
    const guardado = porId.get(String(p.project_id))
    if (!guardado) { novos.push(p); continue }
    const mudou = (guardado.lastStatusChange ?? null) !== (p.last_status_change ?? null)
      || (guardado.status ?? null) !== (p.status ?? null)
      || (guardado.dueDate ?? null) !== (p.due_date ?? null)
    if (mudou) { alterados.push(p); continue }
    if (ENCERRADOS.has(guardado.status)) continue // encerrado não muda mais: não precisa renovar
    const idade = agora - Date.parse(guardado.buscadoEm)
    if (!Number.isFinite(idade) || idade > VALIDADE_DETALHE_MS) velhos.push(p)
  }
  // Mais antigos primeiro entre os vencidos por idade, para a fila andar mesmo quando não cabe tudo.
  velhos.sort((a, b) => Date.parse(porId.get(String(a.project_id)).buscadoEm || 0) - Date.parse(porId.get(String(b.project_id)).buscadoEm || 0))
  const fila = [...novos, ...alterados, ...velhos]
  const falhouHaPouco = (p) => {
    const em = Date.parse(falhasRecentes?.[String(p.project_id)] ?? '')
    return Number.isFinite(em) && agora - em < ESPERA_APOS_FALHA_MS
  }
  return [...fila.filter((p) => !falhouHaPouco(p)), ...fila.filter(falhouHaPouco)]
}

/**
 * @param deps.pg cliente de server/pgSql.js
 * @param deps.resumo (opcoes) => resumo da Pieta   (opcoes.timeoutMs)
 * @param deps.detalhe (id, opcoes) => detalhe do projeto   (opcoes.timeoutMs)
 * @param deps.agora relógio injetável (ms); deps.dormir pausa injetável (testes)
 * @param deps.orcamentoMs tempo total desta execução (listagem + detalhes)
 * @param deps.reaproveitarResumoMs > 0: usa o resumo guardado se for mais novo que isso (tick)
 */
export async function sincronizarPieta({
  pg, resumo, detalhe, agora = () => Date.now(), dormir = dormirPadrao,
  orcamentoMs = ORCAMENTO_MS, maxDetalhes = maxDetalhesDoAmbiente(), pausaMs = pausaDoAmbiente(), reaproveitarResumoMs = 0,
}) {
  const inicio = agora()
  const restante = () => orcamentoMs - (agora() - inicio)
  const timeoutChamada = () => Math.max(1, Math.min(TIMEOUT_CHAMADA_MS, restante()))
  const estados = await pg.todas('estado', ENTIDADE_PIETA)
  const estadoDe = (chave) => estados.find((e) => e.chave === chave)?.dados ?? null
  const statusAnterior = estadoDe('status')

  // 1. Resumo: reaproveitado do estado (tick) ou 1 chamada, guardado reduzido para os próximos ticks.
  const guardado = estadoDe('resumo')
  const idadeResumo = agora() - Date.parse(guardado?.em ?? '')
  let projetos
  let resumoNovo = false
  if (reaproveitarResumoMs > 0 && Array.isArray(guardado?.projetos) && Number.isFinite(idadeResumo) && idadeResumo >= 0 && idadeResumo < reaproveitarResumoMs) {
    projetos = guardado.projetos
  } else {
    if (restante() < TEMPO_MINIMO_CHAMADA_MS) return { ok: true, pulado: 'sem tempo no orçamento', ms: agora() - inicio }
    const r = await resumo({ timeoutMs: timeoutChamada() })
    projetos = (Array.isArray(r?.projects) ? r.projects : []).filter((p) => p?.project_id != null).map(reduzirProjetoResumo)
    resumoNovo = true
    // Resumo vazio não substitui o guardado (uma resposta vazia não apaga a fila dos próximos ticks).
    if (projetos.length) await pg.upsert([{ tipo: 'estado', entidade: ENTIDADE_PIETA, chave: 'resumo', dados: { em: new Date(agora()).toISOString(), projetos } }])
  }

  const linhasAtivas = await pg.todas('registro', ENTIDADE_PIETA, { ativos: true })
  const armazenados = linhasAtivas.map((l) => l.dados)
  const falhasRecentes = { ...(statusAnterior?.falhasRecentes ?? {}) }
  const fila = planejarBusca(projetos, armazenados, agora(), falhasRecentes)
  const resumoPorId = new Map(projetos.map((p) => [String(p.project_id), p]))

  // Nada a buscar com resumo reaproveitado: não chama a API nem regrava o estado.
  if (!resumoNovo && !fila.length) return { ok: true, resumoReaproveitado: true, planejados: 0, buscados: 0, falhas: 0, restantes: 0, ms: agora() - inicio }

  // 2. Detalhes: 1 por vez, com pausa, até o teto; para no primeiro erro de instabilidade (5xx, timeout, rede).
  const novosRegistros = []
  let buscados = 0; let falhas = 0; let fatal = null; let parada = null
  const limite = Math.min(Math.max(0, maxDetalhes), fila.length)
  for (let i = 0; i < limite; i++) {
    if (i > 0) await dormir(pausaMs)
    if (restante() < TEMPO_MINIMO_CHAMADA_MS) { parada = 'orcamento'; break }
    const p = fila[i]
    try {
      const d = await detalhe(p.project_id, { timeoutMs: timeoutChamada() })
      novosRegistros.push(pietaRegistroParaArmazenar(resumoPorId.get(String(p.project_id)), d, new Date(agora())))
      delete falhasRecentes[String(p.project_id)]
      buscados += 1
    } catch (err) {
      if (err.status === 401 || err.code === 'PIETA_SEM_CREDENCIAL') { fatal = err; break } // credencial ruim: para tudo
      falhas += 1
      falhasRecentes[String(p.project_id)] = new Date(agora()).toISOString()
      if (ehTransitorio(err)) { parada = `erro ${err.status ?? err.code ?? 'de rede'}`; break } // API instável: não insiste
    }
  }
  if (novosRegistros.length) {
    await pg.upsert(novosRegistros.map((dados) => ({ tipo: 'registro', entidade: ENTIDADE_PIETA, chave: String(dados.projectId), dados, ativo: true })))
  }
  if (fatal) throw fatal

  // 3. Projetos que saíram do resumo deixam de contar: só com resumo novo, não vazio e sem queda brusca
  //    (mais de 10% sumindo de uma vez parece resposta parcial; nesse caso não desativa nada).
  let removidos = 0
  let remocaoSuspensa = false
  if (resumoNovo && projetos.length) {
    const sumidos = armazenados.filter((a) => !resumoPorId.has(String(a.projectId)))
    if (sumidos.length > Math.max(3, Math.ceil(armazenados.length * FRACAO_MAX_REMOCAO))) remocaoSuspensa = true
    else if (sumidos.length) {
      removidos = sumidos.length
      await pg.upsert(sumidos.map((dados) => ({ tipo: 'registro', entidade: ENTIDADE_PIETA, chave: String(dados.projectId), dados, ativo: false })))
    }
  }

  // Falhas antigas ou de projetos fora do resumo não precisam ficar guardadas.
  for (const id of Object.keys(falhasRecentes)) {
    const em = Date.parse(falhasRecentes[id])
    if (!resumoPorId.has(id) || !Number.isFinite(em) || agora() - em >= ESPERA_APOS_FALHA_MS) delete falhasRecentes[id]
  }

  const resultado = {
    ok: true, resumoReaproveitado: !resumoNovo, totalNoResumo: projetos.length, planejados: fila.length, buscados, falhas,
    restantes: Math.max(0, fila.length - buscados), removidos, remocaoSuspensa, parada, ms: agora() - inicio,
  }
  await pg.upsert([{
    tipo: 'estado', entidade: ENTIDADE_PIETA, chave: 'status',
    dados: { ...resultado, falhasRecentes, concluidoEm: new Date(agora()).toISOString() },
  }])
  return resultado
}

/** Lê os detalhes guardados (para as métricas) e o último estado da carga. */
export async function lerPietaArmazenada(pg) {
  const [linhas, estado] = await Promise.all([
    pg.todas('registro', ENTIDADE_PIETA, { ativos: true }),
    pg.todas('estado', ENTIDADE_PIETA),
  ])
  const status = estado.find((e) => e.chave === 'status')?.dados ?? null
  // falhasRecentes é controle interno da carga: não vai para a rota pública.
  const { falhasRecentes: _interno, ...publico } = status ?? {}
  return { registros: linhas.map((l) => l.dados), estado: status ? publico : null }
}
