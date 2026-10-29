import test, { beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import express from 'express'
import { PGlite } from '@electric-sql/pglite'
import { pietaResumo, pietaDetalheProjeto } from '../server/pietaClient.js'
import { mapPietaProjetoDetalhe } from '../server/mappers.js'
import { calcularMetricasPieta, normalizarPendencia, pietaRegistroParaArmazenar, ENTIDADE_PIETA } from '../server/pietaMetricas.js'
import { planejarBusca, sincronizarPieta, lerPietaArmazenada } from '../server/pietaSync.js'
import { createPgSql } from '../server/pgSql.js'
import { createSyncRouter } from '../server/syncRoutes.js'

const SQL = fs.readFileSync(new URL('../neon/dashboard-gronner-crm.sql', import.meta.url), 'utf8')
const fetchOriginal = globalThis.fetch
const ENV = ['PIETA_USER', 'PIETA_PASSWORD', 'GRONER_SYNC_TOKEN', 'CRON_SECRET', 'NEON_DATABASE_URL']
const envOriginal = Object.fromEntries(ENV.map((k) => [k, process.env[k]]))

beforeEach(() => {
  process.env.PIETA_USER = 'u'
  process.env.PIETA_PASSWORD = 'p'
})
afterEach(() => {
  globalThis.fetch = fetchOriginal
  for (const k of ENV) {
    if (envOriginal[k] === undefined) delete process.env[k]
    else process.env[k] = envOriginal[k]
  }
})

const resp = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => data })
const rapido = { esperaMs: 1 }

// --- fixtures baseadas no contrato API-PIEP-V3 ---
const detalheBruto = (extra = {}) => ({
  user_id: 1, project_id: 10, status: 'Em Desenvolvimento', client_name: 'Cliente A', power: '6.6', power_distributor: 'CPFL',
  power_distributor_state: 'SP', created_at: '2026-08-01', last_status_change: '2026-09-10', due_date: '2026-09-20', message: null,
  days_since_created: 60, tempo_total_dias: 30, medidor_substituido_date: null,
  status_timeline: [
    { etapa: 'Projeto Criado', entrou_em: '2026-08-01T10:00:00', saiu_em: '2026-08-05T10:00:00', tempo_na_etapa_dias: 4 },
    { etapa: 'Em Desenvolvimento', entrou_em: '2026-08-05T10:00:00', saiu_em: '2026-08-15T10:00:00', tempo_na_etapa_dias: 10 },
    { etapa: 'Aguardando Pagamento', entrou_em: '2026-08-15T10:00:00', saiu_em: '2026-08-20T10:00:00', tempo_na_etapa_dias: 5 },
    { etapa: 'Em Desenvolvimento', entrou_em: '2026-08-20T10:00:00', saiu_em: null, tempo_na_etapa_dias: 3 }, // revisita + etapa atual
  ],
  main_contact: { name: 'Maria', phone: '11999990000' },
  pendencies: ['Falta ART'],
  payment: { method: 'pix', total_paid: 1000, balance_used: 0 },
  inversors: [], solar_panels: [], project_value: 5000,
  changes: [{ price: 100, status: 'Aprovada', payment: 'pix', created_at: '2026-09-01', request_fields: [], response_status: 'ok', change_integrator_detail: 'segredo' }],
  changes_total: 1, total_value: 5100,
  ...extra,
})

// --- privacidade ---
test('mapPietaProjetoDetalhe nao repassa telefone, pagamento nem detalhe do integrador', () => {
  const m = mapPietaProjetoDetalhe(detalheBruto())
  assert.deepEqual(m.mainContact, { name: 'Maria' })
  const json = JSON.stringify(m)
  assert.ok(!json.includes('11999990000'))
  assert.ok(!json.includes('segredo'))
  assert.ok(!('payment' in m))
  assert.ok(!m.changes.some((c) => 'payment' in c || 'changeIntegratorDetail' in c))
})

test('mapPietaProjetoDetalhe aguenta contato, timeline e changes nulos', () => {
  const m = mapPietaProjetoDetalhe(detalheBruto({ main_contact: null, status_timeline: null, changes: null, pendencies: null, changes_total: undefined }))
  assert.equal(m.mainContact, null)
  assert.deepEqual(m.statusTimeline, [])
  assert.equal(m.changesTotal, 0)
})

test('registro armazenado nao guarda telefone, contato nem pagamento', () => {
  const r = pietaRegistroParaArmazenar({ project_id: 10, status: 'X' }, detalheBruto())
  const json = JSON.stringify(r)
  for (const proibido of ['11999990000', 'Maria', 'segredo', 'pix']) assert.ok(!json.includes(proibido), proibido)
})

// --- cliente resiliente ---
test('sem credencial falha na hora e nao chama a rede', async () => {
  delete process.env.PIETA_USER
  let chamadas = 0
  globalThis.fetch = async () => { chamadas++; return resp(200, []) }
  await assert.rejects(pietaResumo(), /PIETA_USER/)
  assert.equal(chamadas, 0)
})

test('desembrulha o array, envia Basic Auth e project_id', async () => {
  let visto
  globalThis.fetch = async (url, opts) => { visto = { url: String(url), auth: opts.headers.Authorization, sinal: opts.signal }; return resp(200, [{ project_id: 7 }]) }
  const d = await pietaDetalheProjeto(7, rapido)
  assert.equal(d.project_id, 7)
  assert.match(visto.url, /project_id=7/)
  assert.equal(visto.auth, 'Basic ' + Buffer.from('u:p').toString('base64'))
  assert.ok(visto.sinal)
})

test('5xx, 429 e erro de rede sao repetidos ate dar certo', async () => {
  const respostas = [() => resp(500, { error: true, mensagem: 'x' }), () => { throw new TypeError('fetch failed') }, () => resp(200, [{ ok: 1 }])]
  let n = 0
  globalThis.fetch = async () => respostas[n++]()
  assert.deepEqual(await pietaResumo(rapido), { ok: 1 })
  assert.equal(n, 3)
  n = 0
  globalThis.fetch = async () => (n++ === 0 ? resp(429, null) : resp(200, [{ ok: 2 }]))
  assert.deepEqual(await pietaResumo(rapido), { ok: 2 })
})

test('desiste apos 3 tentativas', async () => {
  let n = 0
  globalThis.fetch = async () => { n++; return resp(503, { error: true, mensagem: 'fora' }) }
  await assert.rejects(pietaResumo(rapido), /fora/)
  assert.equal(n, 3)
})

test('401 e 404 nao sao repetidos e tem mensagem clara', async () => {
  let n = 0
  globalThis.fetch = async () => { n++; return resp(401, { error: true, mensagem: 'x' }) }
  await assert.rejects(pietaResumo(rapido), (e) => e.status === 401 && /Credencial da Pieta inv/.test(e.message))
  assert.equal(n, 1)
  n = 0
  globalThis.fetch = async () => { n++; return resp(404, { error: true, mensagem: 'x' }) }
  await assert.rejects(pietaDetalheProjeto(99, rapido), (e) => e.status === 404 && /Projeto 99 n/.test(e.message))
  assert.equal(n, 1)
})

test('401 com status 500 embrulhado (proxy n8n) e erro interno: repete, nao e credencial invalida', async () => {
  let n = 0
  globalThis.fetch = async () => (n++ < 2
    ? resp(401, { status: 500, body: { error: true, mensagem: 'Ocorreu um erro interno' } })
    : resp(200, [{ project_id: 5 }]))
  assert.deepEqual(await pietaDetalheProjeto(5, rapido), { project_id: 5 })
  assert.equal(n, 3)
  n = 0
  globalThis.fetch = async () => { n++; return resp(401, { status: 500, body: { error: true, mensagem: 'Ocorreu um erro interno' } }) }
  await assert.rejects(pietaDetalheProjeto(5, rapido), (e) => e.status === 500 && /erro interno/.test(e.message))
  assert.equal(n, 3)
})

test('normalizarPendencia tira numeracao e identificadores', () => {
  assert.equal(normalizarPendencia('1 - PENDENCIA: medidor 12837343-1 (UC 4004191012-80) errado'), 'PENDENCIA: medidor # (UC #) errado')
  assert.equal(normalizarPendencia('Check List - Vistoria Remota'), 'Check List - Vistoria Remota')
})

test('timeout aborta a chamada e e repetido', async () => {
  let n = 0
  globalThis.fetch = (_url, opts) => {
    n++
    return new Promise((_ok, falha) => opts.signal.addEventListener('abort', () => falha(Object.assign(new Error('abortado'), { name: 'AbortError' }))))
  }
  await assert.rejects(pietaResumo({ timeoutMs: 10, esperaMs: 1 }), (e) => e.code === 'PIETA_TIMEOUT')
  assert.equal(n, 3)
})

// --- metricas ---
const agora = new Date('2026-10-29T15:00:00Z') // 29/10/2026 em Brasilia
const reg = (id, extra) => ({ ...pietaRegistroParaArmazenar({ project_id: id, status: 'Em Desenvolvimento', client_name: `C${id}`, created_at: '2026-08-01', due_date: '2026-12-31' }, {}), ...extra })

test('metricas: vencidos, pendencias, etapas, pagamento, medidor e alteracoes', () => {
  const registros = [
    // vencido, com pendencia, revisita de etapa e etapa atual (saiu_em null)
    pietaRegistroParaArmazenar({ project_id: 10, status: 'Em Desenvolvimento', client_name: 'A', created_at: '2026-08-01', due_date: '2026-10-20' }, detalheBruto({ due_date: '2026-10-20' })),
    // vencido porem finalizado: nao conta; tempo_total_dias null
    pietaRegistroParaArmazenar({ project_id: 11, status: 'Finalizado', client_name: 'B', created_at: '2026-07-01', due_date: '2026-09-01' },
      detalheBruto({ project_id: 11, status: 'Finalizado', tempo_total_dias: null, pendencies: null, changes: null, changes_total: 0, medidor_substituido_date: '2026-07-31',
        status_timeline: [{ etapa: 'Em Desenvolvimento', entrou_em: '2026-07-01T00:00:00', saiu_em: '2026-07-11T00:00:00', tempo_na_etapa_dias: 10 }, { etapa: 'Finalizado', entrou_em: '2026-07-11T00:00:00', saiu_em: null, tempo_na_etapa_dias: 0 }] })),
    // finalizado com tempo desde o pagamento
    pietaRegistroParaArmazenar({ project_id: 12, status: 'Finalizado', created_at: '2026-06-01' }, detalheBruto({ project_id: 12, status: 'Finalizado', tempo_total_dias: 50, pendencies: [], changes: null, changes_total: 0, status_timeline: null })),
    // no prazo, sem timeline
    reg(13, { pendencies: ['Falta ART', 'Falta procuracao'] }),
    // due_date hoje: ainda nao vencido
    reg(14, { dueDate: '2026-10-29' }),
  ]
  const m = calcularMetricasPieta(registros, { agora })
  assert.equal(m.hoje, '2026-10-29')
  assert.equal(m.ativos, 3)
  assert.equal(m.finalizados, 2)
  assert.equal(m.prazoVencido.quantidade, 1)
  assert.deepEqual(m.prazoVencido.projetos[0], { projectId: 10, clientName: 'A', status: 'Em Desenvolvimento', dueDate: '2026-10-20', diasAtraso: 9 })
  assert.equal(m.comPendencia.quantidade, 2)
  assert.deepEqual(m.comPendencia.pendenciasFrequentes[0], { pendencia: 'Falta ART', projetos: 2 })

  const dev = m.tempoPorEtapa.find((e) => e.etapa === 'Em Desenvolvimento')
  // projeto 10: 10 (1a visita) + 70 dias (de 20/08 10:00 ate 29/10 15:00, etapa atual = tempo corrente); projeto 11: 10
  assert.equal(dev.projetos, 2)
  assert.equal(dev.visitas, 3)
  assert.equal(dev.mediaDias, 45)
  assert.equal(dev.medianaDias, 45)
  assert.ok(!m.tempoPorEtapa.some((e) => e.etapa === 'Finalizado'))

  assert.deepEqual(m.tempoDesdePagamento.finalizados, { projetos: 1, mediaDias: 50, medianaDias: 50 })
  assert.equal(m.tempoDesdePagamento.emAndamento.projetos, 1) // so o 10 (os outros ativos tem null)
  assert.equal(m.tempoDesdePagamento.emAndamento.mediaDias, 30)
  assert.deepEqual(m.medidorSubstituido, { quantidade: 1, tempoMedioCriacaoAteTrocaDias: 30 })
  assert.deepEqual(m.alteracoes, { valorTotal: 1, projetosComAlteracao: 1 })
})

test('metricas sem registros nao quebram', () => {
  const m = calcularMetricasPieta([], { agora })
  assert.equal(m.ativos, 0)
  assert.deepEqual(m.tempoPorEtapa, [])
  assert.equal(m.tempoDesdePagamento.finalizados.mediaDias, null)
})

// --- carga ---
async function criarBanco() {
  const db = new PGlite()
  await db.exec(SQL)
  await db.exec(SQL)
  const pg = createPgSql({ executar: async (t, p = []) => (await db.query(t, p)).rows, esperaRetentativaMs: 1, log: () => {} })
  return { db, pg }
}
const proj = (id, extra = {}) => ({ project_id: id, status: 'Em Desenvolvimento', client_name: `C${id}`, power: '5', power_distributor: 'CPFL', created_at: '2026-08-01', last_status_change: '2026-09-01', due_date: '2026-12-01', message: null, ...extra })

test('planejarBusca: novos, alterados e vencidos por idade; finalizado nao renova', () => {
  const agoraMs = Date.parse('2026-10-29T12:00:00Z')
  const velho = new Date(agoraMs - 25 * 3600e3).toISOString()
  const novo = new Date(agoraMs - 1 * 3600e3).toISOString()
  const guardados = [
    { projectId: 1, status: 'Em Desenvolvimento', lastStatusChange: '2026-09-01', dueDate: '2026-12-01', buscadoEm: novo }, // igual e recente
    { projectId: 2, status: 'Em Desenvolvimento', lastStatusChange: '2026-08-01', dueDate: '2026-12-01', buscadoEm: novo }, // mudou
    { projectId: 3, status: 'Em Desenvolvimento', lastStatusChange: '2026-09-01', dueDate: '2026-12-01', buscadoEm: velho }, // velho
    { projectId: 4, status: 'Finalizado', lastStatusChange: '2026-09-01', dueDate: '2026-12-01', buscadoEm: velho }, // finalizado velho
  ]
  const resumo = [1, 2, 3, 4, 5].map((id) => proj(id, id === 4 ? { status: 'Finalizado' } : {}))
  assert.deepEqual(planejarBusca(resumo, guardados, agoraMs).map((p) => p.project_id), [5, 2, 3])
})

test('sincronizarPieta grava so o que precisa, respeita o orcamento e roda na tabela real', async () => {
  const { db, pg } = await criarBanco()
  const resumoApi = { projects: [1, 2, 3, 4, 5, 6].map((id) => proj(id)) }
  const buscados = []
  let relogio = 1_000_000
  const tempo = () => relogio
  const detalhe = async (id) => { relogio += 10; buscados.push(id); return detalheBruto({ project_id: id }) }
  // concorrencia 1 para ser deterministico: cada busca consome 10 ms do orcamento de 35 ms
  const r1 = await sincronizarPieta({ pg, resumo: async () => resumoApi, detalhe, agora: tempo, orcamentoMs: 35, concorrencia: 1 })
  assert.equal(r1.buscados, 4)
  assert.equal(r1.restantes, 2)
  const r2 = await sincronizarPieta({ pg, resumo: async () => resumoApi, detalhe, agora: tempo, orcamentoMs: 1000, concorrencia: 4 })
  assert.equal(r2.buscados, 2) // so o que faltava
  assert.deepEqual(buscados.slice(4).sort(), [5, 6])
  const r3 = await sincronizarPieta({ pg, resumo: async () => resumoApi, detalhe, agora: tempo, orcamentoMs: 1000 })
  assert.equal(r3.buscados, 0) // nada mudou, tudo recente

  // last_status_change mudou -> busca de novo; projeto 6 sumiu do resumo -> desativado
  const resumo2 = { projects: [1, 2, 3, 4, 5].map((id) => proj(id, id === 2 ? { last_status_change: '2026-10-01' } : {})) }
  const r4 = await sincronizarPieta({ pg, resumo: async () => resumo2, detalhe, agora: tempo })
  assert.equal(r4.buscados, 1)
  assert.equal(r4.removidos, 1)
  const { registros, estado } = await lerPietaArmazenada(pg)
  assert.equal(registros.length, 5)
  assert.equal(estado.buscados, 1)
  const bruto = JSON.stringify((await db.query(`select dados from public."DASHBOARD-GRONNER-CRM" where entidade = '${ENTIDADE_PIETA}'`)).rows)
  assert.ok(!bruto.includes('11999990000') && !bruto.includes('segredo'))
})

test('falha em um projeto nao derruba a carga; 401 para tudo e nao grava', async () => {
  const { pg } = await criarBanco()
  const resumoApi = { projects: [1, 2, 3].map((id) => proj(id)) }
  const detalhe = async (id) => { if (id === 2) throw Object.assign(new Error('x'), { status: 404 }); return detalheBruto({ project_id: id }) }
  const r = await sincronizarPieta({ pg, resumo: async () => resumoApi, concorrencia: 1, detalhe })
  assert.equal(r.buscados, 2)
  assert.equal(r.falhas, 1)
  const { pg: pg2 } = await criarBanco()
  await assert.rejects(sincronizarPieta({ pg: pg2, resumo: async () => resumoApi, detalhe: async () => { throw Object.assign(new Error('cred'), { status: 401 }) } }), /cred/)
  assert.equal((await lerPietaArmazenada(pg2)).registros.length, 0)
})

// --- rota ---
async function chamarRota(opcoes, cabecalhos = {}) {
  const app = express()
  app.use('/api/sync/groner', createSyncRouter({ store: {}, ...opcoes }))
  const servidor = await new Promise((ok) => { const s = app.listen(0, () => ok(s)) })
  try {
    const res = await fetchOriginal(`http://127.0.0.1:${servidor.address().port}/api/sync/groner/pieta`, { headers: cabecalhos })
    return { status: res.status, corpo: await res.json() }
  } finally {
    servidor.close()
  }
}

test('rota /pieta: exige chave e, sem credencial da Pieta, devolve 200 ok:false', async () => {
  process.env.GRONER_SYNC_TOKEN = 'chave-de-teste'
  process.env.NEON_DATABASE_URL = 'postgresql://x:y@localhost/db'
  delete process.env.PIETA_USER
  delete process.env.PIETA_PASSWORD
  assert.equal((await chamarRota({})).status, 401)
  const ok = await chamarRota({}, { 'X-Groner-Sync-Token': 'chave-de-teste' })
  assert.equal(ok.status, 200)
  assert.deepEqual(ok.corpo, { ok: false, motivo: 'sem credencial' })
  process.env.CRON_SECRET = 'cron'
  const cron = await chamarRota({ sincronizarPieta: async () => ({ ok: true, buscados: 3 }) }, { Authorization: 'Bearer cron' })
  assert.deepEqual(cron.corpo, { ok: true, buscados: 3 })
})
