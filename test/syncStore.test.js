import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createSyncStore } from '../server/syncStore.js'
import { createSyncRouter } from '../server/syncRoutes.js'
import { mapProjeto, marcoDoStatus } from '../server/mappers.js'

class FakeBatch {
  constructor(redis) {
    this.redis = redis
    this.commands = []
  }

  command(name, args) {
    this.commands.push([name, args])
    return this
  }

  set(...args) { return this.command('set', args) }
  del(...args) { return this.command('del', args) }
  hset(...args) { return this.command('hset', args) }
  sadd(...args) { return this.command('sadd', args) }
  persist(...args) { return this.command('persist', args) }

  async exec() {
    const results = []
    for (const [name, args] of this.commands) results.push(await this.redis[name](...args))
    return results
  }
}

class FakeRedis {
  constructor() {
    this.values = new Map()
    this.hashes = new Map()
    this.sets = new Map()
  }

  async get(key) { return this.values.get(key) ?? null }
  async set(key, value, options = {}) {
    if (options.nx && this.values.has(key)) return null
    this.values.set(key, structuredClone(value))
    return 'OK'
  }
  async del(...keys) {
    let removed = 0
    for (const key of keys) {
      removed += Number(this.values.delete(key))
      removed += Number(this.hashes.delete(key))
      removed += Number(this.sets.delete(key))
    }
    return removed
  }
  async mget(...keys) { return keys.map((key) => structuredClone(this.values.get(key) ?? null)) }
  async hmget(key, ...fields) {
    const hash = this.hashes.get(key) ?? new Map()
    if (!fields.some((field) => hash.has(String(field)))) return null
    return Object.fromEntries(fields.map((field) => [String(field), structuredClone(hash.get(String(field)) ?? null)]))
  }
  async hset(key, values) {
    const hash = this.hashes.get(key) ?? new Map()
    for (const [field, value] of Object.entries(values)) hash.set(String(field), structuredClone(value))
    this.hashes.set(key, hash)
    return Object.keys(values).length
  }
  async smembers(key) { return [...(this.sets.get(key) ?? new Set())] }
  async sadd(key, ...members) {
    const set = this.sets.get(key) ?? new Set()
    for (const member of members) set.add(String(member))
    this.sets.set(key, set)
    return members.length
  }
  async expire() { return 1 }
  async persist() { return 1 }
  pipeline() { return new FakeBatch(this) }
  multi() { return new FakeBatch(this) }
}

function batch(runId, items, overrides = {}) {
  return {
    runId,
    runStartedAt: '2026-10-05T11:00:00.000Z',
    entity: 'projetos',
    batchIndex: 1,
    batchCount: 1,
    expectedTotal: items.length,
    items,
    ...overrides,
  }
}

test('publica somente cargas completas e mantém o upsert idempotente', async () => {
  const store = createSyncStore(new FakeRedis())
  const firstInput = batch('projetos-20261005T110000Z', [{ id: 1, etapa: 'Novo' }, { id: 2, etapa: 'Proposta' }])
  const first = await store.upsertBatch(firstInput, (item) => item)
  assert.deepEqual({ inserted: first.inserted, updated: first.updated, unchanged: first.unchanged }, { inserted: 2, updated: 0, unchanged: 0 })
  assert.deepEqual(await store.upsertBatch(firstInput, (item) => item), first)

  const finalized = await store.finalize(firstInput)
  assert.equal(finalized.activeTotal, 2)
  assert.equal(finalized.softDeleted, 0)
  assert.deepEqual((await store.load('projetos')).items.map(({ id, etapa, historicoStatus }) => ({ id, etapa, historicoStatus })), [
    { id: 1, etapa: 'Novo', historicoStatus: [] },
    { id: 2, etapa: 'Proposta', historicoStatus: [] },
  ])

  const sameInput = batch('projetos-20261005T180000Z', firstInput.items, { runStartedAt: '2026-10-05T21:00:00.000Z' })
  const same = await store.upsertBatch(sameInput, (item) => item)
  assert.deepEqual({ inserted: same.inserted, updated: same.updated, unchanged: same.unchanged }, { inserted: 0, updated: 0, unchanged: 2 })
  await store.finalize(sameInput)

  const changedInput = batch('projetos-20261006T080000Z', [{ id: 1, etapa: 'Fechado' }], { runStartedAt: '2026-10-06T11:00:00.000Z' })
  const changed = await store.upsertBatch(changedInput, (item) => item)
  assert.deepEqual({ inserted: changed.inserted, updated: changed.updated, unchanged: changed.unchanged }, { inserted: 0, updated: 1, unchanged: 0 })
  const changedFinal = await store.finalize(changedInput)
  assert.equal(changedFinal.softDeleted, 1)
  const changedItems = (await store.load('projetos')).items
  assert.deepEqual(changedItems.map(({ id, etapa }) => ({ id, etapa })), [{ id: 1, etapa: 'Fechado' }])
  assert.deepEqual(changedItems[0].historicoStatus, [{ id: 1, statusAnterior: 'Novo', statusNovo: 'Fechado', em: '2026-10-06T11:00:00.000Z' }])
})

test('recusa finalização quando faltam lotes', async () => {
  const store = createSyncStore(new FakeRedis())
  const input = batch('projetos-20261005T110000Z', [{ id: 1 }], { batchCount: 2 })
  await store.upsertBatch(input, (item) => item)
  await assert.rejects(() => store.finalize(input), /Nem todos os lotes/)
})

test('protege escrita com token exclusivo e valida a entidade', async (t) => {
  process.env.GRONER_SYNC_TOKEN = 'segredo-de-teste'
  process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io'
  process.env.UPSTASH_REDIS_REST_TOKEN = 'token-de-teste'
  const calls = []
  const stubStore = {
    upsertBatch: async (body, normalize) => {
      calls.push(normalize(body.items[0]))
      return { ok: true, runId: body.runId, entity: body.entity, batchIndex: body.batchIndex, expectedTotal: body.expectedTotal, received: 1, inserted: 1, updated: 0, unchanged: 0 }
    },
    finalize: async () => ({ ok: true }),
  }
  const app = express()
  app.use(express.json())
  app.use('/api/sync/groner', createSyncRouter({ store: stubStore }))
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  t.after(() => server.close())
  const { port } = server.address()
  const url = `http://127.0.0.1:${port}/api/sync/groner/projetos/batches`
  const body = batch('projetos-20261005T110000Z', [{ id: 1, nome: 'Cliente teste', password: 'não pode sair' }])

  const denied = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  assert.equal(denied.status, 401)
  const accepted = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Groner-Sync-Token': 'segredo-de-teste' },
    body: JSON.stringify(body),
  })
  assert.equal(accepted.status, 200)
  assert.equal(calls.length, 1)
  assert.equal('password' in calls[0], false)
})

test('normaliza Deals com allowlist e deriva o marco', () => {
  const projeto = mapProjeto({ id: 42, etapa: 'PENDÊNCIA DE HOMOLOGAÇÃO', deal: { cidade: 'Cidade teste', kwp: 12.5, tecnico: 'Técnico teste', Documento: 'proibido' } }, {})
  assert.equal(projeto.marco, 6)
  assert.equal(projeto.cidade, 'Cidade teste')
  assert.equal(projeto.kwp, 12.5)
  assert.equal(projeto.tecnico, 'Técnico teste')
  assert.equal('Documento' in projeto, false)
  assert.equal(marcoDoStatus('INSTALAÇÃO AGENDADA'), 10)
  assert.equal(marcoDoStatus('material C.A.'), null)
})
