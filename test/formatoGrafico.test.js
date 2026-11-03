import test from 'node:test'
import assert from 'node:assert/strict'
import { tsImport } from 'tsx/esm/api'

// Utilitário único dos rótulos dos gráficos (TypeScript do front, carregado pelo tsx).
const f = await tsImport('../src/lib/formatoGrafico.ts', import.meta.url)
const { agruparPorFunil, valorDoCard } = await tsImport('../src/features/painel/funis.ts', import.meta.url)

test('reais curtos em pt-BR', () => {
  assert.equal(f.reaisCurto(850), 'R$ 850')
  assert.equal(f.reaisCurto(9_795), 'R$ 9,8 mil')
  assert.equal(f.reaisCurto(104_400), 'R$ 104 mil')
  assert.equal(f.reaisCurto(1_234_567), 'R$ 1,2 mi')
  assert.equal(f.reaisCurto(89_061_596), 'R$ 89,1 mi')
  assert.equal(f.reaisCurto(2_100_000_000), 'R$ 2,1 bi')
})

test('energia, quantidade, percentual e dias', () => {
  assert.equal(f.energiaCurta(850), '850 kWh')
  assert.equal(f.energiaCurta(69_480), '69,5 MWh')
  assert.equal(f.energiaCurta(112_034.7), '112 MWh')
  assert.equal(f.energiaCurta(1_250_000), '1,3 GWh')
  assert.equal(f.energiaCurta(0), '0')
  assert.equal(f.quantidadeCurta(1234), '1.234')
  assert.equal(f.quantidadeCurta(99_999), '99.999')
  assert.equal(f.quantidadeCurta(123_456), '123 mil')
  assert.equal(f.percentualCurto(81.2), '81%')
  assert.equal(f.percentualCurto(8.46), '8,5%')
  assert.equal(f.percentualCurto(0.02), '<0,1%')
  assert.equal(f.percentualCurto(0), '0%')
  assert.equal(f.diasCurto(39.6), '40 d')
  assert.equal(f.diasCurto(2.7), '2,7 d')
})

test('pontos com rótulo: todos até o limite; depois primeiro, último, máximo e mínimo', () => {
  assert.deepEqual([...f.pontosComRotulo([1, 2, 3])].sort(), [0, 1, 2])
  const v = [5, 9, 1, 4, 4, 4, 4, 4, 4, 7]
  assert.deepEqual([...f.pontosComRotulo(v)].sort((a, b) => a - b), [0, 1, 2, 9])
  assert.deepEqual([...f.pontosComRotulo([null, 3, undefined])], [1])
})

test('margem do rótulo cresce com o maior texto', () => {
  assert.ok(f.larguraRotulo([89_061_596], f.reaisCurto) > f.larguraRotulo([5], f.reaisCurto))
})

test('agruparPorFunil: ordem do Groner, etapas da maior para a menor e valor da venda ou da proposta aceita', () => {
  const projetos = [
    { funil: '10. HOMOLOGAÇÃO', etapa: 'B', valorVenda: 100, valorPrePropostaAceita: 50 },
    { funil: '04. FUNIL DE VENDAS SOLAR', etapa: 'GANHO', valorVenda: null, valorPrePropostaAceita: 70 },
    { funil: '04. FUNIL DE VENDAS SOLAR', etapa: 'NEGOCIAÇÃO', valorVenda: 0, valorPrePropostaAceita: 0 },
    { funil: '04. FUNIL DE VENDAS SOLAR', etapa: 'NEGOCIAÇÃO', valorVenda: 30, valorPrePropostaAceita: null },
    { funil: 'PROSPECÇÃO', etapa: null, valorVenda: null, valorPrePropostaAceita: null },
    { funil: null, etapa: 'X', valorVenda: null, valorPrePropostaAceita: null },
  ]
  assert.equal(valorDoCard(projetos[0]), 100)
  assert.equal(valorDoCard(projetos[1]), 70)
  const g = agruparPorFunil(projetos)
  assert.deepEqual(g.map((x) => x.funil), ['04. FUNIL DE VENDAS SOLAR', '10. HOMOLOGAÇÃO', 'PROSPECÇÃO', 'Sem funil'])
  assert.equal(g[0].cards, 3)
  assert.equal(g[0].valor, 100)
  assert.deepEqual(g[0].etapas, [{ etapa: 'NEGOCIAÇÃO', cards: 2 }, { etapa: 'GANHO', cards: 1 }])
  assert.deepEqual(g[2].etapas, [{ etapa: 'Sem etapa', cards: 1 }])
  assert.equal(g.reduce((a, x) => a + x.cards, 0), projetos.length)
})
