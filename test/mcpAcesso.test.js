import { test } from 'node:test'
import assert from 'node:assert/strict'

// O módulo lê GRONER_TENANT ao ser importado.
process.env.GRONER_TENANT ||= 'teste'
const { default: handler } = await import('../api/mcp.js')

/** Chama o handler do Vercel com req/res mínimos. */
async function chamar({ headers = {}, query = {}, body = { jsonrpc: '2.0', id: 1, method: 'tools/list' } } = {}) {
  const res = {
    statusCode: 200, corpo: null, cab: {},
    setHeader(k, v) { this.cab[k] = v },
    status(c) { this.statusCode = c; return this },
    json(b) { this.corpo = b; return this },
    end() { return this },
  }
  await handler({ method: 'POST', headers, query, body }, res)
  return res
}

test('MCP exige a chave: sem ela, com chave errada ou sem variável no servidor responde 401', async () => {
  delete process.env.MCP_ACCESS_TOKEN
  assert.equal((await chamar({ headers: { authorization: 'Bearer qualquer' } })).statusCode, 401)

  process.env.MCP_ACCESS_TOKEN = 'chave-certa-123'
  assert.equal((await chamar()).statusCode, 401)
  assert.equal((await chamar({ headers: { authorization: 'Bearer chave-errada' } })).statusCode, 401)

  for (const forma of [
    { headers: { authorization: 'Bearer chave-certa-123' } },
    { headers: { 'x-api-key': 'chave-certa-123' } },
    { query: { key: 'chave-certa-123' } },
  ]) {
    const r = await chamar(forma)
    assert.equal(r.statusCode, 200)
    assert.ok(r.corpo.result.tools.length > 0)
  }
  delete process.env.MCP_ACCESS_TOKEN
})
