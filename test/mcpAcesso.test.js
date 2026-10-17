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

test('link do Deals: host com porta é aceito; porta não numérica cai no endereço padrão', async () => {
  const anterior = { token: process.env.MCP_ACCESS_TOKEN, base: process.env.PUBLIC_BASE_URL }
  process.env.MCP_ACCESS_TOKEN = 'chave-certa-123'
  delete process.env.PUBLIC_BASE_URL
  const body = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'deals_exportar', arguments: { limite: 1 } } }
  const linkPara = async (host) => {
    const r = await chamar({ headers: { authorization: 'Bearer chave-certa-123', host }, body })
    return JSON.parse(r.corpo.result.content[0].text).link
  }
  try {
    assert.ok((await linkPara('meu-host.exemplo.com:3000')).startsWith('https://meu-host.exemplo.com:3000/api/deals/download'))
    assert.ok(!(await linkPara('meu-host.exemplo.com:ddd')).includes('meu-host'))
  } finally {
    if (anterior.token === undefined) delete process.env.MCP_ACCESS_TOKEN; else process.env.MCP_ACCESS_TOKEN = anterior.token
    if (anterior.base !== undefined) process.env.PUBLIC_BASE_URL = anterior.base
  }
})

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
