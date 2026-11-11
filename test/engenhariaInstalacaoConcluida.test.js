import test from 'node:test'
import assert from 'node:assert/strict'
import { engResumosDoProjeto, montarEngResumo, foraDaEngenharia } from '../server/indicadores.js'
import { montarGestao, diagnosticarCard } from '../server/engenhariaGestao.js'

const fluxo = (funil, etapa) => ({ funil, etapa, tempoMin: 10 * 1440, atrasoMin: 0 })
// Card real (66269): principal em Homologação e "Instalação Concluída" só como funil adicional.
const projeto = {
  id: 66269, nome: 'Cliente X', funil: '10. HOMOLOGAÇÃO', etapa: 'PENDENCIA VIST. CONCESSIONARIA', cidade: 'Aluminio', estado: 'SP',
  fluxos: [fluxo('10. HOMOLOGAÇÃO', 'PENDENCIA VIST. CONCESSIONARIA'), fluxo('11. INSTALAÇÃO', 'INSTALAÇÃO CONCLUIDA'), fluxo('09. COMPRAS', 'PEDIDO ENTREGUE')],
}

test('Engenharia: "Instalação Concluída" (funil 11) fica de fora, as outras posições do card continuam', () => {
  assert.equal(foraDaEngenharia('11. INSTALAÇÃO', 'INSTALAÇÃO CONCLUIDA'), true)
  assert.equal(foraDaEngenharia('11. INSTALAÇÃO', 'Instalacao Concluida'), true)
  assert.equal(foraDaEngenharia('11. INSTALAÇÃO', 'TERMO DE ACEITE'), false)
  assert.equal(foraDaEngenharia('11. INSTALAÇÃO', 'DOSSIE'), false)
  assert.equal(foraDaEngenharia('13. SUPORTE CLIENTE', 'INSTALACAO CONCLUIDA'), false)

  const linhas = engResumosDoProjeto(projeto)
  assert.deepEqual(linhas.map((l) => `${l.funil}|${l.etapa}`), ['10|Pendencia Vist. Concessionaria', '09|Pedido Entregue'])
  assert.equal(montarEngResumo([projeto]).some((l) => l.funil === '11'), false)
})

test('Engenharia: card sem lista de funis, parado em "Instalação Concluída", também sai', () => {
  const so = { id: 1, nome: 'Y', funil: '11. INSTALAÇÃO', etapa: 'INSTALAÇÃO CONCLUIDA', dataEntradaStatus: '2026-10-01T10:00:00-03:00' }
  assert.deepEqual(engResumosDoProjeto(so), [])
})

test('Gestão diária: a linha do card em "Instalação Concluída" não é diagnosticada', () => {
  const card = (funil, etapa) => ({ codigo: 66269, nome: 'Cliente X', funil, etapa, diasFluxo: 40, atraso: 1, valor: 100, cidade: 'Aluminio', uf: 'SP' })
  assert.equal(diagnosticarCard(card('11. INSTALAÇÃO', 'INSTALAÇÃO CONCLUIDA')), null)
  assert.notEqual(diagnosticarCard(card('11. INSTALAÇÃO', 'PENDENCIA DE OBRA')), null)
  const itens = montarGestao([card('11. INSTALAÇÃO', 'INSTALAÇÃO CONCLUIDA'), card('10. HOMOLOGAÇÃO', 'PARECER EMITIDO')])
  assert.deepEqual(itens.map((i) => i.funil), ['10'])
})
