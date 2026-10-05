import crypto from 'node:crypto'
import express from 'express'
import { mapProjeto, mapProposta, mapTarefa, mapVenda } from './mappers.js'
import { dealsEnriquecido, salesEnriquecido } from './enrichment.js'
import { stripSensitive } from './sanitize.js'
import { getSyncStatuses, getSyncStore, syncStorageConfigured } from './syncStore.js'

const normalizers = {
  projetos: (item) => mapProjeto(item, dealsEnriquecido),
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

export function createSyncRouter({ store = getSyncStore(), onFinalized = () => {} } = {}) {
  const router = express.Router()

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
