import crypto from 'node:crypto'
import { Redis } from '@upstash/redis'

const PREFIX = 'groner-dashboard:sync:v1'
const RUN_TTL_SECONDS = 2 * 24 * 60 * 60
const CHANGES_LOCK_SECONDS = 4 * 60
const ENTITIES = new Set(['projetos', 'tarefas', 'propostas', 'vendas'])

let redisSingleton

export function syncStorageConfigured() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
}

function defaultRedis() {
  if (!syncStorageConfigured()) return null
  if (!redisSingleton) {
    redisSingleton = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
      retry: { retries: 3, backoff: (count) => Math.min(1000, 50 * 2 ** count) },
      signal: () => AbortSignal.timeout(8000),
    })
  }
  return redisSingleton
}

function assertEntity(entity) {
  if (!ENTITIES.has(entity)) throw Object.assign(new Error('Entidade de sincronização desconhecida'), { status: 400 })
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
  }
  return value
}

export function canonicalHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex')
}

function keys(entity, runId) {
  const run = `${PREFIX}:run:${entity}:${runId}`
  return {
    current: `${PREFIX}:current:${entity}`,
    hashes: `${PREFIX}:hashes:${entity}`,
    records: `${PREFIX}:records:${entity}`,
    history: `${PREFIX}:history:${entity}`,
    active: `${PREFIX}:active:${entity}`,
    status: `${PREFIX}:status:${entity}`,
    cursor: `${PREFIX}:cursor:${entity}`,
    activityLock: `${PREFIX}:activity-lock:${entity}`,
    run,
    final: `${run}:final`,
    lock: (batchIndex) => `${run}:lock:${batchIndex}`,
    batch: (batchIndex) => `${run}:batch:${batchIndex}`,
    result: (batchIndex) => `${run}:result:${batchIndex}`,
  }
}

function validateChanges(input) {
  assertEntity(input.entity)
  if (!/^[a-z]+-[0-9TZ]+$/i.test(input.runId || '')) throw Object.assign(new Error('runId inválido'), { status: 400 })
  asTimestamp(input.runStartedAt, 'runStartedAt')
  if (!Array.isArray(input.items) || input.items.length > 500) {
    throw Object.assign(new Error('items deve conter no máximo 500 registros'), { status: 400 })
  }
  if (input.nextCursor != null && !Number.isFinite(Date.parse(input.nextCursor))) {
    throw Object.assign(new Error('nextCursor inválido'), { status: 400 })
  }
}

function asTimestamp(value, field) {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) throw Object.assign(new Error(`${field} inválido`), { status: 400 })
  return timestamp
}

function validateBatch(input) {
  assertEntity(input.entity)
  if (!/^[a-z]+-[0-9TZ]+$/i.test(input.runId || '')) throw Object.assign(new Error('runId inválido'), { status: 400 })
  asTimestamp(input.runStartedAt, 'runStartedAt')
  for (const field of ['batchIndex', 'batchCount', 'expectedTotal']) {
    if (!Number.isInteger(input[field]) || input[field] < (field === 'expectedTotal' ? 0 : 1)) {
      throw Object.assign(new Error(`${field} inválido`), { status: 400 })
    }
  }
  if (input.batchIndex > input.batchCount) throw Object.assign(new Error('batchIndex maior que batchCount'), { status: 400 })
  if (!Array.isArray(input.items) || input.items.length > 50) {
    throw Object.assign(new Error('items deve conter no máximo 50 registros'), { status: 400 })
  }
}

function validateFinalize(input) {
  assertEntity(input.entity)
  if (!/^[a-z]+-[0-9TZ]+$/i.test(input.runId || '')) throw Object.assign(new Error('runId inválido'), { status: 400 })
  asTimestamp(input.runStartedAt, 'runStartedAt')
  for (const field of ['batchCount', 'expectedTotal']) {
    if (!Number.isInteger(input[field]) || input[field] < (field === 'expectedTotal' ? 0 : 1)) {
      throw Object.assign(new Error(`${field} inválido`), { status: 400 })
    }
  }
}

export function createSyncStore(redis = defaultRedis()) {
  const requireRedis = () => {
    if (!redis) throw Object.assign(new Error('Armazenamento de sincronização não configurado'), { status: 503 })
    return redis
  }

  return {
    async upsertChanges(input, normalize) {
      validateChanges(input)
      const client = requireRedis()
      const k = keys(input.entity, 'changes')
      const resultKey = `${PREFIX}:changes:${input.entity}:${input.runId}`
      const previous = await client.get(resultKey)
      if (previous) return previous

      const owner = `changes:${input.runId}`
      const fullOwner = await client.get(k.activityLock)
      if (fullOwner && fullOwner !== owner) return { ok: true, skipped: true, reason: 'sync_locked', runId: input.runId, entity: input.entity }
      const locked = await client.set(k.activityLock, owner, { nx: true, ex: CHANGES_LOCK_SECONDS })
      if (!locked) return { ok: true, skipped: true, reason: 'sync_locked', runId: input.runId, entity: input.entity }

      try {
        const normalized = input.items.map((item) => {
          const record = normalize(item)
          const sourceId = record?.id ?? record?.Id
          if (sourceId == null || !Number.isFinite(Number(sourceId))) throw Object.assign(new Error('Registro sem id numérico'), { status: 400 })
          return { ...record, id: Number(sourceId) }
        })
        const ids = normalized.map((record) => String(record.id))
        if (new Set(ids).size !== ids.length) throw Object.assign(new Error('IDs duplicados no lote'), { status: 400 })
        const currentHashes = ids.length ? (await client.hmget(k.hashes, ...ids) || {}) : {}
        const currentRecords = ids.length ? (await client.hmget(k.records, ...ids) || {}) : {}
        const currentHistory = ids.length ? (await client.hmget(k.history, ...ids) || {}) : {}
        const hashes = normalized.map(canonicalHash)
        const historyUpdates = {}
        let inserted = 0; let updated = 0; let unchanged = 0
        const recordMap = {}
        const hashMap = {}
        normalized.forEach((record, index) => {
          const id = ids[index]
          const previousHash = currentHashes?.[id]
          if (previousHash == null) inserted += 1
          else if (previousHash === hashes[index]) unchanged += 1
          else updated += 1
          recordMap[id] = record
          hashMap[id] = hashes[index]
          if (input.entity === 'projetos' && previousHash != null) {
            const previousRecord = typeof currentRecords[id] === 'string' ? JSON.parse(currentRecords[id]) : currentRecords[id]
            const statusAnterior = previousRecord?.etapa ?? previousRecord?.status ?? null
            const statusNovo = record.etapa ?? record.status ?? null
            if (statusAnterior !== statusNovo) {
              const oldHistory = currentHistory?.[id] ? (typeof currentHistory[id] === 'string' ? JSON.parse(currentHistory[id]) : currentHistory[id]) : []
              historyUpdates[id] = [...oldHistory, { id: Number(record.id), statusAnterior, statusNovo, em: input.runStartedAt }]
            }
          }
        })
        const cursor = input.nextCursor ?? await client.get(k.cursor)
        const previousStatus = await client.get(k.status)
        const finishedAt = new Date().toISOString()
        const result = { ok: true, runId: input.runId, entity: input.entity, received: normalized.length, inserted, updated, unchanged, skipped: false, finishedAt, nextCursor: cursor }
        const pipeline = client.pipeline()
        if (Object.keys(recordMap).length) pipeline.hset(k.records, recordMap)
        if (Object.keys(hashMap).length) pipeline.hset(k.hashes, hashMap)
        if (Object.keys(historyUpdates).length) pipeline.hset(k.history, historyUpdates)
        if (ids.length) pipeline.sadd(k.active, ...ids)
        if (input.nextCursor) pipeline.set(k.cursor, input.nextCursor)
        pipeline.set(k.status, { ...(previousStatus || {}), entity: input.entity, lastSuccessfulRunAt: finishedAt, sourceUpdatedAt: finishedAt, mode: 'changes', inserted, updated, unchanged })
        pipeline.set(resultKey, result, { ex: RUN_TTL_SECONDS })
        await pipeline.exec()
        return result
      } finally {
        const currentOwner = await client.get(k.activityLock).catch(() => null)
        if (currentOwner === owner) await client.del(k.activityLock).catch(() => {})
      }
    },

    async cursor(entity) {
      assertEntity(entity)
      return requireRedis().get(keys(entity, 'unused').cursor)
    },

    async upsertBatch(input, normalize) {
      validateBatch(input)
      const client = requireRedis()
      const k = keys(input.entity, input.runId)
      const fullOwner = `full:${input.runId}`
      const activeOwner = await client.get(k.activityLock)
      if (activeOwner && activeOwner !== fullOwner) throw Object.assign(new Error('Sincronização incremental em andamento'), { status: 409 })
      if (!activeOwner) {
        const locked = await client.set(k.activityLock, fullOwner, { nx: true, ex: CHANGES_LOCK_SECONDS })
        if (!locked) throw Object.assign(new Error('Outra sincronização está em andamento'), { status: 409 })
      }
      const previous = await client.get(k.result(input.batchIndex))
      if (previous) return previous

      const lockToken = crypto.randomUUID()
      const locked = await client.set(k.lock(input.batchIndex), lockToken, { nx: true, ex: 120 })
      if (!locked) throw Object.assign(new Error('Lote já está sendo processado'), { status: 409 })

      try {
        const normalized = input.items.map((item) => {
          const record = normalize(item)
          const sourceId = record?.id ?? record?.Id
          if (sourceId == null || !Number.isFinite(Number(sourceId))) {
            throw Object.assign(new Error('Registro sem id numérico'), { status: 400 })
          }
          return { ...record, id: Number(sourceId) }
        })
        const ids = normalized.map((record) => String(record.id))
        if (new Set(ids).size !== ids.length) throw Object.assign(new Error('IDs duplicados no lote'), { status: 400 })

        const currentHashes = ids.length ? await client.hmget(k.hashes, ...ids) : {}
        const currentRecords = ids.length ? (await client.hmget(k.records, ...ids) || {}) : {}
        const currentHistory = ids.length ? (await client.hmget(k.history, ...ids) || {}) : {}
        const hashes = normalized.map(canonicalHash)
        let inserted = 0
        let updated = 0
        let unchanged = 0
        for (let index = 0; index < hashes.length; index += 1) {
          const currentHash = currentHashes?.[ids[index]]
          if (currentHash == null) inserted += 1
          else if (currentHash === hashes[index]) unchanged += 1
          else updated += 1
        }

        const batchData = {
          runId: input.runId,
          runStartedAt: input.runStartedAt,
          entity: input.entity,
          batchIndex: input.batchIndex,
          batchCount: input.batchCount,
          expectedTotal: input.expectedTotal,
          items: normalized,
          hashes: Object.fromEntries(ids.map((recordId, index) => [recordId, hashes[index]])),
        }
        const historyUpdates = {}
        if (input.entity === 'projetos') {
          normalized.forEach((record, index) => {
            const previousRaw = currentRecords?.[ids[index]]
            if (!previousRaw) return
            const previous = typeof previousRaw === 'string' ? JSON.parse(previousRaw) : previousRaw
            const statusAnterior = previous.etapa ?? previous.status ?? null
            const statusNovo = record.etapa ?? record.status ?? null
            if (statusAnterior === statusNovo) return
            const oldHistoryRaw = currentHistory?.[ids[index]]
            const oldHistory = oldHistoryRaw ? (typeof oldHistoryRaw === 'string' ? JSON.parse(oldHistoryRaw) : oldHistoryRaw) : []
            historyUpdates[ids[index]] = [...oldHistory, {
              id: Number(record.id), statusAnterior, statusNovo, em: input.runStartedAt,
            }]
          })
        }
        const result = {
          ok: true,
          runId: input.runId,
          entity: input.entity,
          batchIndex: input.batchIndex,
          expectedTotal: input.expectedTotal,
          received: normalized.length,
          inserted,
          updated,
          unchanged,
        }
        const pipeline = client.pipeline()
        pipeline.set(k.batch(input.batchIndex), batchData, { ex: RUN_TTL_SECONDS })
        pipeline.set(k.result(input.batchIndex), result, { ex: RUN_TTL_SECONDS })
        if (Object.keys(historyUpdates).length) pipeline.hset(k.history, historyUpdates)
        await pipeline.exec()
        return result
      } finally {
        const owner = await client.get(k.lock(input.batchIndex)).catch(() => null)
        if (owner === lockToken) await client.del(k.lock(input.batchIndex)).catch(() => {})
      }
    },

    async finalize(input) {
      validateFinalize(input)
      const client = requireRedis()
      const k = keys(input.entity, input.runId)
      const previousFinal = await client.get(k.final)
      if (previousFinal) return previousFinal

      const current = await client.get(k.current)
      if (current && asTimestamp(current.runStartedAt, 'runStartedAt atual') > asTimestamp(input.runStartedAt, 'runStartedAt')) {
        throw Object.assign(new Error('Existe uma sincronização mais nova já publicada'), { status: 409 })
      }

      const batchKeys = Array.from({ length: input.batchCount }, (_, index) => k.batch(index + 1))
      const batches = batchKeys.length ? await client.mget(...batchKeys) : []
      if (batches.some((batch) => !batch)) throw Object.assign(new Error('Nem todos os lotes foram recebidos'), { status: 409 })

      const received = batches.reduce((total, batch) => total + batch.items.length, 0)
      if (received !== input.expectedTotal || batches.some((batch, index) => (
        batch.runId !== input.runId || batch.entity !== input.entity || batch.batchIndex !== index + 1 ||
        batch.batchCount !== input.batchCount || batch.expectedTotal !== input.expectedTotal
      ))) {
        throw Object.assign(new Error('Carga incompleta ou metadados inconsistentes'), { status: 409 })
      }

      const ids = batches.flatMap((batch) => batch.items.map((item) => String(item.id)))
      if (new Set(ids).size !== ids.length) throw Object.assign(new Error('IDs duplicados entre lotes'), { status: 409 })
      const previousIds = await client.smembers(k.active)
      const nextIds = new Set(ids)
      const softDeleted = previousIds.filter((recordId) => !nextIds.has(String(recordId)))
      const hashMap = Object.assign({}, ...batches.map((batch) => batch.hashes))
      const recordMap = Object.assign({}, ...batches.flatMap((batch) => batch.items.map((item) => ({ [String(item.id)]: item }))))
      const totals = batches.reduce((acc, batch, index) => {
        const resultKey = k.result(index + 1)
        acc.resultKeys.push(resultKey)
        return acc
      }, { resultKeys: [] })
      const results = await client.mget(...totals.resultKeys)
      const sum = (field) => results.reduce((total, result) => total + Number(result?.[field] || 0), 0)
      const finishedAt = new Date().toISOString()
      const manifest = {
        entity: input.entity,
        runId: input.runId,
        runStartedAt: input.runStartedAt,
        finishedAt,
        batchCount: input.batchCount,
        expectedTotal: input.expectedTotal,
      }
      const final = {
        ok: true,
        ...manifest,
        inserted: sum('inserted'),
        updated: sum('updated'),
        unchanged: sum('unchanged'),
        softDeleted: softDeleted.length,
        activeTotal: ids.length,
      }

      const transaction = client.multi()
      if (Object.keys(hashMap).length) transaction.hset(k.hashes, hashMap)
      if (Object.keys(recordMap).length) transaction.hset(k.records, recordMap)
      transaction.del(k.active)
      if (ids.length) transaction.sadd(k.active, ...ids)
      for (const batchKey of batchKeys) transaction.persist(batchKey)
      transaction.set(k.current, manifest)
      transaction.set(k.status, final)
      transaction.set(k.final, final, { ex: RUN_TTL_SECONDS })
      await transaction.exec()

      const owner = await client.get(k.activityLock).catch(() => null)
      if (owner === `full:${input.runId}`) await client.del(k.activityLock).catch(() => {})

      if (current && current.runId !== input.runId) {
        const oldKeys = keys(input.entity, current.runId)
        const oldBatchKeys = Array.from({ length: current.batchCount }, (_, index) => oldKeys.batch(index + 1))
        if (oldBatchKeys.length) await client.del(...oldBatchKeys).catch(() => {})
      }
      return final
    },

    async load(entity) {
      assertEntity(entity)
      const client = requireRedis()
      const baseKeys = keys(entity, 'unused')
      const manifest = await client.get(baseKeys.current)
      if (!manifest) return null
      const activeIds = await client.smembers(baseKeys.active)
      let items
      if (activeIds.length) {
        const records = await client.hmget(baseKeys.records, ...activeIds)
        items = activeIds.map((id) => records?.[String(id)]).filter(Boolean).map((item) => typeof item === 'string' ? JSON.parse(item) : item)
      } else {
        const currentKeys = keys(entity, manifest.runId)
        const batchKeys = Array.from({ length: manifest.batchCount }, (_, index) => currentKeys.batch(index + 1))
        const batches = await client.mget(...batchKeys)
        if (batches.some((batch) => !batch)) throw Object.assign(new Error('Fotografia incompleta'), { status: 503 })
        items = batches.flatMap((batch) => batch.items)
      }
      if (activeIds.length && items.length !== activeIds.length) throw Object.assign(new Error('Registros ativos incompletos'), { status: 503 })
      const history = items.length ? (await client.hmget(baseKeys.history, ...items.map((item) => String(item.id))) || {}) : {}
      const withHistory = items.map((item) => {
        const raw = history?.[String(item.id)]
        const historicoStatus = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : []
        const last = historicoStatus[historicoStatus.length - 1]
        return {
          ...item,
          historicoStatus,
          dataEntradaMarco: last?.statusNovo === item.etapa ? last.em : item.dataUltimoStatus ?? null,
          dataEntradaMarcoEstimada: !(last?.statusNovo === item.etapa),
        }
      })
      return { items: withHistory, totalItems: withHistory.length, sync: manifest }
    },

    async status(entity) {
      assertEntity(entity)
      const client = requireRedis()
      return client.get(keys(entity, 'unused').status)
    },
  }
}

export function getSyncStore() {
  return createSyncStore()
}

export async function loadSyncedEntity(entity) {
  if (!syncStorageConfigured()) return null
  return getSyncStore().load(entity)
}

export async function getSyncStatuses() {
  if (!syncStorageConfigured()) return { configured: false, entities: {} }
  const store = getSyncStore()
  const entities = Object.fromEntries(await Promise.all([...ENTITIES].map(async (entity) => [entity, await store.status(entity)])))
  return { configured: true, entities }
}
