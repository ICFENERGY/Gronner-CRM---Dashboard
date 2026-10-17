/**
 * Carga completa direta no armazenamento do dashboard (Neon/Postgres), sem n8n.
 *
 * Uso: node --env-file=.env scripts/carga-completa.mjs [projetos propostas tarefas vendas]
 *
 * Para cada entidade busca tudo no Groner (gronerGetAll, concorrência 12), normaliza com os
 * mesmos normalizadores das rotas de sincronização e grava pelo store (upsertBatch em lotes
 * de 50 + finalize). Em projetos, busca detalhe e campos personalizados só dos cards com
 * marco da Engenharia (como server/syncTick.js). Imprime só contagens e tempos.
 */
import { gronerGet, gronerGetAll } from '../server/gronerClient.js'
import { dealsEnriquecido, salesEnriquecido } from '../server/enrichment.js'
import { mapProjeto, mapProposta, mapTarefa, mapVenda, marcoDoStatus } from '../server/mappers.js'
import { stripSensitive } from '../server/sanitize.js'
import { getSyncStore } from '../server/syncStore.js'

const ENTIDADES = {
  projetos: { recurso: 'Projeto', normalizar: (i) => mapProjeto(i, dealsEnriquecido) },
  propostas: { recurso: 'PreProposta', normalizar: mapProposta },
  tarefas: { recurso: 'Tarefa', normalizar: mapTarefa },
  vendas: { recurso: 'Venda', normalizar: (i) => mapVenda(i, salesEnriquecido) },
}
const TAMANHO_LOTE = 50
const CONCORRENCIA = 12

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
      gronerGet(`Projeto/${item.id}`).catch(() => ({})),
      gronerGet(`CampoPersonalizado/Projeto/${item.id}/Agrupado`).catch(() => ({})),
    ])
    return { ...item, ...(detalhe ?? {}), camposPersonalizados: campos ?? {} }
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

  let { items } = await gronerGetAll(def.recurso, {}, { pageSize: 500, maxItems: 100000, concurrency: CONCORRENCIA })
  let comDetalhe = 0
  if (entity === 'projetos') ({ itens: items, comDetalhe } = await detalharProjetos(items))
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
    entity, total: expectedTotal, ...soma, comDetalhe,
    removidos: fim?.removed ?? fim?.deleted ?? fim?.removidos ?? null,
    buscaMs: tBusca, totalMs: Date.now() - t0, finalize: resumoFim,
  }))
}
