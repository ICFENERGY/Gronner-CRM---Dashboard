import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FERRAMENTAS, executarFerramenta } from '../server/solarzMcp.js'

const agora = new Date('2026-10-29T15:00:00Z')
const meses = (total, esperado) => ['2026-07', '2026-08', '2026-09'].map((ym) => ({ ym, total, esperado }))
const registro = (id, nome, uf, total, status, extra = {}) => ({
  solarzId: id, nome, clienteNome: `Cliente ${id}`, estado: uf, potenciaKwp: 10, statusMonitoramento: status,
  meses: meses(total, 100), desempenho: { total30D: total, expected30D: 100, total365D: total * 12, expected365D: 1200 },
  dataInstalacao: '2020-01-01', ...extra,
})
const armazenada = {
  registros: [registro(1, 'Usina Alfa', 'SC', 40, 'CRITICO'), registro(2, 'Usina Beta', 'RS', 110, 'OK'), registro(3, 'Usina Gama', 'SC', 80, 'ALERTA')],
  simples: { usinas: [{ id: 1, premium: true }, { id: 2, premium: true }, { id: 3, premium: false }, { id: 4, premium: false }] },
  tickets: { total: 2, porTipo: { DESEMPENHO: 2 }, porUsina: { 1: { total: 2 } } },
  unidades: { porUsina: { 1: { ucs: [{ codigo: '123', concessionaria: 'CELESC' }] } } },
  farolHistorico: [{ data: '2026-10-28', contagens: { Normal: 1 } }, { data: '2026-10-29', contagens: { Normal: 1 } }],
  estado: { concluidoEm: '2026-10-29T09:50:00Z' },
}
const deps = (solarz = {}) => ({ pg: {}, agora, lerArmazenada: async () => armazenada, solarz })

test('todas as ferramentas têm nome único e esquema', () => {
  assert.equal(new Set(FERRAMENTAS.map((f) => f.name)).size, FERRAMENTAS.length)
  for (const f of FERRAMENTAS) assert.equal(f.inputSchema.type, 'object')
})

test('resumo do parque soma kWp, geração contra prognóstico e contagens', async () => {
  const r = await executarFerramenta('solarz_resumo_parque', {}, deps())
  assert.equal(r.usinas, 3)
  assert.equal(r.usinasNaConta, 4)
  assert.equal(r.potenciaTotalKwp, 30)
  assert.equal(r.geracaoVsPrognosticoPct, 76.7)
  assert.equal(r.usinasPorStatusDesempenho['Crítico'], 1)
  assert.equal(r.usinasPorFarol['Crítico'], 1)
  assert.equal(r.ticketsAbertos, 2)
})

test('listagem filtra por UF e ordena do pior para o melhor', async () => {
  const r = await executarFerramenta('solarz_listar_usinas', { uf: 'sc' }, deps())
  assert.deepEqual(r.usinas.map((u) => u.id), [1, 3])
  const so = await executarFerramenta('solarz_listar_usinas', { farol: 'Normal', premium: true }, deps())
  assert.deepEqual(so.usinas.map((u) => u.id), [2])
})

test('detalhe por nome traz desempenho ao vivo, UCs e tickets; nome ambíguo pede o id', async () => {
  const solarz = { solarzDesempenho: async () => ({ total1D: 5, expected1D: 10, total30D: 90, expected30D: 100 }) }
  const r = await executarFerramenta('solarz_detalhe_usina', { nome: 'alfa' }, deps(solarz))
  assert.equal(r.id, 1)
  assert.equal(r.desempenhoAoVivo['1D'].desempenhoPct, 50)
  assert.equal(r.unidadesConsumidoras[0].codigo, '123')
  assert.equal(r.ticketsAbertos.total, 2)
  await assert.rejects(executarFerramenta('solarz_detalhe_usina', { nome: 'usina' }, deps(solarz)), /Mais de uma usina/)
})

test('geração mensal calcula desempenho só de mês fechado', async () => {
  const solarz = { solarzEnergiaAno: async () => [{ yearMonth: '2026-09', total: 90, totalExpected: 100 }, { yearMonth: '2026-10', total: 30, totalExpected: 100 }] }
  const r = await executarFerramenta('solarz_geracao_mensal', { id: 1 }, deps(solarz))
  assert.equal(r.meses.length, 12)
  assert.equal(r.meses[8].desempenhoPct, 90)
  assert.equal(r.meses[9].desempenhoPct, null)
  assert.equal(r.meses[9].parcial, true)
})

test('relatório valida o formato dos meses', async () => {
  await assert.rejects(executarFerramenta('solarz_relatorio_periodo', { id: 1, inicio: '2026-1', fim: '2026-10' }, deps()), /AAAA-MM/)
  const solarz = { solarzRelatorioPeriodo: async () => [{ monthYear: '2026-02', generation: 1 }, { monthYear: '2026-01', generation: 2 }] }
  const r = await executarFerramenta('solarz_relatorio_periodo', { id: 1, inicio: '2026-01', fim: '2026-02' }, deps(solarz))
  assert.deepEqual(r.meses.map((m) => m.monthYear), ['2026-01', '2026-02'])
})

test('tickets usam o status pedido e filtram por usina', async () => {
  let corpo
  const solarz = {
    STATUS_TICKET_ABERTO: ['ABERTO'],
    solarzListarPaginado: async (_p, o) => { corpo = o.corpo; return { itens: [{ usinaId: 1, tipo: 'X' }, { usinaId: 2, tipo: 'X' }], completo: true } },
  }
  const r = await executarFerramenta('solarz_tickets', { id: 1, status: ['fechado'] }, deps(solarz))
  assert.deepEqual(corpo.filters.status, ['FECHADO'])
  assert.equal(r.total, 1)
})

test('farol separa quem está em alerta e corta o histórico', async () => {
  const r = await executarFerramenta('solarz_farol', { dias: 1 }, deps())
  assert.equal(r.hoje.Normal, 1)
  assert.deepEqual(r.usinasEmAlerta.map((u) => u.id), [1, 3])
  assert.equal(r.historico.length, 1)
})

test('sem dados guardados a ferramenta explica o motivo', async () => {
  const vazio = { ...deps(), lerArmazenada: async () => ({ registros: [] }) }
  await assert.rejects(executarFerramenta('solarz_resumo_parque', {}, vazio), /Ainda não há dados/)
})

test('endpoint exige a chave; com ela lista as 11 ferramentas', async () => {
  const { default: handler } = await import('../api/mcp-solarz.js')
  const chamar = async (headers = {}, query = {}) => {
    const res = { statusCode: 200, corpo: null, setHeader() {}, status(c) { this.statusCode = c; return this }, json(b) { this.corpo = b; return this }, end() { return this } }
    await handler({ method: 'POST', headers, query, body: { jsonrpc: '2.0', id: 1, method: 'tools/list' } }, res)
    return res
  }
  const antes = { a: process.env.MCP_SOLARZ_TOKEN, b: process.env.MCP_ACCESS_TOKEN }
  delete process.env.MCP_SOLARZ_TOKEN; delete process.env.MCP_ACCESS_TOKEN
  try {
    assert.equal((await chamar({}, { key: 'x' })).statusCode, 401)
    process.env.MCP_SOLARZ_TOKEN = 'chave-solarz'
    assert.equal((await chamar({}, { key: 'errada' })).statusCode, 401)
    const ok = await chamar({}, { key: 'chave-solarz' })
    assert.equal(ok.corpo.result.tools.length, 11)
  } finally {
    for (const [k, v] of [['MCP_SOLARZ_TOKEN', antes.a], ['MCP_ACCESS_TOKEN', antes.b]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
  }
})

test('sem OAuth: 401 sem WWW-Authenticate, rotas OAuth em 404 JSON e ?key= vale em POST, GET e DELETE', async () => {
  const { default: handler } = await import('../api/mcp-solarz.js')
  const chamar = async (method, { headers = {}, query = {} } = {}) => {
    const cab = {}
    const res = { statusCode: 200, corpo: null, setHeader(k, v) { cab[k.toLowerCase()] = v }, status(c) { this.statusCode = c; return this }, json(b) { this.corpo = b; return this }, end() { return this } }
    await handler({ method, headers, query, body: { jsonrpc: '2.0', id: 1, method: 'initialize' } }, res)
    return { res, cab }
  }
  const antes = process.env.MCP_SOLARZ_TOKEN
  process.env.MCP_SOLARZ_TOKEN = 'chave-solarz'
  try {
    const sem = await chamar('POST')
    assert.equal(sem.res.statusCode, 401)
    assert.equal(sem.cab['www-authenticate'], undefined)
    for (const m of ['POST', 'GET']) {
      const r = await chamar(m, { query: { nao_oauth: '1' } })
      assert.equal(r.res.statusCode, 404)
      assert.equal(r.res.corpo.error, 'not_found')
    }
    assert.equal((await chamar('POST', { query: { key: 'chave-solarz' } })).res.statusCode, 200)
    assert.equal((await chamar('GET', { query: { key: 'chave-solarz' } })).res.statusCode, 200)
    assert.equal((await chamar('DELETE', { query: { key: 'chave-solarz' } })).res.statusCode, 204)
    assert.equal((await chamar('DELETE')).res.statusCode, 401)
  } finally { if (antes === undefined) delete process.env.MCP_SOLARZ_TOKEN; else process.env.MCP_SOLARZ_TOKEN = antes }
})

test('atualizadoEm do resumo sai em horário de Brasília', async () => {
  const r = await executarFerramenta('solarz_resumo_parque', {}, deps())
  assert.equal(r.atualizadoEm, '2026-10-29 06:50:00')
})

test('geração diária: mês, intervalo, limite de 92 dias e não premium', async () => {
  const dias = [{ date: '2026-10-01', total: 10.04, totalExpected: 12 }, { date: '2026-10-02', total: 5, totalExpected: 12 }]
  const chamadas = []
  const solarz = {
    solarzEnergiaMes: async (...a) => { chamadas.push(['mes', ...a]); return dias },
    solarzEnergiaIntervalo: async (...a) => { chamadas.push(['dia', ...a]); return dias },
  }
  const m = await executarFerramenta('solarz_geracao_diaria', { id: 1, mes: '2026-10' }, deps(solarz))
  assert.equal(m.totalGeracaoKwh, 15)
  assert.deepEqual(chamadas[0], ['mes', 1, '2026-10'])
  const i = await executarFerramenta('solarz_geracao_diaria', { id: 1, de: '2026-10-01', ate: '2026-12-31' }, deps(solarz))
  assert.equal(i.dias.length, 2)
  await assert.rejects(executarFerramenta('solarz_geracao_diaria', { id: 1, de: '2026-01-01', ate: '2026-06-30' }, deps(solarz)), /máximo/)
  await assert.rejects(executarFerramenta('solarz_geracao_diaria', { id: 1, mes: '2026-13' }, deps(solarz)), /AAAA-MM/)
  await assert.rejects(executarFerramenta('solarz_geracao_diaria', { id: 1 }, deps(solarz)), /Informe mes/)
  const np = await executarFerramenta('solarz_geracao_diaria', { id: 1, mes: '2026-10' }, deps({ solarzEnergiaMes: async () => { throw Object.assign(new Error('x'), { code: 'SOLARZ_NAO_PREMIUM' }) }, ehIndisponivel: (e) => e.code === 'SOLARZ_NAO_PREMIUM' }))
  assert.match(np.aviso, /não premium/)
})

test('assinaturas: devolve plano e licenças; 403 vira aviso', async () => {
  const ok = await executarFerramenta('solarz_assinaturas', {}, deps({ solarzListarAssinaturas: async () => ({ itens: [{ id: 1, name: 'Pro', availableLicenses: 4 }] }) }))
  assert.deepEqual(ok.assinaturas, [{ plano: 'Pro', licencasDisponiveis: 4 }])
  const negado = await executarFerramenta('solarz_assinaturas', {}, deps({ solarzListarAssinaturas: async () => { throw Object.assign(new Error('x'), { status: 403 }) } }))
  assert.match(negado.aviso, /403/)
})
