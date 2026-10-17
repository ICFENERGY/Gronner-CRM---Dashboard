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
 * Trabalho limitado por rodada (registros e chamadas de detalhe): numa edição em
 * massa processa os mais antigos primeiro e avança o cursor só até onde foi, e a
 * próxima rodada continua dali.
 */
import { marcoDoStatus, mesclarProjetoComDetalhe, normalizarDataGroner } from './mappers.js'

const MARGEM_MS = 10 * 60 * 1000
const TAMANHO_PAGINA = 100
const MAX_PAGINAS = 20
const MAX_ITENS = 500
const MAX_DETALHES = 40
const PARALELO = 4

const ts = (v) => Date.parse(normalizarDataGroner(v) ?? '')

/** Executa fn em paralelo limitado, preservando a ordem. */
async function emLotes(itens, n, fn) {
  const saida = new Array(itens.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, async () => {
    while (i < itens.length) { const k = i++; saida[k] = await fn(itens[k]) }
  }))
  return saida
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

  // 1–2: alterações desde o cursor, da mais nova para a mais antiga
  const alterados = []
  let paginas = 0
  for (let p = 1; p <= MAX_PAGINAS; p++) {
    const corpo = await buscar('Projeto', { pageNumber: p, pageSize: TAMANHO_PAGINA, ordenarPor: 'DataAtualizacao_DESC' })
    paginas = p
    const lista = corpo?.list ?? []
    for (const item of lista) if (ts(item.dataUltimaAtualizacao) >= inicio) alterados.push(item)
    const ultimo = lista[lista.length - 1]
    if (!lista.length || !(ts(ultimo?.dataUltimaAtualizacao) >= inicio)) break
    if (p === MAX_PAGINAS) throw Object.assign(new Error('Alterações demais para uma rodada; rode a carga completa'), { status: 409 })
  }

  // 3: mais antigos primeiro, dentro dos limites de registros e de detalhes
  alterados.sort((a, b) => ts(a.dataUltimaAtualizacao) - ts(b.dataUltimaAtualizacao))
  const processar = []
  let detalhes = 0
  for (const item of alterados) {
    const precisaDetalhe = marcoDoStatus(item.status?.nome ?? item.etapa) != null
    if (processar.length >= maxItens || (precisaDetalhe && detalhes >= maxDetalhes)) break
    if (precisaDetalhe) detalhes++
    processar.push({ item, precisaDetalhe })
  }
  const completo = processar.length === alterados.length

  const itens = await emLotes(processar, PARALELO, async ({ item, precisaDetalhe }) => {
    if (!precisaDetalhe) return item
    const [detalhe, campos] = await Promise.all([
      buscar(`Projeto/${item.id}`).catch(() => ({})),
      buscar(`CampoPersonalizado/Projeto/${item.id}/Agrupado`).catch(() => ({})),
    ])
    // A listagem tem prioridade; do detalhe só entra o resumo do que ela não traz.
    return mesclarProjetoComDetalhe(item, detalhe, campos)
  })

  // Sem pendência, o cursor vai para agora; senão, até o último processado.
  const ultimoProcessado = processar[processar.length - 1]?.item
  const nextCursor = completo ? agora.toISOString() : new Date(ts(ultimoProcessado.dataUltimaAtualizacao)).toISOString()
  const runStartedAt = agora.toISOString()
  const resultado = await store.upsertChanges({
    entity: 'projetos',
    runId: `tick-${runStartedAt.replace(/[-:.]/g, '')}`,
    runStartedAt,
    nextCursor,
    items: itens,
  }, normalize)

  return { ...resultado, paginas, alterados: alterados.length, processados: itens.length, detalhes, pendente: !completo }
}
