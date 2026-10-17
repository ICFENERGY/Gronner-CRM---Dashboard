import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

process.env.GRONER_TENANT ||= 'teste'
process.env.GRONER_TOKEN ||= 'token-teste'
const { gronerGet, gronerGetAll } = await import('../server/gronerClient.js')

const realFetch = globalThis.fetch
beforeEach(() => {})
afterEach(() => {
  globalThis.fetch = realFetch
})

const json = (body, status = 200) => new Response(JSON.stringify(body), { status })

/** API falsa que limita a 20 itens por página. */
function fakeApi(total, { limit = 20, emptyFrom } = {}) {
  const calls = []
  globalThis.fetch = async (url) => {
    const u = new URL(url)
    const page = Number(u.searchParams.get('pageNumber'))
    calls.push(page)
    const start = (page - 1) * limit
    const count = emptyFrom && page >= emptyFrom ? 0 : Math.max(0, Math.min(limit, total - start))
    const list = Array.from({ length: count }, (_, i) => ({ id: start + i + 1 }))
    return json({ Content: { list, totalItems: total, totalPages: Math.ceil(total / limit), pageNumber: page, pageSize: limit } })
  }
  return calls
}

test('limite de 20 por página: devolve todos os 181 itens em ordem', async () => {
  fakeApi(181)
  const r = await gronerGetAll('Venda', {}, { pageSize: 500, concurrency: 4 })
  assert.equal(r.items.length, 181)
  assert.equal(r.totalItems, 181)
  assert.deepEqual(r.items.map((i) => i.id), Array.from({ length: 181 }, (_, i) => i + 1))
})

test('página vazia interrompe a busca', async () => {
  fakeApi(181, { emptyFrom: 4 })
  const r = await gronerGetAll('Venda', {}, { concurrency: 1 })
  assert.equal(r.items.length, 60)
})

test('teto em itens limita as páginas', async () => {
  const calls = fakeApi(181)
  const r = await gronerGetAll('Venda', {}, { pageSize: 500, maxItems: 50, concurrency: 2 })
  assert.equal(r.items.length, 60) // 3 páginas de 20 cobrem 50
  assert.ok(Math.max(...calls) <= 3)
})

test('timeout aborta a chamada', async () => {
  globalThis.fetch = (url, { signal }) =>
    new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)))
  await assert.rejects(gronerGet('Venda', {}, { timeoutMs: 30, retries: 0 }), /Tempo esgotado/)
})

test('429 tenta de novo e funciona', async () => {
  let n = 0
  globalThis.fetch = async () => (++n < 3 ? json({ Message: 'limite' }, 429) : json({ Content: { list: [1] } }))
  const retries = []
  const r = await gronerGet('Venda', {}, { retryDelayMs: 1, onRetry: (a) => retries.push(a) })
  assert.deepEqual(r.list, [1])
  assert.equal(n, 3)
  assert.equal(retries.length, 2)
})

test('4xx (exceto 429) não repete', async () => {
  let n = 0
  globalThis.fetch = async () => (n++, json({ Message: 'não' }, 404))
  await assert.rejects(gronerGet('Venda', {}, { retryDelayMs: 1 }), /não/)
  assert.equal(n, 1)
})
