import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import express from 'express'
import { ehMicroinversor, equipamentosDoChamado, montarChamadosSla, resumoDaCobertura } from '../server/pietaSla.js'
import { pietaRegistroParaArmazenar, reduzirEquipamentos } from '../server/pietaMetricas.js'
import { createIndicadoresRouter } from '../server/indicadoresRoutes.js'

// Dados fictícios.
const AGORA = new Date('2026-11-06T15:00:00Z')
const CAMPOS = ['cliente', 'ano', 'mes', 'status', 'finalizado', 'sla', 'distribuidora', 'estado', 'potencia', 'placa', 'inversor', 'qtd_placas', 'fab_placas', 'qtd_inversores', 'fab_inversores', 'qtd_microinversores', 'qtd_inversores_string', 'fab_microinversores', 'ultima_alteracao', 'descricao']

const resumo = (id, extra = {}) => ({
  project_id: id, status: 'Projeto Aprovado', client_name: `CLIENTE ${id}`, power: '6.6', power_distributor: 'CPFL',
  created_at: '2026-08-01T10:00:00-03:00', last_status_change: '2026-10-01T09:00:00-03:00', due_date: '10/11/2026', ...extra,
})
const detalheBruto = (extra = {}) => ({
  project_id: 1, status: 'Projeto Aprovado', power_distributor_state: 'SP', pendencies: ['1 - Falta ART 123.456.789-00'],
  solar_panels: [{ brand: 'ACME SOLAR', model: 'AS-600', power: 600, quantity: 10 }, { brand: 'OUTRA', model: 'O-550', power: 550, quantity: 2 }],
  inversors: [{ brand: 'SOLIS', model: 'S5-GC15K', power: 15, quantity: 1 }, { brand: 'FoxESS', model: 'Q1-2500-E', power: 2.5, quantity: 3 }],
  main_contact: { name: 'Fulana', phone: '11999990000' }, ...extra,
})

test('ehMicroinversor: linhas Deye SUN-M/S...G4 e FoxESS Q1; o resto é string', () => {
  assert.equal(ehMicroinversor('SUN-M225G4-EU-Q0'), true)
  assert.equal(ehMicroinversor('SUN-S225G4-EU-Q0'), true)
  assert.equal(ehMicroinversor('Q1-2500-E'), true)
  assert.equal(ehMicroinversor('SUN2000-4KTL-L1'), false)
  assert.equal(ehMicroinversor(null), false)
})

test('reduzirEquipamentos guarda só marca, modelo, potência e quantidade', () => {
  assert.equal(reduzirEquipamentos(undefined), null)
  assert.deepEqual(reduzirEquipamentos([{ brand: ' A ', model: 'M', power: '5', quantity: '2', serial: 'x' }, null]), [{ brand: 'A', model: 'M', power: 5, quantity: 2 }])
})

test('pietaRegistroParaArmazenar: guarda estado e equipamentos, sem contato', () => {
  const reg = pietaRegistroParaArmazenar(resumo(1), detalheBruto(), AGORA)
  assert.equal(reg.estado, 'SP')
  assert.equal(reg.versao, 2)
  assert.equal(reg.placas.length, 2)
  assert.equal(reg.inversores[1].model, 'Q1-2500-E')
  assert.ok(!JSON.stringify(reg).includes('11999990000'))
  // projeto sem detalhe de equipamentos: ausente (null), não lista vazia
  assert.equal(pietaRegistroParaArmazenar(resumo(1), {}, AGORA).placas, null)
})

test('equipamentosDoChamado: textos, quantidades, fabricantes e micro x string', () => {
  const reg = pietaRegistroParaArmazenar(resumo(1), detalheBruto(), AGORA)
  assert.deepEqual(equipamentosDoChamado(reg), {
    placa: '10x ACME SOLAR AS-600 + 2x OUTRA O-550', inversor: '1x SOLIS S5-GC15K + 3x FoxESS Q1-2500-E',
    qtd_placas: 12, fab_placas: 'ACME SOLAR + OUTRA', qtd_inversores: 4, fab_inversores: 'SOLIS + FoxESS',
    qtd_microinversores: 3, qtd_inversores_string: 1, fab_microinversores: 'FoxESS',
  })
})

test('equipamentosDoChamado: sem detalhe, tudo ausente; com detalhe vazio, "(a confirmar)" e zeros', () => {
  const ausente = equipamentosDoChamado(null)
  assert.equal(ausente.qtd_placas, null)
  assert.equal(ausente.qtd_inversores, null)
  assert.equal(ausente.placa, '')
  assert.equal(ausente.fab_placas, '')
  const vazio = equipamentosDoChamado({ placas: [], inversores: [] })
  assert.equal(vazio.placa, '(a confirmar)')
  assert.equal(vazio.qtd_placas, 0)
})

test('montarChamadosSla: formato de ROWS, SLA de finalizado e de aberto, descrição sem identificadores', () => {
  const projetos = [
    resumo(1),
    resumo(2, { status: 'Finalizado', created_at: '2026-01-10T08:00:00-03:00', last_status_change: '2026-03-01T08:00:00-03:00' }),
    resumo(3, { status: 'Finalizado', created_at: '2026-01-10T08:00:00-03:00', last_status_change: '2026-09-09T08:00:00-03:00' }),
    resumo(4, { status: 'Cancelado' }),
  ]
  const reg1 = pietaRegistroParaArmazenar(projetos[0], detalheBruto(), AGORA)
  // projeto 3: a entrada na etapa Finalizado (timeline) vale mais que a última mudança
  const reg3 = pietaRegistroParaArmazenar(projetos[2], { status_timeline: [{ etapa: 'Finalizado', entrou_em: '2026-02-09T10:00:00', saiu_em: null }] }, AGORA)
  const linhas = montarChamadosSla(projetos, [reg1, reg3], { agora: AGORA })
  assert.equal(linhas.length, 4)
  for (const l of linhas) assert.deepEqual(Object.keys(l), CAMPOS)
  const por = (nome) => linhas.find((l) => l.cliente === nome)
  const a1 = por('CLIENTE 1')
  assert.equal(a1.ano, '2026')
  assert.equal(a1.mes, '2026-08')
  assert.equal(a1.finalizado, false)
  assert.equal(a1.sla, 97) // 2026-08-01 até 2026-11-06
  assert.equal(a1.estado, 'SP')
  assert.equal(a1.potencia, 6.6)
  assert.equal(a1.ultima_alteracao, '2026-10-01')
  assert.equal(a1.descricao, 'Falta ART #')
  const a2 = por('CLIENTE 2')
  assert.equal(a2.finalizado, true)
  assert.equal(a2.sla, 50) // cadastro até a última mudança (sem detalhe)
  assert.equal(a2.estado, null)
  assert.equal(a2.qtd_placas, null)
  assert.equal(a2.placa, '')
  assert.equal(por('CLIENTE 3').sla, 30) // 2026-01-10 até 2026-02-09 (timeline)
  assert.equal(por('CLIENTE 4').finalizado, false) // cancelado não é finalizado
  const json = JSON.stringify(linhas)
  assert.ok(!json.includes('Fulana') && !json.includes('11999990000') && !json.includes('123.456'))
})

test('montarChamadosSla: sem resumo usa os registros; lista vazia não quebra', () => {
  const reg = pietaRegistroParaArmazenar(resumo(7), detalheBruto({ project_id: 7 }), AGORA)
  assert.equal(montarChamadosSla([], [reg], { agora: AGORA }).length, 1)
  assert.deepEqual(montarChamadosSla([], [], { agora: AGORA }), [])
  assert.deepEqual(montarChamadosSla(undefined, undefined, { agora: AGORA }), [])
})

test('resumoDaCobertura: total, equipamentos carregados e data da última sincronização', () => {
  const reg = pietaRegistroParaArmazenar(resumo(1), detalheBruto(), AGORA)
  const linhas = montarChamadosSla([resumo(1), resumo(2)], [reg], { agora: AGORA })
  const c = resumoDaCobertura(linhas, { resumoEm: '2026-11-06T10:00:00Z', estado: { concluidoEm: '2026-11-06T11:00:00Z', restantes: 1 } })
  assert.deepEqual(c, { total: 2, comEquipamentos: 1, comEstado: 1, atualizadoEm: '2026-11-06T11:00:00Z', resumoEm: '2026-11-06T10:00:00Z', restantes: 1 })
  assert.equal(resumoDaCobertura(linhas, { resumoEm: 'x' }).atualizadoEm, 'x')
})

test('rota /pieta: lista no formato de ROWS e /pieta/status; erro de leitura vira 500 sem vazar detalhe', async () => {
  const reg = pietaRegistroParaArmazenar(resumo(1), detalheBruto(), AGORA)
  let falhar = false
  const router = createIndicadoresRouter({
    carregar: async () => null, pg: () => null, agora: () => AGORA.getTime(), ttlMs: 0,
    carregarPieta: async () => {
      if (falhar) throw new Error('segredo interno')
      return { resumoProjetos: [resumo(1), resumo(2)], registros: [reg], resumoEm: '2026-11-06T10:00:00Z', estado: null }
    },
  })
  const app = express()
  app.use('/api/indicadores', router)
  const srv = http.createServer(app)
  await new Promise((r) => srv.listen(0, r))
  const base = `http://127.0.0.1:${srv.address().port}/api/indicadores`
  try {
    const lista = await (await fetch(`${base}/pieta`)).json()
    assert.equal(lista.length, 2)
    assert.deepEqual(Object.keys(lista[0]), CAMPOS)
    const st = await (await fetch(`${base}/pieta/status`)).json()
    assert.equal(st.total, 2)
    assert.equal(st.comEquipamentos, 1)
    assert.equal(st.fonte, 'neon')
    falhar = true
    const r = await fetch(`${base}/pieta`)
    assert.equal(r.status, 500)
    assert.ok(!JSON.stringify(await r.json()).includes('segredo'))
  } finally {
    await new Promise((r) => srv.close(r))
  }
})
