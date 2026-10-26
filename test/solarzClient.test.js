import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { solarzListarUsinas } from '../server/solarzClient.js'

const fetchOriginal = globalThis.fetch
const envOriginal = { u: process.env.SOLARZ_USER, p: process.env.SOLARZ_PASSWORD }

beforeEach(() => {
  process.env.SOLARZ_USER = 'u'
  process.env.SOLARZ_PASSWORD = 'p'
})
afterEach(() => {
  globalThis.fetch = fetchOriginal
  for (const [k, v] of [['SOLARZ_USER', envOriginal.u], ['SOLARZ_PASSWORD', envOriginal.p]]) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
})

const resp = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => data })
const lote = (n, ini = 0) => Array.from({ length: n }, (_, i) => ({ id: ini + i }))

test('3 páginas (500, 500, 120) viram 1.120 usinas', async () => {
  const paginas = [lote(500), lote(500, 500), lote(120, 1000)]
  const pedidas = []
  globalThis.fetch = async (_url, opts) => {
    const { page } = JSON.parse(opts.body)
    pedidas.push(page)
    return resp(200, { content: paginas[Number(page) - 1] })
  }
  const usinas = await solarzListarUsinas()
  assert.equal(usinas.length, 1120)
  assert.deepEqual(pedidas, ['1', '2', '3'])
})

test('página vazia encerra a busca', async () => {
  const paginas = [lote(500), []]
  let chamadas = 0
  globalThis.fetch = async () => resp(200, { content: paginas[chamadas++] })
  const usinas = await solarzListarUsinas()
  assert.equal(usinas.length, 500)
  assert.equal(chamadas, 2)
})

test('401 propaga erro claro sem repetir', async () => {
  let chamadas = 0
  globalThis.fetch = async () => {
    chamadas++
    return resp(401, { message: 'Unauthorized' })
  }
  await assert.rejects(solarzListarUsinas(), (err) => err.status === 401 && /Unauthorized/.test(err.message))
  assert.equal(chamadas, 1)
})

test('5xx é repetido e depois dá certo', async () => {
  let chamadas = 0
  globalThis.fetch = async () => (++chamadas === 1 ? resp(503, null) : resp(200, { content: lote(3) }))
  const usinas = await solarzListarUsinas({ esperaMs: 1 })
  assert.equal(usinas.length, 3)
  assert.equal(chamadas, 2)
})

test('timeout vira erro claro após as tentativas', async () => {
  let chamadas = 0
  globalThis.fetch = (_url, opts) =>
    new Promise((_resolve, reject) => {
      chamadas++
      opts.signal.addEventListener('abort', () => reject(new Error('aborted')))
    })
  await assert.rejects(solarzListarUsinas({ timeoutMs: 20, esperaMs: 1 }), (err) => err.code === 'SOLARZ_TIMEOUT' && /Timeout/.test(err.message))
  assert.equal(chamadas, 3)
})

test('sem credencial: erro claro e nenhuma chamada', async () => {
  delete process.env.SOLARZ_USER
  let chamadas = 0
  globalThis.fetch = async () => {
    chamadas++
    return resp(200, { content: [] })
  }
  await assert.rejects(solarzListarUsinas(), /credenciais da SolarZ não configuradas/)
  assert.equal(chamadas, 0)
})

test('página que repete o primeiro id da anterior encerra a busca', async () => {
  let chamadas = 0
  globalThis.fetch = async () => { chamadas++; return resp(200, { content: lote(5) }) }
  const usinas = await solarzListarUsinas({ pageSize: 5 })
  assert.equal(usinas.length, 5)
  assert.equal(chamadas, 2)
})

test('usinas repetidas por id são removidas', async () => {
  const paginas = [[{ id: 1 }, { id: 2 }, { id: 2 }], [{ id: 3 }, { id: 1 }]]
  let i = 0
  globalThis.fetch = async () => resp(200, { content: paginas[i++] })
  const usinas = await solarzListarUsinas({ pageSize: 3 })
  assert.deepEqual(usinas.map((u) => u.id), [1, 2, 3])
})

test('prazo total esgotado vira erro claro', async () => {
  let chamadas = 0
  globalThis.fetch = async () => { chamadas++; await new Promise((r) => setTimeout(r, 30)); return resp(200, { content: lote(5, chamadas * 10) }) }
  await assert.rejects(solarzListarUsinas({ pageSize: 5, prazoMs: 50 }), (err) => err.code === 'SOLARZ_TIMEOUT' && /Prazo/.test(err.message))
})
