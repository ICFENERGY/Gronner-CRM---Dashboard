/**
 * Carga diária dos detalhes da Pieta no Postgres (entidade `pieta_projetos` da
 * tabela única). A API só entrega o detalhe de 1 projeto por chamada, então só se
 * busca de novo o que é novo, mudou (status, last_status_change, due_date) ou tem
 * detalhe com mais de 24 h; concorrência limitada e orçamento de tempo por execução
 * (o que faltar fica para a próxima).
 */
import { ENCERRADOS, ENTIDADE_PIETA, pietaRegistroParaArmazenar } from './pietaMetricas.js'

export const CONCORRENCIA = 2 // a API da Pieta devolve erro interno com 4 chamadas simultâneas seguidas
export const FALHAS_SEGUIDAS_MAX = 6 // API instável: para a execução e deixa o resto para a próxima
export const ORCAMENTO_MS = 40000
export const VALIDADE_DETALHE_MS = 24 * 60 * 60 * 1000
const GRAVAR_A_CADA = 20

/** Decide o que buscar e em que ordem: novos, depois alterados, depois vencidos por idade. */
export function planejarBusca(projetosResumo, armazenados, agora = Date.now()) {
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
  return [...novos, ...alterados, ...velhos]
}

/**
 * @param deps.pg cliente de server/pgSql.js
 * @param deps.resumo () => resumo da Pieta
 * @param deps.detalhe (id) => detalhe do projeto
 * @param deps.agora relógio injetável (ms)
 */
export async function sincronizarPieta({ pg, resumo, detalhe, agora = () => Date.now(), orcamentoMs = ORCAMENTO_MS, concorrencia = CONCORRENCIA }) {
  const inicio = agora()
  const r = await resumo()
  const projetos = Array.isArray(r?.projects) ? r.projects : []
  const linhasAtivas = await pg.todas('registro', ENTIDADE_PIETA, { ativos: true })
  const armazenados = linhasAtivas.map((l) => l.dados)

  const fila = planejarBusca(projetos, armazenados, agora())
  const resumoPorId = new Map(projetos.map((p) => [String(p.project_id), p]))
  const pendentesGravar = []
  let buscados = 0; let falhas = 0; let seguidas = 0; let fatal = null

  const gravar = async () => {
    if (!pendentesGravar.length) return
    const lote = pendentesGravar.splice(0)
    await pg.upsert(lote.map((dados) => ({ tipo: 'registro', entidade: ENTIDADE_PIETA, chave: dados.projectId, dados, ativo: true })))
  }

  let proximo = 0
  async function trabalhador() {
    while (!fatal && seguidas < FALHAS_SEGUIDAS_MAX) {
      if (agora() - inicio >= orcamentoMs) return
      const p = fila[proximo++]
      if (!p) return
      try {
        const d = await detalhe(p.project_id)
        pendentesGravar.push(pietaRegistroParaArmazenar(resumoPorId.get(String(p.project_id)), d, new Date(agora())))
        buscados += 1
        seguidas = 0
        if (pendentesGravar.length >= GRAVAR_A_CADA) await gravar()
      } catch (err) {
        if (err.status === 401 || err.code === 'PIETA_SEM_CREDENCIAL') fatal = err // credencial ruim: para tudo
        else { falhas += 1; seguidas += 1 }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concorrencia, fila.length) }, trabalhador))
  await gravar()
  if (fatal) throw fatal

  // Projetos que saíram do resumo deixam de contar (só com resumo preenchido, para uma resposta vazia não apagar tudo).
  let removidos = 0
  if (projetos.length) {
    const sumidos = armazenados.filter((a) => !resumoPorId.has(String(a.projectId)))
    removidos = sumidos.length
    if (sumidos.length) await pg.upsert(sumidos.map((dados) => ({ tipo: 'registro', entidade: ENTIDADE_PIETA, chave: dados.projectId, dados, ativo: false })))
  }

  const restantes = Math.max(0, fila.length - buscados - falhas)
  const resultado = {
    ok: true, totalNoResumo: projetos.length, planejados: fila.length, buscados, falhas, restantes, removidos, ms: agora() - inicio,
  }
  await pg.upsert([{
    tipo: 'estado', entidade: ENTIDADE_PIETA, chave: 'status',
    dados: { ...resultado, concluidoEm: new Date(agora()).toISOString() },
  }])
  return resultado
}

/** Lê os detalhes guardados (para as métricas) e o último estado da carga. */
export async function lerPietaArmazenada(pg) {
  const [linhas, estado] = await Promise.all([
    pg.todas('registro', ENTIDADE_PIETA, { ativos: true }),
    pg.todas('estado', ENTIDADE_PIETA),
  ])
  return { registros: linhas.map((l) => l.dados), estado: estado.find((e) => e.chave === 'status')?.dados ?? null }
}
