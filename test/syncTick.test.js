import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { sincronizarAlteracoes } from '../server/syncTick.js'
import { createSyncRouter } from '../server/syncRoutes.js'

// 05/10 17:00 em Brasília = 20:00 UTC. Datas do Groner vêm sem offset (Brasília).
const AGORA = new Date('2026-10-05T20:00:00.000Z')

function lojaFalsa(cursor = null) {
  const chamadas = []
  return {
    chamadas,
    async cursor() { return cursor },
    async upsertChanges(input, normalize) {
      chamadas.push({ ...input, items: input.items.map(normalize) })
      return { ok: true, runId: input.runId, received: input.items.length, inserted: input.items.length, updated: 0, unchanged: 0, skipped: false }
    },
  }
}

function gronerFalso(lista) {
  const pedidos = []
  return {
    pedidos,
    async buscar(recurso, params) {
      pedidos.push(recurso)
      if (recurso === 'Projeto') {
        const ini = (params.pageNumber - 1) * params.pageSize
        return { totalItems: lista.length, list: lista.slice(ini, ini + params.pageSize) }
      }
      if (recurso.startsWith('Projeto/')) return { id: Number(recurso.split('/')[1]), dataUltimoStatus: '0001-01-01T00:00:00', endereco: { cidade: 'Cidade X', uf: 'SP' }, lead: { loja: { endereco: { cidade: 'Barueri' } } } }
      return []
    },
  }
}

// Ordem decrescente de atualização, como o Groner devolve com DataAtualizacao_DESC.
const proj = (id, hora, status = 'VENDA REALIZADA') => ({ id, dataUltimaAtualizacao: `2026-10-05T${hora}:00.00`, status: { nome: status }, etapa: '06. CONTRATO' })

test('pega só a janela do cursor (Brasília), detalha só cards com marco e avança o cursor para agora', async () => {
  const loja = lojaFalsa('2026-10-05T19:55:00.000Z') // 16:55 SP → janela começa 16:45 SP
  const groner = gronerFalso([proj(3, '16:58', 'PENDENCIA ICF'), proj(2, '16:50'), proj(1, '16:30')])
  const r = await sincronizarAlteracoes({ store: loja, normalize: (x) => x, buscar: groner.buscar, agora: AGORA })
  assert.equal(r.alterados, 2)
  assert.equal(r.detalhes, 1)
  assert.equal(r.pendente, false)
  const envio = loja.chamadas[0]
  assert.deepEqual(envio.items.map((i) => i.id), [2, 3]) // mais antigo primeiro
  // Listagem tem prioridade; o detalhe entra resumido (sem lead/loja) em `detalhe`.
  assert.equal(envio.items[1].dataUltimaAtualizacao, '2026-10-05T16:58:00.00')
  assert.equal(envio.items[1].dataUltimoStatus, undefined)
  assert.equal(envio.items[1].detalhe.cidade, 'Cidade X')
  assert.equal('lead' in envio.items[1], false)
  assert.ok('camposPersonalizados' in envio.items[1])
  assert.equal(envio.nextCursor, AGORA.toISOString())
  assert.equal(groner.pedidos.filter((p) => p.startsWith('Projeto/')).length, 1)
})

test('sem cursor, a janela é os últimos 10 minutos', async () => {
  const loja = lojaFalsa(null)
  const groner = gronerFalso([proj(2, '16:55'), proj(1, '16:40')])
  const r = await sincronizarAlteracoes({ store: loja, normalize: (x) => x, buscar: groner.buscar, agora: AGORA })
  assert.equal(r.alterados, 1)
})

test('edição em massa: para no limite de detalhes e avança o cursor só até o último processado', async () => {
  const loja = lojaFalsa('2026-10-05T19:00:00.000Z')
  const lista = [proj(5, '16:59', 'PENDENCIA ICF'), proj(4, '16:58', 'PENDENCIA ICF'), proj(3, '16:57', 'PENDENCIA ICF'), proj(2, '16:56')]
  const r = await sincronizarAlteracoes({ store: loja, normalize: (x) => x, buscar: gronerFalso(lista).buscar, agora: AGORA, limites: { maxDetalhes: 1 } })
  assert.equal(r.pendente, true)
  assert.deepEqual(loja.chamadas[0].items.map((i) => i.id), [2, 3])
  assert.equal(loja.chamadas[0].nextCursor, new Date('2026-10-05T16:57:00.00-03:00').toISOString())
})

/** Salva as variáveis de ambiente usadas, aplica `vars` (sem o resto) e devolve a função que restaura. */
function isolarAmbiente(vars) {
  const chaves = ['GRONER_SYNC_TOKEN', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'DASHBOARD_STORAGE', 'VERCEL']
  const salvo = Object.fromEntries(chaves.map((k) => [k, process.env[k]]))
  for (const k of chaves) delete process.env[k]
  Object.assign(process.env, vars)
  return () => { for (const k of chaves) { if (salvo[k] === undefined) delete process.env[k]; else process.env[k] = salvo[k] } }
}

test('rota do tick exige a chave (cabeçalho ou ?key=) e responde só o resumo', async () => {
  const restaurar = isolarAmbiente({
    GRONER_SYNC_TOKEN: 'segredo-teste',
    UPSTASH_REDIS_REST_URL: 'https://exemplo.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'x',
  })
  const loja = lojaFalsa(null)
  const app = express()
  app.use(express.json())
  app.use('/api/sync/groner', createSyncRouter({ store: loja, buscarGroner: gronerFalso([proj(1, '16:59')]).buscar }))
  const server = app.listen(0, '127.0.0.1')
  await new Promise((r) => server.once('listening', r))
  const base = `http://127.0.0.1:${server.address().port}/api/sync/groner/projetos/tick`
  try {
    assert.equal((await fetch(base)).status, 401)
    assert.equal((await fetch(`${base}?key=errada`)).status, 401)
    const r = await fetch(`${base}?key=segredo-teste`)
    assert.equal(r.status, 200)
    const corpo = await r.json()
    assert.equal(corpo.ok, true)
    assert.equal('items' in corpo, false)
    assert.equal((await fetch(base, { method: 'POST', headers: { 'X-Groner-Sync-Token': 'segredo-teste' } })).status, 200)
  } finally {
    server.close()
    restaurar()
  }
})
