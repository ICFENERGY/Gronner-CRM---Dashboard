import test from 'node:test'
import assert from 'node:assert/strict'
import { tsImport } from 'tsx/esm/api'
import { mapProjeto, normalizarProjetoLido } from '../server/mappers.js'

// Funções do front em TypeScript, carregadas pelo tsx (já é dependência de desenvolvimento).
const { igual, projetoVendido, textoDe } = await tsImport('../src/features/painel/calculos.ts', import.meta.url)
const { intervalo } = await tsImport('../src/features/painel/periodo.ts', import.meta.url)

// Formato que a sincronização gravou: o objeto completo do usuário no lugar do nome.
const usuario = (nome) => ({ id: 7, nome, cpf: 'x', email: 'x', celular: 'x', loja: { nome: 'Loja' } })

test('vendedor como objeto é comparado pelo nome, sem quebrar', () => {
  assert.equal(textoDe(usuario('Bruno Lima')), 'Bruno Lima')
  assert.equal(textoDe({ sigla: 'PR' }), '')
  assert.equal(textoDe(null), '')
  assert.equal(igual(usuario('Bruno Lima'), 'bruno lima '), true)
  assert.equal(igual(null, 'Ana'), false)
  assert.equal(igual(null, ''), true)
})

test('projeto vendido: valor de venda ou funil de contrato em diante', () => {
  assert.equal(projetoVendido(undefined), false)
  assert.equal(projetoVendido({ funil: '04. FUNIL DE VENDAS SOLAR', valorVenda: 900 }), true)
  assert.equal(projetoVendido({ funil: '08. ENGENHARIA PROJETO', valorVenda: null }), true)
  assert.equal(projetoVendido({ funil: '04. FUNIL DE VENDAS SOLAR', valorVenda: 0 }), false)
  assert.equal(projetoVendido({ funil: '18. PARCERIA TÉCNICA', valorVenda: 0 }), false)
})

test('filtro Ano e Mês: intervalo e período anterior', () => {
  const hoje = '2026-10-17'
  // mês fechado: mês anterior inteiro
  assert.deepEqual(intervalo('2026', '03', hoje), { inicio: '2026-03-01', fim: '2026-03-31', anterior: { inicio: '2026-02-01', fim: '2026-02-28' }, porDia: true })
  // mês em curso termina hoje; anterior tem o mesmo número de dias
  assert.deepEqual(intervalo('2026', '10', hoje), { inicio: '2026-10-01', fim: '2026-10-17', anterior: { inicio: '2026-09-01', fim: '2026-09-17' }, porDia: true })
  // ano fechado: ano anterior inteiro; série por mês
  assert.deepEqual(intervalo('2025', '', hoje), { inicio: '2025-01-01', fim: '2025-12-31', anterior: { inicio: '2024-01-01', fim: '2024-12-31' }, porDia: false })
  // ano em curso: até hoje contra o mesmo trecho do ano anterior
  assert.deepEqual(intervalo('2026', '', hoje), { inicio: '2026-01-01', fim: '2026-10-17', anterior: { inicio: '2025-01-01', fim: '2025-10-17' }, porDia: false })
  // 12 meses: período anterior com o mesmo número de dias, terminando na véspera do início
  assert.deepEqual(intervalo('12m', '', hoje), { inicio: '2025-11-01', fim: hoje, anterior: { inicio: '2024-11-15', fim: '2025-10-31' }, porDia: false })
  // todos os anos: sem variação; mês sem ano específico é ignorado
  assert.deepEqual(intervalo('tudo', '05', hoje), { inicio: null, fim: hoje, anterior: null, porDia: false })
})

test('servidor entrega só o nome do vendedor do projeto (sem dados pessoais do usuário)', () => {
  assert.equal(mapProjeto({ id: 1, vendedorResponsavel: usuario('Bruno Lima') }, {}).vendedorResponsavel, 'Bruno Lima')
  assert.equal(mapProjeto({ id: 1, vendedorResponsavel: 'Ana Souza' }, {}).vendedorResponsavel, 'Ana Souza')
  assert.equal(normalizarProjetoLido({ id: 1, vendedorResponsavel: usuario('Bruno Lima') }).vendedorResponsavel, 'Bruno Lima')
  const intacto = { id: 2, vendedorResponsavel: 'Ana' }
  assert.equal(normalizarProjetoLido(intacto), intacto)
})

test('12 meses: período anterior tem o mesmo número de dias do atual', () => {
  const dias = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
  for (const hoje of ['2026-10-17', '2026-03-31', '2028-02-29']) {
    const iv = intervalo('12m', '', hoje)
    assert.equal(dias(iv.anterior.inicio, iv.anterior.fim), dias(iv.inicio, iv.fim), hoje)
    assert.equal(dias(iv.anterior.fim, iv.inicio), 1, hoje)
  }
})

test('ano específico: período anterior pelo mesmo MM-DD (29/02 vira 28/02)', () => {
  assert.deepEqual(intervalo('2024', '', '2024-03-01').anterior, { inicio: '2023-01-01', fim: '2023-03-01' })
  assert.deepEqual(intervalo('2024', '', '2024-02-29').anterior, { inicio: '2023-01-01', fim: '2023-02-28' })
  assert.deepEqual(intervalo('2026', '', '2026-10-17').anterior, { inicio: '2025-01-01', fim: '2025-10-17' })
})

test('mês ou ano futuro: sem comparação com período anterior', () => {
  const hoje = '2026-10-17'
  assert.equal(intervalo('2026', '12', hoje).anterior, null)
  assert.equal(intervalo('2026', '11', hoje).anterior, null)
  assert.equal(intervalo('2027', '', hoje).anterior, null)
  assert.notEqual(intervalo('2026', '10', hoje).anterior, null)
})

test('dataCurtaBr: data sem hora não volta um dia no fuso de Brasília', async () => {
  const { dataCurtaBr } = await tsImport('../src/lib/datas.ts', import.meta.url)
  assert.equal(dataCurtaBr('2026-04-09'), '09/04/2026')
  assert.equal(dataCurtaBr('2026-09-11T18:14:00-03:00'), '11/09/2026')
  assert.equal(dataCurtaBr('2026-01-01T01:00:00Z'), '31/12/2025') // 22h do dia 31 em Brasília
  assert.equal(dataCurtaBr(null), '—')
  assert.equal(dataCurtaBr('lixo'), '—')
})
