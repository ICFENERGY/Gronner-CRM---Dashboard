/**
 * Carga diária da SolarZ no Postgres (entidade `solarz_usinas` da tabela única):
 *  - um registro por usina com produção mensal do ano corrente e do anterior, desempenho acumulado e total investido;
 *  - estado `unidades` (UCs de todas as usinas, 1 chamada paginada) e estado `tickets` (tickets abertos, 1 chamada paginada);
 *  - estado `status` com o resultado da última execução.
 * Incremental: só reprocessa usina nova, de outro ano ou com dado mais velho que VALIDADE_MS (~20 h). Concorrência e
 * orçamento de tempo limitados; grava aos poucos. Listagem vazia ou incompleta nunca desativa nada.
 * Chamadas por usina: 2 de energia (ano e ano anterior) + 1 de desempenho + 1 de relatório (total investido).
 */
import { mapUsina } from './mappers.js'
import {
  ENTIDADE_SOLARZ, contarFarol, agruparTickets, agruparUnidades, mesAtualBrasilia, normalizarMeses, solarzRegistroParaArmazenar,
} from './solarzMetricas.js'
import { ehIndisponivel } from './solarzClient.js'

export const CONCORRENCIA = 4 // medido na API real: 177 chamadas com 4 simultâneas, sem 429 (~20 s)
export const FALHAS_SEGUIDAS_MAX = 6
export const ORCAMENTO_MS = 40000
export const VALIDADE_MS = 20 * 60 * 60 * 1000
const GRAVAR_A_CADA = 15
const MIN_COMPLEMENTO_MS = 5000
const PRAZO_COMPLEMENTO_MS = 15000
const ROTA_MORTA_APOS = 3 // 3 respostas "indisponível" sem nenhum sucesso desligam a rota na execução

/** Decide o que buscar e em que ordem: novas, depois as de outro ano, depois as mais velhas. */
export function planejarBusca(usinas, armazenados, agora = Date.now(), validadeMs = VALIDADE_MS) {
  const ano = mesAtualBrasilia(new Date(agora)).ano
  const porId = new Map(armazenados.map((r) => [String(r.solarzId), r]))
  const novas = []; const outroAno = []; const velhas = []
  for (const u of usinas) {
    const g = porId.get(String(u.id))
    if (!g) { novas.push(u); continue }
    if (g.anoCarga !== ano) { outroAno.push(u); continue }
    const idade = agora - Date.parse(g.buscadoEm)
    if (!Number.isFinite(idade) || idade > validadeMs) velhas.push(u)
  }
  const quando = (u) => Date.parse(porId.get(String(u.id))?.buscadoEm || 0) || 0
  velhas.sort((a, b) => quando(a) - quando(b))
  return [...novas, ...outroAno, ...velhas]
}

const fatal = (err) => err?.code === 'SOLARZ_SEM_CREDENCIAL' || ((err?.status === 401 || err?.status === 403) && !ehIndisponivel(err))

/**
 * @param deps.pg cliente de server/pgSql.js
 * @param deps.listarUsinas () => { itens, completo }  (itens crus de plantWithInfos/list)
 * @param deps.energia (id, ano) => lista de meses | deps.desempenho (id) | deps.relatorio (id, 'AAAA-MM', 'AAAA-MM')
 * @param deps.unidades () => { itens } | deps.tickets () => { itens }
 */
export async function sincronizarSolarz({
  pg, listarUsinas, energia, desempenho, relatorio, unidades, tickets, simples,
  agora = () => Date.now(), orcamentoMs = ORCAMENTO_MS, concorrencia = CONCORRENCIA, validadeMs = VALIDADE_MS,
}) {
  const inicio = agora()
  const lista = await listarUsinas()
  const brutas = Array.isArray(lista?.itens) ? lista.itens : []
  const usinas = brutas.filter((u) => u?.id != null).map(mapUsina)
  const hoje = mesAtualBrasilia(new Date(agora()))
  const linhasAtivas = await pg.todas('registro', ENTIDADE_SOLARZ, { ativos: true })
  const armazenados = linhasAtivas.map((l) => l.dados)

  // UCs e tickets: 1 chamada cada. Falha numa delas não derruba a carga nem apaga o que já estava guardado.
  const complementos = {}
  const gravarEstado = (chave, dados) => pg.upsert([{ tipo: 'estado', entidade: ENTIDADE_SOLARZ, chave, dados, ativo: true }])
  for (const [nome, buscar, agrupar] of [
    ['unidades', unidades, (itens) => ({ porUsina: agruparUnidades(itens) })],
    ['tickets', tickets, (itens) => agruparTickets(itens)],
    // Todas as usinas da conta (premium ou não): só id, nome e premium. As não premium não têm energia na Open API.
    ['simples', simples, (itens) => ({ usinas: itens.filter((u) => u?.id != null).map((u) => ({ id: u.id, nome: u.denominacao ?? null, premium: Boolean(u.premium), arquivada: Boolean(u.arquivada) })) })],
  ]) {
    if (!buscar) continue
    // Cada lista tem prazo próprio de até 25 s: sem orçamento, elas somadas passariam dos 60 s da função.
    const restante = orcamentoMs - (agora() - inicio)
    if (restante < MIN_COMPLEMENTO_MS) { complementos[nome] = 'sem tempo'; continue }
    try {
      const r = await buscar({ prazoMs: Math.min(restante, PRAZO_COMPLEMENTO_MS) })
      await gravarEstado(nome, { ...agrupar(Array.isArray(r?.itens) ? r.itens : []), completo: r?.completo !== false, atualizadoEm: new Date(agora()).toISOString() })
      complementos[nome] = 'ok'
    } catch (err) {
      if (fatal(err)) throw err
      complementos[nome] = ehIndisponivel(err) ? 'indisponivel' : 'falhou'
    }
  }

  // Snapshot diário do farol de monitoramento (série histórica das contagens; 1 linha por data, regravada no mesmo dia).
  const dataHoje = new Date(agora()).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  if (usinas.length && lista?.completo !== false) {
    await gravarEstado(`farol-${dataHoje}`, { data: dataHoje, total: usinas.length, contagens: contarFarol(usinas) })
  }

  const fila = planejarBusca(usinas, armazenados, agora(), validadeMs)
  const pendentesGravar = []
  let buscadas = 0; let falhas = 0; let seguidas = 0; let erroFatal = null
  const sucessos = {}; const indisp = {}
  const rotaMorta = (rota) => (indisp[rota] ?? 0) >= ROTA_MORTA_APOS && !sucessos[rota]

  /** Chama uma rota; "indisponível" vira null e conta para desligar a rota; outros erros sobem. */
  async function rota(nome, fn) {
    if (rotaMorta(nome)) return { indisponivel: true, valor: null }
    try {
      const valor = await fn()
      sucessos[nome] = (sucessos[nome] ?? 0) + 1
      return { indisponivel: false, valor }
    } catch (err) {
      if (!ehIndisponivel(err)) throw err
      indisp[nome] = (indisp[nome] ?? 0) + 1
      return { indisponivel: true, valor: null }
    }
  }

  const gravar = async () => {
    if (!pendentesGravar.length) return
    const lote = pendentesGravar.splice(0)
    await pg.upsert(lote.map((dados) => ({ tipo: 'registro', entidade: ENTIDADE_SOLARZ, chave: String(dados.solarzId), dados, ativo: true })))
  }

  async function processar(usina) {
    const anterior = hoje.ano - 1
    const indisponiveis = []
    const [a, b] = [await rota('energia', () => energia(usina.id, hoje.ano)), await rota('energia', () => energia(usina.id, anterior))]
    if (a.indisponivel && b.indisponivel) indisponiveis.push('energia')
    const d = await rota('desempenho', () => desempenho(usina.id))
    if (d.indisponivel) indisponiveis.push('desempenho')
    // Total investido: melhor esforço (não derruba a usina se o relatório falhar por motivo transitório).
    let totalInvestido = null
    if (relatorio) {
      try {
        const r = await rota('relatorio', () => relatorio(usina.id, `${anterior}-01`, `${hoje.ano}-${String(hoje.mes).padStart(2, '0')}`))
        if (r.indisponivel) indisponiveis.push('relatorio')
        else {
          const ordenado = (Array.isArray(r.valor) ? r.valor : []).filter((x) => x?.totalInvested != null).sort((x, y) => String(y.monthYear).localeCompare(String(x.monthYear)))
          totalInvestido = ordenado[0]?.totalInvested ?? null
        }
      } catch (err) {
        if (fatal(err)) throw err
      }
    }
    const meses = [...normalizarMeses(a.valor), ...normalizarMeses(b.valor)]
    return solarzRegistroParaArmazenar(usina, { meses, desempenho: d.valor, totalInvestido, indisponiveis }, new Date(agora()))
  }

  let proximo = 0
  async function trabalhador() {
    while (!erroFatal && seguidas < FALHAS_SEGUIDAS_MAX) {
      if (agora() - inicio >= orcamentoMs) return
      const u = fila[proximo++]
      if (!u) return
      try {
        pendentesGravar.push(await processar(u))
        buscadas += 1
        seguidas = 0
        if (pendentesGravar.length >= GRAVAR_A_CADA) await gravar()
      } catch (err) {
        if (fatal(err)) erroFatal = err
        else { falhas += 1; seguidas += 1 }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concorrencia, fila.length) }, trabalhador))
  await gravar()
  if (erroFatal) throw erroFatal

  // Usinas que saíram da listagem deixam de contar, mas só com listagem completa e não vazia.
  let removidas = 0
  if (usinas.length && lista?.completo !== false) {
    const noAr = new Set(usinas.map((u) => String(u.id)))
    const sumidas = armazenados.filter((r) => !noAr.has(String(r.solarzId)))
    removidas = sumidas.length
    if (sumidas.length) await pg.upsert(sumidas.map((dados) => ({ tipo: 'registro', entidade: ENTIDADE_SOLARZ, chave: String(dados.solarzId), dados, ativo: false })))
  }

  const resultado = {
    ok: true, totalNaListagem: usinas.length, listagemCompleta: lista?.completo !== false, planejadas: fila.length, buscadas, falhas,
    restantes: Math.max(0, fila.length - buscadas - falhas), removidas, complementos, ms: agora() - inicio,
  }
  await gravarEstado('status', { ...resultado, concluidoEm: new Date(agora()).toISOString() })
  return resultado
}

/** Lê o que a carga guardou: registros ativos, UCs, tickets e último estado. */
export async function lerSolarzArmazenada(pg) {
  const [linhas, estados] = await Promise.all([
    pg.todas('registro', ENTIDADE_SOLARZ, { ativos: true }),
    pg.todas('estado', ENTIDADE_SOLARZ),
  ])
  const estado = (chave) => estados.find((e) => e.chave === chave)?.dados ?? null
  const farolHistorico = estados.filter((e) => e.chave.startsWith('farol-')).map((e) => e.dados).sort((x, y) => String(x.data).localeCompare(String(y.data)))
  return { registros: linhas.map((l) => l.dados), unidades: estado('unidades'), simples: estado('simples'), tickets: estado('tickets'), estado: estado('status'), farolHistorico }
}
