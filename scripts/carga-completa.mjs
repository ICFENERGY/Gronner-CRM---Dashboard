/**
 * Carga completa direta no armazenamento do dashboard (Neon/Postgres), sem n8n.
 *
 * Uso: node --env-file=.env scripts/carga-completa.mjs [projetos propostas tarefas vendas]
 * CARGA_SEM_DETALHE=1 pula o detalhe por card (só a listagem).
 *
 * Para cada entidade busca tudo no Groner (gronerGetAll, concorrência 2, pausas, sem repetir 429), normaliza com os
 * mesmos normalizadores das rotas de sincronização e grava pelo store (upsertBatch em lotes
 * de 50 + finalize). Em projetos, busca detalhe e campos personalizados só dos cards com
 * marco da Engenharia (como server/syncTick.js). Imprime só contagens e tempos.
 */
import { gronerGet, gronerGetAll } from '../server/gronerClient.js'
import { dealsEnriquecido, salesEnriquecido } from '../server/enrichment.js'
import { mapProjetoParaArmazenar, mapProposta, mapTarefa, mapVenda, marcoDoStatus, mesclarProjetoComDetalhe } from '../server/mappers.js'
import { stripSensitive } from '../server/sanitize.js'
import { getSyncStore } from '../server/syncStore.js'

const ENTIDADES = {
  projetos: { recurso: 'Projeto', normalizar: (i) => mapProjetoParaArmazenar(i, dealsEnriquecido) },
  propostas: { recurso: 'PreProposta', normalizar: mapProposta },
  tarefas: { recurso: 'Tarefa', normalizar: mapTarefa },
  vendas: { recurso: 'Venda', normalizar: (i) => mapVenda(i, salesEnriquecido) },
}
const TAMANHO_LOTE = 50
// O Groner aceita cerca de 20 pedidos por 1,5 s (~13/s): concorrência 2 + pausa por página fica em ~3 a 5/s.
// Lotes de 500 itens (25 páginas de 20) com pausa longa entre eles; 429 para tudo na hora (sem nova tentativa).
const CONCORRENCIA = Number(process.env.CARGA_CONCORRENCIA) || 2
const PAUSA_MS = Number(process.env.CARGA_PAUSA_MS) || 250
const PAUSA_LOTE_MS = Number(process.env.CARGA_PAUSA_LOTE_MS) || 5000
const SEM_DETALHE = process.env.CARGA_SEM_DETALHE === '1'
const OPC = { timeoutMs: 60000, retries: 1, retryDelayMs: 2000, parar429: true }
let falhasDetalhe = 0
const tolerante = () => { falhasDetalhe++; return {} }

async function emLotes(itens, n, fn) {
  const saida = new Array(itens.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, async () => {
    while (i < itens.length) { const k = i++; saida[k] = await fn(itens[k]) }
  }))
  return saida
}

async function detalharProjetos(itens) {
  const precisa = itens.filter((item) => marcoDoStatus(item.status?.nome ?? item.etapa) != null).length
  const detalhados = await emLotes(itens, CONCORRENCIA, async (item) => {
    if (marcoDoStatus(item.status?.nome ?? item.etapa) == null) return item
    const [detalhe, campos] = await Promise.all([
      gronerGet(`Projeto/${item.id}`, {}, OPC).catch(tolerante),
      gronerGet(`CampoPersonalizado/Projeto/${item.id}/Agrupado`, {}, OPC).catch(tolerante),
    ])
    // A listagem tem prioridade; do detalhe só entra o resumo do que ela não traz.
    return mesclarProjetoComDetalhe(item, detalhe, campos)
  })
  return { itens: detalhados, comDetalhe: precisa }
}

const store = getSyncStore()
const pedidas = process.argv.slice(2)
const nomes = pedidas.length ? pedidas : Object.keys(ENTIDADES)

for (const entity of nomes) {
  const def = ENTIDADES[entity]
  if (!def) { console.error(`Entidade desconhecida: ${entity}`); process.exitCode = 1; continue }
  const t0 = Date.now()
  const inicio = new Date()
  const runStartedAt = inicio.toISOString()
  const runId = `${entity}-${runStartedAt.replace(/[-:.]/g, '')}`
  const normalize = (item) => stripSensitive(def.normalizar(item))

  let { items } = await gronerGetAll(def.recurso, {}, { pageSize: 500, maxItems: 100000, concurrency: CONCORRENCIA, pausaMs: PAUSA_MS, pausaACadaPaginas: 25, pausaLongaMs: PAUSA_LOTE_MS, ...OPC })
  let comDetalhe = 0
  if (entity === 'projetos' && !SEM_DETALHE) ({ itens: items, comDetalhe } = await detalharProjetos(items))
  const tBusca = Date.now() - t0

  const expectedTotal = items.length
  const batchCount = Math.max(1, Math.ceil(expectedTotal / TAMANHO_LOTE))
  const soma = { inserted: 0, updated: 0, unchanged: 0 }
  for (let b = 1; b <= batchCount; b++) {
    const lote = items.slice((b - 1) * TAMANHO_LOTE, b * TAMANHO_LOTE)
    const r = await store.upsertBatch({ entity, runId, runStartedAt, batchIndex: b, batchCount, expectedTotal, items: lote }, normalize)
    soma.inserted += Number(r.inserted || 0)
    soma.updated += Number(r.updated || 0)
    soma.unchanged += Number(r.unchanged || 0)
  }
  const fim = await store.finalize({ entity, runId, runStartedAt, batchCount, expectedTotal })
  const { entity: _e, runId: _r, ...resumoFim } = fim ?? {}
  console.log(JSON.stringify({
    entity, total: expectedTotal, ...soma, comDetalhe, falhasDetalhe,
    removidos: fim?.softDeleted ?? fim?.removed ?? fim?.deleted ?? fim?.removidos ?? null,
    buscaMs: tBusca, totalMs: Date.now() - t0, finalize: resumoFim,
  }))
}
