import test, { beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import express from 'express'
import { PGlite } from '@electric-sql/pglite'
import {
  solarzListarUsinas, solarzListarTicketsAbertos, solarzEnergiaAno, solarzDesempenho, classificarErro, ehIndisponivel,
} from '../server/solarzClient.js'
import { mapUsina, mesclarUsinasComRelatorio } from '../server/mappers.js'
import {
  classificarDesempenho, derivarRegistro, normalizarMeses, solarzRegistroParaArmazenar, agruparTickets, agruparUnidades, rotuloFarol, contarFarol, ENTIDADE_SOLARZ,
} from '../server/solarzMetricas.js'
import { planejarBusca, sincronizarSolarz, lerSolarzArmazenada } from '../server/solarzSync.js'
import { createPgSql } from '../server/pgSql.js'
import { createSyncRouter } from '../server/syncRoutes.js'

const SQL = fs.readFileSync(new URL('../neon/dashboard-gronner-crm.sql', import.meta.url), 'utf8')
const fetchOriginal = globalThis.fetch
const ENV = ['SOLARZ_USER', 'SOLARZ_PASSWORD', 'GRONER_SYNC_TOKEN', 'CRON_SECRET', 'NEON_DATABASE_URL']
const envOriginal = Object.fromEntries(ENV.map((k) => [k, process.env[k]]))

beforeEach(() => { process.env.SOLARZ_USER = 'u'; process.env.SOLARZ_PASSWORD = 'p' })
afterEach(() => {
  globalThis.fetch = fetchOriginal
  for (const k of ENV) { if (envOriginal[k] === undefined) delete process.env[k]; else process.env[k] = envOriginal[k] }
})

const resp = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => data })
const lote = (n, ini = 0) => Array.from({ length: n }, (_, i) => ({ id: ini + i }))
const AGORA = new Date('2026-10-29T15:00:00Z') // outubro em andamento -> último mês fechado = setembro/2026

// --- cliente ---
test('paginação base 1 (a da API real): páginas 1 e 2', async () => {
  const pedidas = []
  globalThis.fetch = async (_u, o) => { const { page } = JSON.parse(o.body); pedidas.push(page); return resp(200, { content: page === '1' ? lote(3) : lote(1, 3), last: page === '2' }) }
  const usinas = await solarzListarUsinas({ pageSize: 3 })
  assert.equal(usinas.length, 4)
  assert.deepEqual(pedidas, ['1', '2'])
})

test('paginação base 0: página 1 recusada com 400 refaz a partir da 0', async () => {
  const pedidas = []
  globalThis.fetch = async (_u, o) => {
    const { page } = JSON.parse(o.body); pedidas.push(page)
    if (page === '1' && pedidas.length === 1) return resp(400, { message: 'Dados inválidos' })
    return resp(200, { content: page === '0' ? lote(2) : [] })
  }
  const usinas = await solarzListarUsinas({ pageSize: 2, esperaMs: 1 })
  assert.equal(usinas.length, 2)
  assert.deepEqual(pedidas.slice(0, 2), ['1', '0'])
})

test('base ambígua: API que ignora a página não entra em laço (id repetido)', async () => {
  let chamadas = 0
  globalThis.fetch = async () => { chamadas++; return resp(200, { content: lote(4) }) }
  assert.equal((await solarzListarUsinas({ pageSize: 4 })).length, 4)
  assert.equal(chamadas, 2)
})

test('"Recurso nao disponivel" e "não é premium" viram indisponível e não são repetidos', async () => {
  assert.equal(classificarErro(500, 'Recurso nao disponivel para o integrador'), 'SOLARZ_INDISPONIVEL')
  assert.equal(classificarErro(401, 'Recurso nao disponivel para o integrador'), 'SOLARZ_INDISPONIVEL')
  assert.equal(classificarErro(400, 'Essa usina não é premium.'), 'SOLARZ_NAO_PREMIUM')
  assert.equal(classificarErro(401, 'Unauthorized'), null)
  let chamadas = 0
  globalThis.fetch = async () => { chamadas++; return resp(500, { message: 'Recurso nao disponivel para o integrador' }) }
  await assert.rejects(solarzDesempenho(1, { esperaMs: 1 }), (e) => ehIndisponivel(e))
  assert.equal(chamadas, 1)
  globalThis.fetch = async () => { chamadas++; return resp(400, { msg: 'Essa usina não é premium.' }) }
  await assert.rejects(solarzEnergiaAno(1, 2026), (e) => e.code === 'SOLARZ_NAO_PREMIUM')
})

test('tickets: pede só os status em aberto', async () => {
  let corpo
  globalThis.fetch = async (_u, o) => { corpo = JSON.parse(o.body); return resp(200, { content: [], last: true }) }
  await solarzListarTicketsAbertos()
  assert.deepEqual(corpo.filters.status, ['ABERTO', 'EM_ANDAMENTO', 'EM_ESPERA'])
})

// --- privacidade ---
const usinaBruta = (extra = {}) => ({
  id: 10, name: 'USINA A', installedPower: 10, energyProducedKwh: 5, status: { status: 'OK', at: '2026-10-01' }, dataInstalacao: '2025-02-10',
  cliente: { nome: 'Fulano', email: 'fulano@x.com', cpf: '12345678900', telefone: '11999990000', concessionaria: 'CPFL' },
  endereco: { cidade: 'Campinas', siglaEstado: 'SP', logradouro: 'Rua Secreta 1', bairro: 'Centro Secreto', cep: '13000000', latitude: 1, longitude: 2 },
  responsavel: { nome: 'Resp', email: 'resp@x.com' },
  ...extra,
})
const sensivel = (txt) => ['fulano@x.com', '12345678900', '11999990000', 'Rua Secreta', 'Centro Secreto', '13000000', 'resp@x.com', 'Resp'].filter((s) => txt.includes(s))

test('privacidade: mapUsina e o registro guardado não levam e-mail, CPF, telefone, endereço nem responsável', () => {
  const u = mapUsina(usinaBruta())
  assert.deepEqual(sensivel(JSON.stringify(u)), [])
  assert.equal(u.clienteNome, 'Fulano')
  const reg = solarzRegistroParaArmazenar(u, { meses: [] }, AGORA)
  assert.deepEqual(sensivel(JSON.stringify(reg)), [])
  const un = agruparUnidades([{ id: 10, name: 'USINA A', cliente: { email: 'fulano@x.com' }, unidades: [{ id: 1, denominacao: 'Fulano LTDA', contrato: '123', concessionariaSigla: 'CPFL' }] }])
  assert.deepEqual(un['10'].ucs, [{ codigo: '123', concessionaria: 'CPFL' }])
  assert.ok(!JSON.stringify(un).includes('Fulano'))
  const tk = agruparTickets([{ usinaId: 10, usinaName: 'USINA A', tipo: 'GERACAO', status: 'ABERTO', titulo: 'Falar com Fulano', clienteName: 'Fulano' }])
  assert.ok(!JSON.stringify(tk).includes('Fulano'))
})

// --- desempenho ---
const meses = (lista) => lista.map(([ym, total, esperado]) => ({ ym, total, esperado }))
const registro = (extra = {}) => ({
  solarzId: 10, nome: 'USINA A', dataInstalacao: '2025-02-10', buscadoEm: AGORA.toISOString(), anoCarga: 2026, totalInvestido: 1000,
  desempenho: { total30D: 80, expected30D: 100, total365D: 1150, expected365D: 1000 },
  meses: meses([['2026-01', 100, 100], ['2026-02', 90, 100], ['2026-07', 50, 100], ['2026-08', 60, 100], ['2026-09', 90, 100], ['2026-10', 40, 100], ['2026-11', 0, 120]]),
  ...extra,
})

test('derivarRegistro: mês de referência é o último fechado; corrente é parcial; futuro só prognóstico', () => {
  const d = derivarRegistro(registro(), AGORA)
  assert.equal(d.mesAnoRecente, 'setembro/2026')
  assert.equal(d.geracaoKwhMes, 90)
  assert.equal(d.prognosticoKwhMes, 100)
  assert.equal(d.desempenhoMesPct, 0.9)
  assert.equal(d.desempenho30dPct, 0.8)
  assert.equal(d.desempenho12mPct, 1.15)
  assert.ok(Math.abs(d.desempenhoMedio3mPct - (0.5 + 0.6 + 0.9) / 3) < 1e-9) // jul, ago, set
  assert.equal(d.statusDesempenho, 'Atenção') // 67%
  const out = d.mensal[9]
  assert.deepEqual([out.geracaoKwh, out.desempenhoPct, out.parcial], [40, null, true])
  const nov = d.mensal[10]
  assert.deepEqual([nov.geracaoKwh, nov.desempenhoPct, nov.prognosticoKwh], [null, null, 120])
  assert.equal(d.mensal[0].desempenhoPct, 1)
})

test('derivarRegistro: janeiro usa dezembro do ano anterior; prognóstico 0 deixa desempenho em branco; acima de 100% vale', () => {
  const jan = new Date('2027-01-15T15:00:00Z')
  const d = derivarRegistro(registro({ meses: meses([['2026-12', 173.6, 100], ['2026-11', 10, 0], ['2027-01', 5, 100]]) }), jan)
  assert.equal(d.mesAnoRecente, 'dezembro/2026')
  assert.equal(d.desempenhoMesPct, 1.736)
  assert.equal(d.anoMensal, 2027)
  const d2 = derivarRegistro(registro({ meses: meses([['2026-09', 10, 0]]) }), AGORA)
  assert.equal(d2.desempenhoMesPct, null)
  assert.equal(d2.statusDesempenho, 'Sem dado')
})

test('derivarRegistro: meses antes da instalação não contam como desempenho zero', () => {
  const d = derivarRegistro(registro({ dataInstalacao: '2026-08-20', meses: meses([['2026-07', 0, 80], ['2026-08', 30, 100], ['2026-09', 90, 100]]) }), AGORA)
  assert.equal(d.mensal[6].desempenhoPct, null)
  assert.ok(Math.abs(d.desempenhoMedio3mPct - (0.3 + 0.9) / 2) < 1e-9)
})

test('faixas de status (média 3M): 0-50 crítico, 51-70 atenção, 71+ dentro, sem média = sem dado', () => {
  for (const [v, s] of [[0, 'Crítico'], [0.4898, 'Crítico'], [0.5, 'Crítico'], [0.51, 'Atenção'], [0.6944, 'Atenção'], [0.7, 'Atenção'], [0.7146, 'Dentro do esperado'], [1.569, 'Dentro do esperado'], [null, 'Sem dado']]) {
    assert.equal(classificarDesempenho(v), s, String(v))
  }
})

test('farol: mapeia status.status da Open API', () => {
  assert.deepEqual(['OK', 'ALERTA', 'CRITICO', 'DESCONHECIDO', null].map(rotuloFarol), ['Normal', 'Com alerta', 'Crítico', 'Desconhecido', 'Desconhecido'])
  assert.deepEqual(contarFarol([{ status: 'OK' }, { status: 'OK' }, { status: 'ALERTA' }]), { Normal: 2, 'Com alerta': 1, Crítico: 0, Desconhecido: 0 })
})

test('normalizarMeses ignora lixo', () => {
  assert.deepEqual(normalizarMeses([{ yearMonth: '2026-01', total: 1, totalExpected: 2 }, { yearMonth: 'x' }, null]), [{ ym: '2026-01', total: 1, esperado: 2 }])
  assert.deepEqual(normalizarMeses(null), [])
})

// --- mesclagem ---
const relatorio = {
  extraidoEm: '2026-09-11T18:14:00-03:00',
  usinas: [
    { nome: 'USINA A', cliente: 'Fulano', totalInvestido: 5, concessionaria: 'CPFL', cidade: 'Campinas', estado: 'SP', classe: 'Residencial', plano: 'PRO/Avançado', potenciaKwp: 10, mesAnoRecente: 'agosto/2026', prognosticoKwhMes: 1, geracaoKwhMes: 1, desempenhoMesPct: 1, desempenho30dPct: 1, desempenho12mPct: 1, desempenhoMedio3mPct: 1, statusDesempenho: 'Dentro do esperado', dataInstalacao: '2025-02-10', mensal2026: [{ mes: 'Jan', geracaoKwh: 1, desempenhoPct: 1 }], observacao: null },
    { nome: 'Usina Sé', cliente: null, totalInvestido: null, concessionaria: null, cidade: null, estado: null, classe: null, plano: null, potenciaKwp: 3, mesAnoRecente: 'agosto/2026', prognosticoKwhMes: 5, geracaoKwhMes: 4, desempenhoMesPct: 0.8, desempenho30dPct: null, desempenho12mPct: null, desempenhoMedio3mPct: 0.8, statusDesempenho: 'Dentro do esperado', dataInstalacao: null, mensal2026: [], observacao: null },
    { nome: 'SEM PREMIUM', cliente: 'Beltrano', totalInvestido: 9, concessionaria: 'ELEKTRO', cidade: 'X', estado: 'SP', classe: null, plano: null, potenciaKwp: 3, mesAnoRecente: 'agosto/2026', prognosticoKwhMes: 5, geracaoKwhMes: 4, desempenhoMesPct: 0.8, desempenho30dPct: null, desempenho12mPct: null, desempenhoMedio3mPct: 0.8, statusDesempenho: 'Dentro do esperado', dataInstalacao: null, mensal2026: [], observacao: null },
  ],
}

test('mesclagem: dado ao vivo substitui o relatório (id e nome), com fonte, data, UC e tickets', () => {
  const aoVivo = [mapUsina(usinaBruta())]
  const reg = registro()
  const regSe = registro({ solarzId: 11, nome: 'USINA SE' }) // sem id ao vivo: casa por nome normalizado ('Usina Sé')
  const regSolto = registro({ solarzId: 12, nome: 'SO NA API' })
  const us = mesclarUsinasComRelatorio(aoVivo, relatorio, {
    registros: [reg, regSe, regSolto], agora: AGORA,
    unidades: { porUsina: { 10: { nome: 'USINA A', ucs: [{ codigo: '777', concessionaria: 'CPFL' }] } } },
    tickets: { total: 1, porTipo: { GERACAO: 1 }, porUsina: { 10: { nome: 'USINA A', total: 1, porTipo: { GERACAO: 1 }, afetamDesempenho: 1 } } },
    simples: { usinas: [{ id: 99, nome: 'NOVA SEM DADO', premium: true }, { id: 10, nome: 'USINA A', premium: true }] },
  })
  const a = us.find((u) => u.nome === 'USINA A')
  assert.equal(a.fonte, 'solarz')
  assert.equal(a.dadoEm, reg.buscadoEm)
  assert.equal(a.id, 10)
  assert.equal(a.geracaoKwhMes, 90)
  assert.equal(a.mesAnoRecente, 'setembro/2026')
  assert.equal(a.totalInvestido, 1000)
  assert.equal(a.plano, 'PRO/Avançado') // o que a API não traz continua do relatório
  assert.equal(a.anoMensal, 2026)
  assert.equal(a.mensal.length, 12)
  assert.deepEqual(a.unidadesConsumidoras, ['777'])
  assert.equal(a.ticketsAbertos, 1)
  assert.deepEqual(a.ticketsAbertosPorTipo, { GERACAO: 1 })
  assert.equal(us.find((u) => u.nome === 'Usina Sé').fonte, 'solarz') // casou por nome
  assert.equal(us.find((u) => u.nome === 'Usina Sé').cidade, 'Pendente') // sem cliente vinculado
  const sp = us.find((u) => u.nome === 'SEM PREMIUM')
  assert.equal(sp.fonte, 'relatorio')
  assert.equal(sp.geracaoKwhMes, 4)
  assert.match(sp.observacao, /sem monitoramento premium — dados do último levantamento/)
  assert.equal(sp.ticketsAbertos, 0)
  const solto = us.find((u) => u.nome === 'SO NA API')
  assert.equal(solto.fonte, 'solarz') // só na carga, entra com dado ao vivo
  assert.equal(us.find((u) => u.nome === 'NOVA SEM DADO').observacao, 'requer complementação manual')
  assert.deepEqual(sensivel(JSON.stringify(us)), [])
})

test('mesclagem sem dados do banco devolve o relatório como antes', () => {
  const us = mesclarUsinasComRelatorio([], relatorio)
  assert.equal(us.length, 3)
  assert.ok(us.every((u) => u.fonte === 'relatorio'))
  assert.equal(us[0].geracaoKwhMes, 1)
  assert.equal(us[0].unidadesConsumidoras, null)
  assert.equal(us[0].ticketsAbertos, null)
  assert.equal(us[2].observacao, null)
})

// --- carga ---
async function criarBanco() {
  const db = new PGlite()
  await db.exec(SQL)
  await db.exec(SQL)
  const pg = createPgSql({ executar: async (t, p = []) => (await db.query(t, p)).rows, esperaRetentativaMs: 1, log: () => {} })
  return { db, pg }
}
const dados = (extra = {}) => ({
  listarUsinas: async () => ({ itens: [usinaBruta(), usinaBruta({ id: 11, name: 'USINA B', status: { status: 'ALERTA' } })], completo: true }),
  energia: async (id, ano) => [{ yearMonth: `${ano}-09`, total: 90, totalExpected: 100 }],
  desempenho: async () => ({ total30D: 1, expected30D: 2, total365D: 3, expected365D: 4, installationDate: '2025-02-10' }),
  relatorio: async () => [{ monthYear: '2026-01-31', totalInvested: 10 }, { monthYear: '2026-09-30', totalInvested: 20 }],
  unidades: async () => ({ itens: [{ id: 10, name: 'USINA A', unidades: [{ contrato: '555', concessionariaSigla: 'CPFL', denominacao: 'Fulano' }] }] }),
  tickets: async () => ({ itens: [{ usinaId: 10, usinaName: 'USINA A', tipo: 'MANUTENCAO', status: 'ABERTO' }] }),
  simples: async () => ({ itens: [{ id: 10, denominacao: 'USINA A', premium: true }, { id: 50, denominacao: 'NAO PREMIUM', premium: false }] }),
  ...extra,
})

test('carga: grava no Neon (PGlite), é incremental, guarda farol diário e não grava dado pessoal', async () => {
  const { db, pg } = await criarBanco()
  let chamadasEnergia = 0
  const d = dados({ energia: async (id, ano) => { chamadasEnergia++; return dados().energia(id, ano) } })
  const r1 = await sincronizarSolarz({ pg, ...d })
  assert.equal(r1.buscadas, 2)
  assert.equal(chamadasEnergia, 4) // 2 usinas x (ano + anterior)
  assert.deepEqual(r1.complementos, { unidades: 'ok', tickets: 'ok', simples: 'ok' })
  const r2 = await sincronizarSolarz({ pg, ...d })
  assert.equal(r2.buscadas, 0) // dado recente: nada a refazer
  assert.equal(chamadasEnergia, 4)
  const lido = await lerSolarzArmazenada(pg)
  assert.equal(lido.registros.length, 2)
  assert.equal(lido.registros[0].totalInvestido, 20) // relatório mais recente
  assert.equal(lido.tickets.total, 1)
  assert.deepEqual(lido.unidades.porUsina['10'].ucs, [{ codigo: '555', concessionaria: 'CPFL' }])
  assert.equal(lido.simples.usinas.length, 2)
  assert.equal(lido.farolHistorico.length, 1)
  assert.deepEqual(lido.farolHistorico[0].contagens, { Normal: 1, 'Com alerta': 1, Crítico: 0, Desconhecido: 0 })
  const bruto = JSON.stringify((await db.query(`select dados from public."DASHBOARD-GRONNER-CRM" where entidade = '${ENTIDADE_SOLARZ}'`)).rows)
  assert.deepEqual(sensivel(bruto), [])
  assert.ok(!bruto.includes('denominacao'))

  // dado velho (> 20 h) é refeito
  const depois = Date.now() + 21 * 3600e3
  const r3 = await sincronizarSolarz({ pg, ...d, agora: () => depois })
  assert.equal(r3.buscadas, 2)
})

test('carga: listagem vazia ou incompleta não desativa nada; listagem completa desativa quem sumiu', async () => {
  const { pg } = await criarBanco()
  await sincronizarSolarz({ pg, ...dados() })
  const vazia = await sincronizarSolarz({ pg, ...dados({ listarUsinas: async () => ({ itens: [], completo: true }) }) })
  assert.equal(vazia.removidas, 0)
  const incompleta = await sincronizarSolarz({ pg, ...dados({ listarUsinas: async () => ({ itens: [usinaBruta()], completo: false }) }) })
  assert.equal(incompleta.removidas, 0)
  assert.equal((await lerSolarzArmazenada(pg)).registros.length, 2)
  const completa = await sincronizarSolarz({ pg, ...dados({ listarUsinas: async () => ({ itens: [usinaBruta()], completo: true }) }) })
  assert.equal(completa.removidas, 1)
  assert.equal((await lerSolarzArmazenada(pg)).registros.length, 1)
})

test('carga: rota indisponível não derruba; não premium é registrado; 401 para tudo e não grava', async () => {
  const { pg } = await criarBanco()
  const naoPremium = () => Object.assign(new Error('Essa usina não é premium.'), { status: 400, code: 'SOLARZ_NAO_PREMIUM' })
  const indisp = () => Object.assign(new Error('Recurso nao disponivel para o integrador'), { status: 500, code: 'SOLARZ_INDISPONIVEL' })
  const r = await sincronizarSolarz({ pg, ...dados({ energia: async () => { throw naoPremium() }, relatorio: async () => { throw indisp() }, tickets: async () => { throw indisp() } }) })
  assert.equal(r.buscadas, 2)
  assert.equal(r.complementos.tickets, 'indisponivel')
  const lido = await lerSolarzArmazenada(pg)
  assert.ok(lido.registros.every((x) => x.indisponiveis.includes('energia') && x.meses.length === 0))
  const { pg: pg2 } = await criarBanco()
  await assert.rejects(sincronizarSolarz({ pg: pg2, ...dados({ energia: async () => { throw Object.assign(new Error('cred'), { status: 401 }) } }) }), /cred/)
  assert.equal((await lerSolarzArmazenada(pg2)).registros.length, 0)
})

test('carga: respeita o orçamento e deixa o resto para a próxima', async () => {
  const { pg } = await criarBanco()
  let relogio = 1_000_000
  const lista = Array.from({ length: 5 }, (_, i) => usinaBruta({ id: 100 + i, name: `U${i}` }))
  const d = dados({ listarUsinas: async () => ({ itens: lista, completo: true }), energia: async (id, ano) => { relogio += 10; return dados().energia(id, ano) } })
  const r1 = await sincronizarSolarz({ pg, ...d, agora: () => relogio, orcamentoMs: 25, concorrencia: 1 })
  assert.ok(r1.buscadas > 0 && r1.buscadas < 5)
  const r2 = await sincronizarSolarz({ pg, ...d, agora: () => relogio, orcamentoMs: 100000, concorrencia: 2 })
  assert.equal(r1.buscadas + r2.buscadas, 5)
})

test('planejarBusca: novas, de outro ano e velhas', () => {
  const agoraMs = Date.parse('2026-10-29T12:00:00Z')
  const velho = new Date(agoraMs - 21 * 3600e3).toISOString()
  const novo = new Date(agoraMs - 3600e3).toISOString()
  const guardados = [
    { solarzId: 1, anoCarga: 2026, buscadoEm: novo },
    { solarzId: 2, anoCarga: 2025, buscadoEm: novo },
    { solarzId: 3, anoCarga: 2026, buscadoEm: velho },
  ]
  assert.deepEqual(planejarBusca([1, 2, 3, 4].map((id) => ({ id })), guardados, agoraMs).map((u) => u.id), [4, 2, 3])
})

// --- rota ---
async function chamarRota(opcoes, cabecalhos = {}) {
  const app = express()
  app.use('/api/sync/groner', createSyncRouter({ store: {}, ...opcoes }))
  const servidor = await new Promise((ok) => { const s = app.listen(0, () => ok(s)) })
  try {
    const res = await fetchOriginal(`http://127.0.0.1:${servidor.address().port}/api/sync/groner/solarz`, { headers: cabecalhos })
    return { status: res.status, corpo: await res.json() }
  } finally { servidor.close() }
}

test('rota /solarz: exige chave e, sem credencial, devolve 200 ok:false', async () => {
  process.env.GRONER_SYNC_TOKEN = 'chave-de-teste'
  process.env.NEON_DATABASE_URL = 'postgresql://x:y@localhost/db'
  delete process.env.SOLARZ_USER
  delete process.env.SOLARZ_PASSWORD
  assert.equal((await chamarRota({})).status, 401)
  const ok = await chamarRota({}, { 'X-Groner-Sync-Token': 'chave-de-teste' })
  assert.equal(ok.status, 200)
  assert.deepEqual(ok.corpo, { ok: false, motivo: 'sem credencial' })
  process.env.CRON_SECRET = 'cron'
  const cron = await chamarRota({ sincronizarSolarz: async () => ({ ok: true, buscadas: 3 }) }, { Authorization: 'Bearer cron' })
  assert.deepEqual(cron.corpo, { ok: true, buscadas: 3 })
})

// --- correções da revisão ---
test('privacidade: coordenadas (latitude/longitude) da usina não saem para o front', () => {
  const u = mapUsina(usinaBruta())
  assert.equal('latitude' in u, false)
  assert.equal('longitude' in u, false)
  const us = mesclarUsinasComRelatorio([u, mapUsina(usinaBruta({ id: 77, name: 'FORA DO RELATORIO' }))], relatorio, { registros: [registro()], agora: AGORA })
  assert.ok(us.every((x) => !('latitude' in x) && !('longitude' in x)))
})

test('mesclagem: campos do mês de referência andam juntos (nulo ao vivo não herda valor de outro mês do relatório)', () => {
  // setembro ao vivo sem prognóstico: geração vale, desempenho do mês fica em branco, sem o 100% de agosto do relatório
  const reg = registro({ meses: meses([['2026-07', 50, 100], ['2026-08', 60, 100], ['2026-09', 90, null]]) })
  const a = mesclarUsinasComRelatorio([], relatorio, { registros: [reg], agora: AGORA }).find((u) => u.nome === 'USINA A')
  assert.equal(a.mesAnoRecente, 'setembro/2026')
  assert.equal(a.geracaoKwhMes, 90)
  assert.equal(a.prognosticoKwhMes, null)
  assert.equal(a.desempenhoMesPct, null)
})

test('carga: listas complementares respeitam o orçamento e recebem o prazo restante', async () => {
  const { pg } = await criarBanco()
  let relogio = 1_000_000
  const prazos = []
  const d = dados({
    unidades: async (o) => { prazos.push(o?.prazoMs); relogio += 36000; return dados().unidades() }, // lista lenta: gasta 36 s
    tickets: async () => { throw new Error('não deveria ser chamada sem tempo') },
    simples: async () => { throw new Error('não deveria ser chamada sem tempo') },
  })
  const r = await sincronizarSolarz({ pg, ...d, agora: () => relogio, orcamentoMs: 40000 })
  assert.ok(prazos[0] > 0 && prazos[0] <= 15000)
  assert.equal(r.complementos.unidades, 'ok')
  assert.equal(r.complementos.tickets, 'sem tempo')
  assert.equal(r.complementos.simples, 'sem tempo')
})
