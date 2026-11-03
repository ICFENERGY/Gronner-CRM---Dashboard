import test from 'node:test'
import assert from 'node:assert/strict'
import { tsImport } from 'tsx/esm/api'

const { regiaoDaUf, ufValida, mesReferencia, resumoParque, potenciaPorRegiao, posicaoAproximada, statusDe, entraNoMapa } =
  await tsImport('../src/features/solarz/usinasMapa.ts', import.meta.url)
const { CONTORNOS_UF } = await tsImport('../src/features/solarz/mapaBrasil.ts', import.meta.url)
const { linhasFarol, diaMes } = await tsImport('../src/features/solarz/FarolDiario.tsx', import.meta.url)

const usina = (o) => ({ id: 1, nome: 'U', cidade: 'Campinas', estado: 'SP', potenciaKwp: 10, mesAnoRecente: null, geracaoKwhMes: null, statusDesempenho: null, ...o })

test('região do IBGE por UF', () => {
  assert.equal(regiaoDaUf('sp'), 'Sudeste')
  assert.equal(regiaoDaUf('SC'), 'Sul')
  assert.equal(regiaoDaUf('AM'), 'Norte')
  assert.equal(regiaoDaUf('BA'), 'Nordeste')
  assert.equal(regiaoDaUf('DF'), 'Centro-Oeste')
  assert.equal(regiaoDaUf('Pendente'), 'Não informado')
  assert.equal(regiaoDaUf(null), 'Não informado')
  assert.equal(ufValida(' mg '), 'MG')
  assert.equal(ufValida('XX'), null)
})

test('mês de referência é o último mês fechado', () => {
  assert.deepEqual(mesReferencia('2026-11-03'), { rotulo: 'outubro/2026', curto: 'OUT/26' })
  assert.deepEqual(mesReferencia('2026-10-15'), { rotulo: 'setembro/2026', curto: 'SET/26' })
  assert.deepEqual(mesReferencia('2027-01-02'), { rotulo: 'dezembro/2026', curto: 'DEZ/26' })
})

test('resumo do parque: potência, geração fechada e status', () => {
  const us = [
    usina({ potenciaKwp: 100, mesAnoRecente: 'outubro/2026', geracaoKwhMes: 1000, statusDesempenho: 'Dentro do esperado' }),
    usina({ potenciaKwp: 50, mesAnoRecente: 'agosto/2026', geracaoKwhMes: 500, statusDesempenho: 'Crítico' }),
    usina({ potenciaKwp: null, estado: 'Pendente', statusDesempenho: 'inventado' }),
  ]
  const r = resumoParque(us, '2026-11-03')
  assert.equal(r.total, 3)
  assert.equal(r.kwp, 150)
  assert.equal(r.comPotencia, 2)
  assert.equal(r.fechadas, 1)
  assert.equal(r.geracaoKwh, 1000)
  assert.deepEqual(r.status.map((s) => s.qtd), [1, 0, 1, 1])
  assert.equal(statusDe(us[2]), 'Sem dado')
  assert.equal(entraNoMapa(us[2]), false)
})

test('potência por região em MW, da maior para a menor, "Não informado" por último', () => {
  const lin = potenciaPorRegiao([
    usina({ estado: 'SP', potenciaKwp: 1000 }),
    usina({ estado: 'RS', potenciaKwp: 2000 }),
    usina({ estado: null, potenciaKwp: 500 }),
  ])
  assert.deepEqual(lin.map((l) => l.regiao).slice(0, 2), ['Sul', 'Sudeste'])
  assert.equal(lin[0].mw, 2)
  assert.equal(lin.at(-1).regiao, 'Não informado')
  assert.equal(lin.at(-1).mw, 0.5)
})

test('posição aproximada: dentro da UF, estável e sem usar coordenadas', () => {
  const u = usina({ id: 7, nome: 'Usina X', cidade: 'Joinville', estado: 'SC' })
  const p1 = posicaoAproximada(u)
  const p2 = posicaoAproximada({ ...u, latitude: -1, longitude: -1 })
  assert.deepEqual(p1, p2)
  assert.ok(CONTORNOS_UF.some((c) => c.uf === 'SC'))
  // dentro da caixa do contorno de SC
  const d = CONTORNOS_UF.find((c) => c.uf === 'SC').d
  const nums = d.match(/-?\d+(\.\d+)?,-?\d+(\.\d+)?/g).map((s) => s.split(',').map(Number))
  const xs = nums.map((n) => n[0]), ys = nums.map((n) => n[1])
  assert.ok(p1[0] >= Math.min(...xs) && p1[0] <= Math.max(...xs))
  assert.ok(p1[1] >= Math.min(...ys) && p1[1] <= Math.max(...ys))
  assert.equal(posicaoAproximada(usina({ estado: 'Pendente' })), null)
})

test('farol diário: ordena por data e preenche status ausentes', () => {
  assert.equal(diaMes('2026-11-03'), '03/11')
  const l = linhasFarol([
    { data: '2026-11-03', total: 10, contagens: { Normal: 9, Desconhecido: 1 } },
    { data: '2026-11-02', total: 10, contagens: { Normal: 8, 'Com alerta': 2 } },
  ])
  assert.deepEqual(l.map((x) => x.dia), ['02/11', '03/11'])
  assert.equal(l[1]['Com alerta'], 0)
  assert.equal(l[1].total, 10)
})
