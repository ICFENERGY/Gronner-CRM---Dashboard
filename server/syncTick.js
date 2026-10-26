/**
 * Atualização incremental de projetos rodando no próprio dashboard (substitui
 * o fluxo de 5 minutos do n8n). Um agendador externo chama a rota a cada
 * 5 minutos; cada chamada:
 *
 * 1. lê o cursor (até onde a última rodada foi);
 * 2. pagina o /Projeto ordenado por DataAtualizacao_DESC até passar do cursor
 *    (menos 10 min de margem) — datas do Groner vêm em Brasília sem offset;
 * 3. busca detalhe e campos personalizados só dos cards com marco da Engenharia;
 * 4. grava pelo mesmo upsertChanges (trava, hash e histórico de status).
 *
 * Se as alterações passam do teto de páginas/tempo, em vez de falhar processa as mais antigas
 * das já buscadas (truncado: true; as ainda mais antigas, fora da janela buscada, só a carga
 * completa recupera).
 *
 * Trabalho limitado por rodada (registros e chamadas de detalhe): numa edição em
 * massa processa os mais antigos primeiro e avança o cursor só até onde foi, e a
 * próxima rodada continua dali.
 */
import { marcoDoStatus, mesclarProjetoComDetalhe, normalizarDataGroner } from './mappers.js'

const MARGEM_MS = 10 * 60 * 1000
const TAMANHO_PAGINA = 100 // pedido; o Groner devolve no máximo 20 por página
const MAX_PAGINAS = 60
const MAX_ITENS = 1200
const MAX_DETALHES = 40
const PARALELO = 4
const PAGINAS_EM_PARALELO = 6
const ORCAMENTO_BUSCA_MS = 20000 // depois disso não inicia ondas novas de páginas
const PRAZO_DETALHES_MS = 24000 // depois disso não inicia mais detalhes (com timeout de 10 s + 1 nova tentativa, o tick fica em ~45 s)

const ts = (v) => Date.parse(normalizarDataGroner(v) ?? '')

/** Executa fn em paralelo limitado, preservando a ordem. */
async function emLotes(itens, n, fn, prazo = () => false) {
  const saida = new Array(itens.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, async () => {
    while (i < itens.length && !prazo()) { const k = i++; saida[k] = await fn(itens[k]) }
  }))
  // só o prefixo já iniciado (a ordem é preservada; o resto fica para a próxima rodada)
  return saida.slice(0, i)
}

/**
 * @param store syncStore (cursor, upsertChanges)
 * @param normalize item bruto → registro normalizado (mapProjeto + stripSensitive)
 * @param buscar (recurso, params) → Content do Groner
 */
export async function sincronizarAlteracoes({ store, normalize, buscar, agora = new Date(), limites = {} }) {
  const maxItens = limites.maxItens ?? MAX_ITENS
  const maxDetalhes = limites.maxDetalhes ?? MAX_DETALHES
  const cursor = await store.cursor('projetos')
  const inicio = (cursor ? Date.parse(cursor) : agora.getTime()) - MARGEM_MS

  // 1–2: alterações desde o cursor, da mais nova para a mais antiga. A página real
  // (≤ 20 itens) e o totalPages vêm da resposta; busca em ondas de páginas paralelas.
  const alteradosBrutos = []
  const t0 = Date.now()
  const maxPaginas = limites.maxPaginas ?? MAX_PAGINAS
  const orcamentoMs = limites.orcamentoBuscaMs ?? ORCAMENTO_BUSCA_MS
  let paginas = 0
  let truncado = false
  let totalPaginas = Infinity
  const pedir = (p) => buscar('Projeto', { pageNumber: p, pageSize: TAMANHO_PAGINA, ordenarPor: 'DataAtualizacao_DESC' })
  let proxima = 1
  let fim = false
  while (!fim) {
    const ondaFim = Math.min(proxima === 1 ? 1 : proxima + PAGINAS_EM_PARALELO - 1, maxPaginas, totalPaginas)
    const numeros = []
    for (let p = proxima; p <= ondaFim; p++) numeros.push(p)
    const corpos = await Promise.all(numeros.map(pedir))
    for (let k = 0; k < corpos.length; k++) {
      const corpo = corpos[k]
      const lista = corpo?.list ?? []
      if (numeros[k] === 1) {
        const tp = Number(corpo?.totalPages)
        if (Number.isFinite(tp) && tp >= 1) totalPaginas = tp
        else if (lista.length && Number.isFinite(Number(corpo?.totalItems))) totalPaginas = Math.ceil(Number(corpo.totalItems) / lista.length)
      }
      paginas = numeros[k]
      for (const item of lista) if (ts(item.dataUltimaAtualizacao) >= inicio) alteradosBrutos.push(item)
      const ultimo = lista[lista.length - 1]
      if (!lista.length || !(ts(ultimo?.dataUltimaAtualizacao) >= inicio)) { fim = true; break }
    }
    proxima = ondaFim + 1
    if (!fim && proxima > totalPaginas) fim = true
    // Passou do teto de páginas ou do orçamento de tempo sem chegar ao cursor: segue com o que já veio.
    if (!fim && (proxima > maxPaginas || Date.now() - t0 > orcamentoMs)) { truncado = true; fim = true }
  }

  // 3: mais antigos primeiro, dentro dos limites de registros e de detalhes
  // sem ids repetidos (a paginação mexe durante a busca): o lote não aceita ids duplicados
  const vistos = new Set()
  const alterados = alteradosBrutos.filter((item) => !vistos.has(item.id) && vistos.add(item.id))
  alterados.sort((a, b) => ts(a.dataUltimaAtualizacao) - ts(b.dataUltimaAtualizacao))
  const processar = []
  let detalhes = 0
  for (const item of alterados) {
    const precisaDetalhe = marcoDoStatus(item.status?.nome ?? item.etapa) != null
    if (processar.length >= maxItens || (precisaDetalhe && detalhes >= maxDetalhes)) break
    if (precisaDetalhe) detalhes++
    processar.push({ item, precisaDetalhe })
  }

  const itensProcessados = await emLotes(processar, PARALELO, async ({ item, precisaDetalhe }) => {
    if (!precisaDetalhe) return item
    const [detalhe, campos] = await Promise.all([
      buscar(`Projeto/${item.id}`).catch(() => ({})),
      buscar(`CampoPersonalizado/Projeto/${item.id}/Agrupado`).catch(() => ({})),
    ])
    // A listagem tem prioridade; do detalhe só entra o resumo do que ela não traz.
    return mesclarProjetoComDetalhe(item, detalhe, campos)
  }, () => Date.now() - t0 > (limites.prazoDetalhesMs ?? PRAZO_DETALHES_MS))
  const itens = itensProcessados
  const completo = itens.length === alterados.length && !truncado

  // Sem pendência, o cursor vai para agora; senão, até o último processado.
  // Truncado (não chegou ao cursor anterior): NÃO avança, para a próxima rodada não pular nada; os itens
  // processados são gravados do mesmo jeito (o upsert é idempotente).
  const ultimoProcessado = processar[itens.length - 1]?.item
  const nextCursor = truncado
    ? undefined
    : completo ? agora.toISOString()
      : ultimoProcessado ? new Date(ts(ultimoProcessado.dataUltimaAtualizacao)).toISOString() : undefined
  const runStartedAt = agora.toISOString()
  const resultado = await store.upsertChanges({
    entity: 'projetos',
    runId: `tick-${runStartedAt.replace(/[-:.]/g, '')}`,
    runStartedAt,
    nextCursor,
    items: itens,
  }, normalize)

  return { ...resultado, paginas, alterados: alterados.length, processados: itens.length, detalhes, pendente: !completo, truncado }
}
