import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { sincronizarAlteracoes } from '../server/syncTick.js'
import { createSyncRouter, pietaNoTick } from '../server/syncRoutes.js'

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
  const chaves = ['GRONER_SYNC_TOKEN', 'CRON_SECRET', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'DASHBOARD_STORAGE', 'VERCEL']
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

/** Groner que devolve no máximo 20 itens por página, com totalPages, como o real. */
function gronerPaginado20(lista) {
  const pedidos = []
  return {
    pedidos,
    async buscar(recurso, params) {
      if (recurso !== 'Projeto') return {}
      pedidos.push(params.pageNumber)
      const ini = (params.pageNumber - 1) * 20
      return { totalItems: lista.length, totalPages: Math.ceil(lista.length / 20), list: lista.slice(ini, ini + 20) }
    },
  }
}

const minutos = (m) => `2026-10-05T${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00.00`

test('usa o tamanho real da página (20): percorre as páginas até o cursor', async () => {
  const loja = lojaFalsa('2026-10-05T19:00:00.000Z') // 16:00 SP
  // 100 alterados nos últimos 100 min (16:00–17:39), mais novos primeiro, sem marco (sem detalhe)
  const lista = Array.from({ length: 100 }, (_, i) => ({ id: 1000 - i, dataUltimaAtualizacao: minutos(16 * 60 + 99 - i), status: { nome: 'OUTRO' } }))
  const groner = gronerPaginado20(lista)
  const r = await sincronizarAlteracoes({ store: loja, normalize: (x) => x, buscar: groner.buscar, agora: new Date('2026-10-05T20:40:00.000Z') })
  assert.equal(r.alterados, 100)
  assert.equal(r.pendente, false)
  assert.equal(r.truncado, false)
})

test('alterações demais: não falha, processa as mais antigas e avança o cursor só até o último processado', async () => {
  const loja = lojaFalsa('2026-10-05T10:00:00.000Z')
  const lista = Array.from({ length: 100 }, (_, i) => ({ id: 1000 - i, dataUltimaAtualizacao: minutos(8 * 60 + 99 - i), status: { nome: 'OUTRO' } }))
  const r = await sincronizarAlteracoes({ store: loja, normalize: (x) => x, buscar: gronerPaginado20(lista).buscar, agora: AGORA, limites: { maxPaginas: 3 } })
  assert.equal(r.truncado, true)
  assert.equal(r.pendente, true)
  assert.equal(r.alterados, 60)
  assert.equal(loja.chamadas[0].items.length, 60)
  assert.equal(loja.chamadas[0].nextCursor, undefined) // truncado: o cursor NÃO avança
})

test('ids repetidos nos alterados são removidos antes de gravar', async () => {
  const loja = lojaFalsa('2026-10-05T19:00:00.000Z')
  const lista = [proj(2, '16:59', 'OUTRO'), proj(1, '16:58', 'OUTRO'), proj(2, '16:57', 'OUTRO')]
  const r = await sincronizarAlteracoes({ store: loja, normalize: (x) => x, buscar: gronerFalso(lista).buscar, agora: AGORA })
  assert.equal(r.alterados, 2)
  assert.deepEqual(loja.chamadas[0].items.map((i) => i.id).sort(), [1, 2])
})

test('página lenta: para de iniciar ondas novas depois do orçamento e não avança o cursor', async () => {
  const loja = lojaFalsa('2026-10-05T10:00:00.000Z')
  const lista = Array.from({ length: 200 }, (_, i) => ({ id: 1000 - i, dataUltimaAtualizacao: minutos(8 * 60 + 199 - i), status: { nome: 'OUTRO' } }))
  const base = gronerPaginado20(lista)
  const buscar = async (recurso, params) => { await new Promise((r) => setTimeout(r, 40)); return base.buscar(recurso, params) }
  const r = await sincronizarAlteracoes({ store: loja, normalize: (x) => x, buscar, agora: AGORA, limites: { orcamentoBuscaMs: 60 } })
  assert.equal(r.truncado, true)
  assert.ok(base.pedidos.length <= 13, `pediu páginas demais: ${base.pedidos.length}`)
  assert.equal(loja.chamadas[0].nextCursor, undefined)
  assert.ok(loja.chamadas[0].items.length > 0)
})

test('prazo dos detalhes: não inicia detalhes novos depois do prazo e continua gravando o que processou', async () => {
  const loja = lojaFalsa('2026-10-05T19:00:00.000Z')
  const lista = Array.from({ length: 10 }, (_, i) => proj(20 - i, `16:${50 + (9 - i)}`, 'PENDENCIA ICF'))
  const g = gronerFalso(lista)
  const buscar = async (recurso, params) => { if (recurso.startsWith('Projeto/')) await new Promise((r) => setTimeout(r, 30)); return g.buscar(recurso, params) }
  const r = await sincronizarAlteracoes({ store: loja, normalize: (x) => x, buscar, agora: AGORA, limites: { prazoDetalhesMs: 10 } })
  assert.equal(r.pendente, true)
  assert.ok(loja.chamadas[0].items.length < 10)
  assert.ok(loja.chamadas[0].nextCursor === undefined || Date.parse(loja.chamadas[0].nextCursor) < AGORA.getTime())
})

function lojaCompleta() {
  const lotes = []
  const finalizados = []
  return {
    lotes, finalizados,
    async cursor() { return null },
    async upsertBatch(input, normalize) {
      lotes.push({ ...input, items: input.items.map(normalize) })
      return { inserted: input.items.length, updated: 0, unchanged: 0 }
    },
    async finalize(input) { finalizados.push(input); return { softDeleted: 2 } },
  }
}

test('rota da carga completa: autenticação, entidade inválida e carga em lotes de 50', async () => {
  const restaurar = isolarAmbiente({
    GRONER_SYNC_TOKEN: 'segredo-teste',
    CRON_SECRET: 'segredo-cron',
    UPSTASH_REDIS_REST_URL: 'https://exemplo.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'x',
  })
  const loja = lojaCompleta()
  const pedidos = []
  const buscarTudo = async (recurso) => { pedidos.push(recurso); return Array.from({ length: 120 }, (_, i) => ({ id: i + 1, titulo: `T${i}` })) }
  const app = express()
  app.use(express.json())
  app.use('/api/sync/groner', createSyncRouter({ store: loja, buscarGroner: async () => ({}), buscarTudo }))
  const server = app.listen(0, '127.0.0.1')
  await new Promise((r) => server.once('listening', r))
  const base = `http://127.0.0.1:${server.address().port}/api/sync/groner/completa`
  try {
    assert.equal((await fetch(`${base}/vendas`)).status, 401)
    assert.equal((await fetch(`${base}/vendas`, { headers: { Authorization: 'Bearer errado' } })).status, 401)
    assert.equal((await fetch(`${base}/projetos?key=segredo-teste`)).status, 404)
    assert.equal((await fetch(`${base}/inexistente?key=segredo-teste`)).status, 404)
    assert.equal(pedidos.length, 0)
    const r = await fetch(`${base}/vendas`, { headers: { Authorization: 'Bearer segredo-cron' } })
    assert.equal(r.status, 200)
    const corpo = await r.json()
    assert.equal(corpo.total, 120)
    assert.equal(corpo.inserted, 120)
    assert.equal(corpo.removidos, 2)
    assert.deepEqual(pedidos, ['Venda'])
    assert.deepEqual(loja.lotes.map((l) => l.items.length), [50, 50, 20])
    assert.equal(loja.lotes[0].batchCount, 3)
    assert.equal(loja.finalizados.length, 1)
    assert.equal((await fetch(`${base}/propostas?key=segredo-teste`, { method: 'POST' })).status, 200)
    assert.equal(pedidos[1], 'PreProposta')
    const todas = await (await fetch(`${base}?key=segredo-teste`)).json()
    assert.deepEqual(todas.resultados.map((x) => x.entity), ['propostas', 'tarefas', 'vendas'])
  } finally {
    server.close()
    restaurar()
  }
})

async function chamarCompleta(buscarTudo, loja) {
  const restaurar = isolarAmbiente({
    GRONER_SYNC_TOKEN: 'segredo-teste',
    UPSTASH_REDIS_REST_URL: 'https://exemplo.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'x',
  })
  const app = express()
  app.use(express.json())
  app.use('/api/sync/groner', createSyncRouter({ store: loja, buscarGroner: async () => ({}), buscarTudo }))
  const server = app.listen(0, '127.0.0.1')
  await new Promise((r) => server.once('listening', r))
  try {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api/sync/groner/completa/vendas?key=segredo-teste`, { method: 'POST' })
    return { status: r.status, corpo: await r.json() }
  } finally {
    server.close()
    restaurar()
  }
}

const itensN = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1 }))

test('carga completa aborta SEM gravar: total diferente, id repetido, lista vazia e menos de 90% dos ativos', async () => {
  const casos = [
    ['total diferente', async () => ({ items: itensN(10), totalItems: 12 }), {}, /informa 12/],
    ['id repetido', async () => ({ items: [{ id: 1 }, { id: 1 }, { id: 2 }], totalItems: 3 }), {}, /repetidos/],
    ['lista vazia', async () => ({ items: [], totalItems: 0 }), {}, /vazia/],
    ['menos de 90% dos ativos', async () => ({ items: itensN(80), totalItems: 80 }), { status: async () => ({ activeTotal: 100 }) }, /90%/],
  ]
  for (const [nome, buscarTudo, extra, msg] of casos) {
    const loja = { ...lojaCompleta(), ...extra }
    const { status, corpo } = await chamarCompleta(buscarTudo, loja)
    assert.equal(status, 502, nome)
    assert.equal(loja.lotes.length, 0, `${nome}: não pode gravar lotes`)
    assert.equal(loja.finalizados.length, 0, `${nome}: não pode finalizar`)
    assert.ok(corpo.error, nome)
  }
  // 90% exatos ou mais passa
  const loja = { ...lojaCompleta(), status: async () => ({ activeTotal: 100 }) }
  const { status, corpo } = await chamarCompleta(async () => ({ items: itensN(90), totalItems: 90 }), loja)
  assert.equal(status, 200)
  assert.equal(corpo.total, 90)
  assert.ok('msBusca' in corpo && 'msGravacao' in corpo)
})

// --- Pieta encaixada no tick ---
async function chamarTick(opcoes, ambienteExtra = {}) {
  const pietaEnv = ['PIETA_USER', 'PIETA_PASSWORD']
  const salvoPieta = Object.fromEntries(pietaEnv.map((k) => [k, process.env[k]]))
  for (const k of pietaEnv) delete process.env[k]
  const restaurar = isolarAmbiente({ GRONER_SYNC_TOKEN: 'segredo-teste', UPSTASH_REDIS_REST_URL: 'https://exemplo.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'x', ...ambienteExtra })
  const loja = lojaFalsa(null)
  const app = express()
  app.use('/api/sync/groner', createSyncRouter({ store: loja, buscarGroner: gronerFalso([proj(1, '16:59')]).buscar, ...opcoes }))
  const server = app.listen(0, '127.0.0.1')
  await new Promise((r) => server.once('listening', r))
  try {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api/sync/groner/projetos/tick?key=segredo-teste`)
    return { status: r.status, corpo: await r.json(), loja }
  } finally {
    server.close()
    restaurar()
    for (const k of pietaEnv) { if (salvoPieta[k] === undefined) delete process.env[k]; else process.env[k] = salvoPieta[k] }
  }
}

test('tick: Pieta falhando não derruba o tick do Groner; o erro vai no campo pieta', async () => {
  let opcoesRecebidas = null
  const { status, corpo, loja } = await chamarTick({
    sincronizarPieta: async (o) => { opcoesRecebidas = o; throw Object.assign(new Error('Erro 500 ao consultar a Pieta'), { status: 500 }) },
  })
  assert.equal(status, 200)
  assert.equal(corpo.ok, true)
  assert.equal(loja.chamadas.length, 1) // o Groner gravou
  assert.deepEqual(corpo.pieta, { ok: false, erro: 'Não foi possível sincronizar a Pieta' })
  // execução leve: orçamento = sobra do tick; resumo reaproveitado por 30 min
  assert.ok(opcoesRecebidas.orcamentoMs > 10000 && opcoesRecebidas.orcamentoMs <= 50000)
  assert.equal(opcoesRecebidas.reaproveitarResumoMs, 30 * 60 * 1000)
})

test('tick: sem credencial da Pieta, a carga é pulada em silêncio (padrão real, sem rede)', async () => {
  const { status, corpo } = await chamarTick({})
  assert.equal(status, 200)
  assert.equal(corpo.ok, true)
  assert.deepEqual(corpo.pieta, { ok: false, motivo: 'sem credencial' })
})

test('tick: sem Postgres, a carga da Pieta é pulada', async () => {
  const salvo = { u: process.env.PIETA_USER, p: process.env.PIETA_PASSWORD, n: process.env.NEON_DATABASE_URL, d: process.env.DATABASE_URL }
  delete process.env.NEON_DATABASE_URL; delete process.env.DATABASE_URL
  try {
    const { corpo } = await chamarTick({
      sincronizarPieta: undefined, // usa o padrão real
    }, { PIETA_USER: 'u', PIETA_PASSWORD: 'p' })
    assert.equal(corpo.ok, true)
    assert.deepEqual(corpo.pieta, { ok: false, motivo: 'sem armazenamento Postgres' })
  } finally {
    for (const [k, v] of [['PIETA_USER', salvo.u], ['PIETA_PASSWORD', salvo.p], ['NEON_DATABASE_URL', salvo.n], ['DATABASE_URL', salvo.d]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v
    }
  }
})

test('tick: com a Pieta ok, o resultado vem no campo pieta', async () => {
  const { corpo } = await chamarTick({ sincronizarPieta: async () => ({ ok: true, buscados: 2, planejados: 5, restantes: 3 }) })
  assert.equal(corpo.ok, true)
  assert.deepEqual(corpo.pieta, { ok: true, buscados: 2, planejados: 5, restantes: 3 })
})

test('tick: Groner demorado deixa a Pieta de fora (orçamento de 50 s com folga para os 60 s da função)', async () => {
  let chamou = false
  const r = await pietaNoTick(async () => { chamou = true; return { ok: true } }, 42000)
  assert.equal(chamou, false)
  assert.deepEqual(r, { ok: false, motivo: 'sem tempo no tick' })
  let orcamento = null
  await pietaNoTick(async (o) => { orcamento = o.orcamentoMs; return { ok: true } }, 5000)
  assert.equal(orcamento, 45000)
  // erro de cliente (ex.: 401) aparece com a mensagem; nenhum erro escapa
  const e401 = await pietaNoTick(async () => { throw Object.assign(new Error('Credencial da Pieta inválida (401)'), { status: 401 }) }, 0)
  assert.deepEqual(e401, { ok: false, erro: 'Credencial da Pieta inválida (401)' })
})
