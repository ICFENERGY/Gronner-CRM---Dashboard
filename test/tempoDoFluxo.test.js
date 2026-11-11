import test from 'node:test'
import assert from 'node:assert/strict'
import { tempoDoFluxo, engResumosDoProjeto, cardsDoProjeto } from '../server/indicadores.js'

const prazos = { '08|CRIAR PROJETO->PROPOSTA': 3 }
const AGORA = Date.parse('2026-11-11T13:52:00Z')
const fluxo = (extra) => ({ funil: '08. ENGENHARIA PROJETO', etapa: 'CRIAR PROJETO->PROPOSTA', ...extra })

test('atraso = dias desde a entrada na etapa menos o prazo (a etiqueta vermelha do Groner)', () => {
  // Card real #66397: entrou em 05/11 09:14 (-03:00); o Groner mostrava +3d 1h 39m.
  const t = tempoDoFluxo(fluxo({ entradaEm: '2026-11-05T09:14:44-03:00', tempoMin: 215302, atrasoMin: 195463 }), { agora: Date.parse('2026-11-11T13:53:30Z'), prazos })
  assert.ok(Math.abs(t.atraso * 1440 - (3 * 1440 + 60 + 39)) < 2, `atraso ${t.atraso}`)
  assert.ok(Math.abs(t.dias - 6.07) < 0.01)
})

test('contador zerado do Groner não esconde o atraso: vale a data de entrada na etapa', () => {
  const t = tempoDoFluxo(fluxo({ entradaEm: '2026-08-16T20:56:23-03:00', tempoMin: 0, atrasoMin: 0 }), { agora: AGORA, prazos })
  assert.ok(t.dias > 86 && t.atraso > 83)
})

test('card que acabou de entrar na etapa fica no prazo, mesmo com contador de atraso do funil', () => {
  const t = tempoDoFluxo(fluxo({ entradaEm: '2026-11-11T09:00:00-03:00', tempoMin: 72336, atrasoMin: 63644 }), { agora: AGORA, prazos })
  assert.equal(t.atraso, 0)
})

test('sem data de entrada ou sem prazo da etapa, vale o contador do Groner', () => {
  assert.deepEqual(tempoDoFluxo(fluxo({ tempoMin: 2880, atrasoMin: 1440 }), { agora: AGORA, prazos }), { dias: 2, atraso: 1 })
  const semPrazo = tempoDoFluxo({ funil: '08. ENGENHARIA PROJETO', etapa: 'ETAPA NOVA', entradaEm: '2026-11-01T00:00:00-03:00', tempoMin: 14400, atrasoMin: 2880 }, { agora: AGORA, prazos })
  assert.equal(semPrazo.atraso, 2)
  assert.ok(semPrazo.dias > 10)
})

test('Resumo por funil e Cards usam a mesma regra por funil do card', () => {
  const p = { id: 67013, nome: 'X', funil: '04. FUNIL DE VENDAS SOLAR', etapa: 'FUNIL ENGENHARIA - CRIAR PROP', dataEntradaStatus: '2026-08-17T11:22:33-03:00',
    fluxos: [fluxo({ entradaEm: '2026-08-16T20:56:23-03:00', tempoMin: 0, atrasoMin: 0 })] }
  const [linha] = engResumosDoProjeto(p, { agora: AGORA, prazos })
  assert.equal(linha.atraso, 1)
  assert.match(linha.tempoCard, /^86d /)
  const [card] = cardsDoProjeto(p, { agora: AGORA, prazos })
  assert.ok(card.diasFluxo > 86 && card.atraso > 83)
})

test('fora da Engenharia o card segue o contador do Groner (a regra da etapa vale só nos funis 08 a 14 e 18)', () => {
  const p = { id: 1, nome: 'X', funil: '13. SUPORTE CLIENTE', etapa: 'SUPORTE CLIENTE',
    fluxos: [{ funil: '22. PERDAS', etapa: 'PERDAS', entradaEm: '2025-01-01T00:00:00-03:00', tempoMin: 0, atrasoMin: 0 }] }
  const [card] = cardsDoProjeto(p, { agora: AGORA, prazos: { '22|PERDAS': 1 } })
  assert.equal(card.atraso, 0)
  assert.equal(card.diasFluxo, 0)
})
