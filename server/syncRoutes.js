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
  return gronerGet(recurso, params)
}

export function createSyncRouter({ store = getSyncStore(), onFinalized = () => {}, onChanged = () => {}, buscarGroner = buscarGronerPadrao } = {}) {
  const router = express.Router()

  // Atualização de 5 minutos dentro do dashboard, chamada por um agendador externo.
  router.all('/projetos/tick', authenticateTick, async (_req, res) => {
    try {
      const result = await sincronizarAlteracoes({ store, normalize: (item) => stripSensitive(normalizers.projetos(item)), buscar: buscarGroner })
      if (houveMudanca(result)) onChanged('projetos')
      console.info('[sync] tick', { runId: result.runId, alterados: result.alterados, processados: result.processados, detalhes: result.detalhes, pendente: result.pendente, skipped: result.skipped })
      res.json({ ok: true, runId: result.runId, skipped: Boolean(result.skipped), alterados: result.alterados, processados: result.processados, detalhes: result.detalhes, pendente: result.pendente, inserted: result.inserted, updated: result.updated, unchanged: result.unchanged })
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
