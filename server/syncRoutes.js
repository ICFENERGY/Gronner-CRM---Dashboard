import crypto from 'node:crypto'
import express from 'express'
import { mapProjetoParaArmazenar, mapProposta, mapTarefa, mapVenda } from './mappers.js'
import { dealsEnriquecido, salesEnriquecido } from './enrichment.js'
import { stripSensitive } from './sanitize.js'
import { getSyncStatuses, getSyncStore, syncStorageConfigured } from './syncStore.js'
import { sincronizarAlteracoes } from './syncTick.js'

const normalizers = {
  projetos: (item) => mapProjetoParaArmazenar(item, dealsEnriquecido),
  tarefas: mapTarefa,
  propostas: mapProposta,
  vendas: (item) => mapVenda(item, salesEnriquecido),
}

function safeEqual(received, expected) {
  const left = Buffer.from(String(received || ''), 'utf8')
  const right = Buffer.from(String(expected || ''), 'utf8')
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

function authenticate(req, res, next) {
  const expected = process.env.GRONER_SYNC_TOKEN
  if (!expected || !syncStorageConfigured()) {
    return res.status(503).json({ error: 'Sincronização ainda não configurada' })
  }
  if (!safeEqual(req.get('X-Groner-Sync-Token'), expected)) {
    return res.status(401).json({ error: 'Credencial de sincronização inválida' })
  }
  next()
}

/** Como authenticate, mas aceita a chave também em ?key= (agendadores que só configuram URL). */
function authenticateTick(req, res, next) {
  const expected = process.env.GRONER_SYNC_TOKEN
  if (!expected || !syncStorageConfigured()) {
    return res.status(503).json({ error: 'Sincronização ainda não configurada' })
  }
  if (!safeEqual(req.get('X-Groner-Sync-Token') || req.query.key, expected)) {
    return res.status(401).json({ error: 'Credencial de sincronização inválida' })
  }
  next()
}

/** Chave de sincronização (cabeçalho ou ?key=) ou Authorization: Bearer <CRON_SECRET> (Vercel Cron). */
function authenticateCompleta(req, res, next) {
  const expected = process.env.GRONER_SYNC_TOKEN
  const cron = process.env.CRON_SECRET
  if ((!expected && !cron) || !syncStorageConfigured()) {
    return res.status(503).json({ error: 'Sincronização ainda não configurada' })
  }
  const bearer = /^Bearer (.+)$/.exec(req.get('Authorization') || '')?.[1]
  const okChave = expected && safeEqual(req.get('X-Groner-Sync-Token') || req.query.key, expected)
  const okCron = cron && bearer && safeEqual(bearer, cron)
  if (!okChave && !okCron) return res.status(401).json({ error: 'Credencial de sincronização inválida' })
  next()
}

const RECURSOS_COMPLETA = { propostas: 'PreProposta', tarefas: 'Tarefa', vendas: 'Venda' }
const TAMANHO_LOTE = 50
const LOTES_EM_PARALELO = 4
const OPC_COMPLETA = { timeoutMs: 10000, retries: 1, retryDelayMs: 500 }
const PISO_ATIVOS = 0.9

/** Busca tudo de um recurso (gronerGetAll), carregada só quando usada. Devolve { items, totalItems }. */
async function buscarTudoPadrao(recurso) {
  const { gronerGetAll } = await import('./gronerClient.js')
  const { items, totalItems } = await gronerGetAll(recurso, {}, { pageSize: 500, maxItems: 100000, concurrency: 12, ...OPC_COMPLETA })
  return { items, totalItems }
}

/**
 * Confere a busca ANTES de gravar qualquer coisa: a finalização faz soft delete do que não veio,
 * então busca incompleta nunca pode chegar ao armazenamento. Lança erro 502 com motivo claro.
 */
export function validarBuscaCompleta({ items, totalItems }, ativosNoBanco = 0) {
  const falha = (msg) => Object.assign(new Error(msg), { status: 502 })
  if (!Array.isArray(items) || items.length === 0) throw falha('Carga abortada: o Groner devolveu lista vazia')
  if (!Number.isFinite(Number(totalItems)) || items.length !== Number(totalItems)) {
    throw falha(`Carga abortada: vieram ${items.length} itens, mas o Groner informa ${totalItems}`)
  }
  const ids = new Set(items.map((i) => i?.id))
  if (ids.size !== items.length) throw falha('Carga abortada: ids repetidos na busca do Groner')
  if (ativosNoBanco > 0 && items.length < ativosNoBanco * PISO_ATIVOS) {
    throw falha(`Carga abortada: ${items.length} itens é menos de 90% dos ${ativosNoBanco} ativos atuais`)
  }
}

async function ativosAtuais(store, entity) {
  try {
    const status = await store.status?.(entity)
    if (Number.isFinite(Number(status?.activeTotal))) return Number(status.activeTotal)
    const carga = await store.load?.(entity)
    return Number(carga?.totalItems) || 0
  } catch {
    return 0
  }
}

function entityFrom(req) {
  const entity = req.params.entity
  if (!normalizers[entity]) throw Object.assign(new Error('Entidade de sincronização desconhecida'), { status: 404 })
  if (req.body?.entity !== entity) throw Object.assign(new Error('Entidade da URL diverge do corpo'), { status: 400 })
  return entity
}

function publicError(err) {
  if (err?.status && err.status < 500) return err.message
  return 'Não foi possível processar a sincronização'
}

/** Só invalida o cache do dashboard quando algo foi gravado (poupa releitura completa do armazenamento). */
function houveMudanca(result) {
  return !result.skipped && (Number(result.inserted) || 0) + (Number(result.updated) || 0) > 0
}

/** Busca no Groner, carregada só quando usada (o cliente exige as variáveis do Groner). */
async function buscarGronerPadrao(recurso, params) {
  const { gronerGet } = await import('./gronerClient.js')
  return gronerGet(recurso, params, { timeoutMs: 10000, retries: 1, retryDelayMs: 300 })
}

/** Carga dos detalhes da Pieta, carregada só quando usada. Sem credencial ou sem Postgres não grava nada. */
async function sincronizarPietaPadrao() {
  const { pietaConfigurada, pietaResumo, pietaDetalheProjeto } = await import('./pietaClient.js')
  if (!pietaConfigurada()) return { ok: false, motivo: 'sem credencial' }
  const { getPgSql } = await import('./pgSql.js')
  const pg = getPgSql()
  if (!pg) return { ok: false, motivo: 'sem armazenamento Postgres' }
  const { sincronizarPieta } = await import('./pietaSync.js')
  return sincronizarPieta({ pg, resumo: () => pietaResumo(), detalhe: (id) => pietaDetalheProjeto(id) })
}

export function createSyncRouter({ store = getSyncStore(), onFinalized = () => {}, onChanged = () => {}, buscarGroner = buscarGronerPadrao, buscarTudo = buscarTudoPadrao, sincronizarPieta = sincronizarPietaPadrao } = {}) {
  const router = express.Router()

  /** Carga completa de uma entidade numa chamada: busca tudo, upsertBatch em lotes de 50 e finalize. */
  async function cargaCompleta(entity) {
    const t0 = Date.now()
    const runStartedAt = new Date().toISOString()
    const runId = `${entity}-${runStartedAt.replace(/[-:.]/g, '')}`
    const normalize = (item) => stripSensitive(normalizers[entity](item))
    const busca = await buscarTudo(RECURSOS_COMPLETA[entity])
    const tBusca = Date.now() - t0
    const items = Array.isArray(busca) ? busca : busca.items
    validarBuscaCompleta(Array.isArray(busca) ? { items, totalItems: items.length } : busca, await ativosAtuais(store, entity))
    const tGrava0 = Date.now()
    const expectedTotal = items.length
    const batchCount = Math.max(1, Math.ceil(expectedTotal / TAMANHO_LOTE))
    const soma = { inserted: 0, updated: 0, unchanged: 0 }
    // Lotes em ondas paralelas (cada lote tem a própria trava): cabe no limite de 60 s da função.
    for (let ini = 1; ini <= batchCount; ini += LOTES_EM_PARALELO) {
      const numeros = Array.from({ length: Math.min(LOTES_EM_PARALELO, batchCount - ini + 1) }, (_, k) => ini + k)
      const respostas = await Promise.all(numeros.map((b) => store.upsertBatch({
        entity, runId, runStartedAt, batchIndex: b, batchCount, expectedTotal,
        items: items.slice((b - 1) * TAMANHO_LOTE, b * TAMANHO_LOTE),
      }, normalize)))
      for (const r of respostas) for (const k of Object.keys(soma)) soma[k] += Number(r?.[k] || 0)
    }
    const fim = await store.finalize({ entity, runId, runStartedAt, batchCount, expectedTotal })
    onFinalized(entity)
    return { entity, total: expectedTotal, ...soma, removidos: fim?.softDeleted ?? 0, msBusca: tBusca, msGravacao: Date.now() - tGrava0, ms: Date.now() - t0 }
  }

  // Atualização diária (Vercel Cron): uma entidade por chamada, ou as três em sequência.
  router.all('/completa/:entity', authenticateCompleta, async (req, res) => {
    try {
      const entity = req.params.entity
      if (!RECURSOS_COMPLETA[entity]) throw Object.assign(new Error('Entidade desconhecida; use propostas, tarefas ou vendas'), { status: 404 })
      const resultado = await cargaCompleta(entity)
      console.info('[sync] carga completa', resultado)
      res.json({ ok: true, ...resultado })
    } catch (err) {
      console.error('[sync] carga completa falhou:', err.message)
      res.status(err.status || 500).json({ error: publicError(err) })
    }
  })

  router.all('/completa', authenticateCompleta, async (_req, res) => {
    const resultados = []
    for (const entity of Object.keys(RECURSOS_COMPLETA)) {
      try {
        resultados.push(await cargaCompleta(entity))
      } catch (err) {
        console.error(`[sync] carga completa de ${entity} falhou:`, err.message)
        resultados.push({ entity, erro: publicError(err) })
      }
    }
    res.status(resultados.some((r) => r.erro) ? 500 : 200).json({ ok: !resultados.some((r) => r.erro), resultados })
  })

  // Carga diária dos detalhes da Pieta (Vercel Cron). Sem credencial: 200 com ok:false e nada é gravado.
  router.all('/pieta', authenticateCompleta, async (_req, res) => {
    try {
      const resultado = await sincronizarPieta()
      console.info('[sync] pieta', resultado)
      res.json(resultado)
    } catch (err) {
      console.error('[sync] pieta falhou:', err.message)
      const cliente = err.status && err.status < 500
      res.status(cliente ? err.status : 502).json({ error: cliente ? err.message : 'Não foi possível sincronizar a Pieta' })
    }
  })

  // Atualização de 5 minutos dentro do dashboard, chamada por um agendador externo.
  router.all('/projetos/tick', authenticateTick, async (_req, res) => {
    try {
      const result = await sincronizarAlteracoes({ store, normalize: (item) => stripSensitive(normalizers.projetos(item)), buscar: buscarGroner })
      if (houveMudanca(result)) onChanged('projetos')
      console.info('[sync] tick', { runId: result.runId, alterados: result.alterados, processados: result.processados, detalhes: result.detalhes, pendente: result.pendente, truncado: result.truncado, skipped: result.skipped })
      res.json({ ok: true, runId: result.runId, skipped: Boolean(result.skipped), alterados: result.alterados, processados: result.processados, detalhes: result.detalhes, pendente: result.pendente, truncado: Boolean(result.truncado), inserted: result.inserted, updated: result.updated, unchanged: result.unchanged })
    } catch (err) {
      console.error('[sync] tick falhou:', err.message)
      res.status(err.status || 500).json({ error: publicError(err) })
    }
  })

  router.get('/status', async (_req, res) => {
    try {
      res.json(await getSyncStatuses())
    } catch (err) {
      console.error('[sync] falha ao consultar status:', err.message)
      res.status(503).json({ configured: syncStorageConfigured(), entities: {}, error: 'Status indisponível' })
    }
  })

  router.post('/:entity/batches', authenticate, async (req, res) => {
    try {
      const entity = entityFrom(req)
      const result = await store.upsertBatch(req.body, (item) => stripSensitive(normalizers[entity](item)))
      console.info('[sync] lote aceito', {
        entity,
        runId: result.runId,
        batchIndex: result.batchIndex,
        received: result.received,
        inserted: result.inserted,
        updated: result.updated,
        unchanged: result.unchanged,
      })
      res.json(result)
    } catch (err) {
      console.error('[sync] lote rejeitado:', err.message)
      res.status(err.status || 500).json({ error: publicError(err) })
    }
  })

  router.get('/:entity/cursor', authenticate, async (req, res) => {
    try {
      if (!normalizers[req.params.entity]) throw Object.assign(new Error('Entidade de sincronização desconhecida'), { status: 404 })
      res.json({ entity: req.params.entity, cursor: await store.cursor(req.params.entity) })
    } catch (err) {
      res.status(err.status || 500).json({ error: publicError(err) })
    }
  })

  router.post('/:entity/changes', authenticate, async (req, res) => {
    try {
      const entity = entityFrom(req)
      const result = await store.upsertChanges(req.body, (item) => stripSensitive(normalizers[entity](item)))
      if (houveMudanca(result)) onChanged(entity)
      console.info('[sync] alterações aceitas', { entity, runId: result.runId, received: result.received, updated: result.updated, skipped: result.skipped })
      res.json(result)
    } catch (err) {
      console.error('[sync] alterações rejeitadas:', err.message)
      res.status(err.status || 500).json({ error: publicError(err) })
    }
  })

  router.post('/:entity/finalize', authenticate, async (req, res) => {
    try {
      const entity = entityFrom(req)
      const result = await store.finalize(req.body)
      onFinalized(entity)
      console.info('[sync] carga finalizada', {
        entity,
        runId: result.runId,
        activeTotal: result.activeTotal,
        inserted: result.inserted,
        updated: result.updated,
        unchanged: result.unchanged,
        softDeleted: result.softDeleted,
      })
      res.json(result)
    } catch (err) {
      console.error('[sync] finalização rejeitada:', err.message)
      res.status(err.status || 500).json({ error: publicError(err) })
    }
  })

  return router
}
