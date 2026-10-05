import test from 'node:test'
import assert from 'node:assert/strict'
import { mapProjeto, marcoDoStatus } from '../server/mappers.js'

test('aplica o filtro de Engenharia somente a status mapeados', () => {
  const ativo = mapProjeto({ id: 1, funil: '06. CONTRATO', etapa: 'VENDA REALIZADA' }, {})
  const elegivel = mapProjeto({ id: 2, funil: '06. CONTRATO', etapa: 'PENDÊNCIA DE HOMOLOGAÇÃO' }, {})
  const encerrado = mapProjeto({ id: 3, funil: '11. INSTALAÇÃO', etapa: 'DOSSIE ENVIADO' }, {})
  assert.equal(ativo.noFluxoEngenharia, false)
  assert.equal(elegivel.noFluxoEngenharia, true)
  assert.equal(encerrado.noFluxoEngenharia, true)
})

test('mantém G6 e FIM como marcos textuais próprios', () => {
  assert.equal(marcoDoStatus('AGUARDANDO ASSINATURA'), 'G6')
  assert.equal(marcoDoStatus('DOSSIE ENVIADO'), 'FIM')
  const fim = mapProjeto({ id: 4, funil: '11. INSTALAÇÃO', etapa: 'DOSSIE ENVIADO' }, {})
  assert.equal(fim.momento, 'encerrado')
})

test('calcula campos derivados no mapper', () => {
  const projeto = mapProjeto({
    id: 5,
    funil: '10. HOMOLOGAÇÃO',
    etapa: 'INSTALAÇÃO AGENDADA',
    dataUltimaAtualizacao: '2026-10-01',
  }, {})
  assert.equal(projeto.marco, '10')
  assert.equal(projeto.momento, 'implantação')
  assert.equal(typeof projeto.diasSemAtualizacao, 'number')
  assert.equal(projeto.noFluxoEngenharia, true)
})
