import test from 'node:test'
import assert from 'node:assert/strict'
import { classificarCard, entradaNoMarco, prazosEfetivos } from '../server/engenharia.js'
import {
  dataGronerValida, mapProjeto, mapProjetoParaArmazenar, mesclarProjetoComDetalhe, normalizarProjetoLido, resumirDetalheProjeto, siglaUF,
} from '../server/mappers.js'
import { canonicalHash } from '../server/syncStore.js'

const SENTINELA = '0001-01-01T00:00:00'
const prazos = prazosEfetivos(null)

/** Item da listagem do /Projeto (formato real, campos relevantes). */
const listagem = (extra) => ({
  id: 9001, nome: 'Card teste', etapa: '08. ENGENHARIA PROJETO', status: { nome: 'PENDÊNCIAS TÉCNICAS->PROJETOS' }, statusId: 50,
  dataInclusao: '2026-10-01T09:00:00.12', dataUltimaAtualizacao: '2026-10-10T16:56:04.11', dataUltimoStatus: '2026-10-08T16:44:34.01',
  statusAtuaisComData: [{ statusId: 50, data: '2026-10-08T16:44:34.01' }, { statusId: 7, data: '2026-10-02T12:00:00' }],
  cidade: null, uf: null, consumo: 500, vendedorResponsavel: 'Ana', dataVenda: SENTINELA, ...extra,
})

/** Detalhe GET /Projeto/{id}: dataUltimoStatus sentinela e a loja (Barueri/SP) dentro do contato e do vendedor. */
const detalhe = () => ({
  id: 9001, nome: 'Card teste', statusId: 50, dataUltimoStatus: SENTINELA, dataInclusao: '2026-10-01T09:00:00.12', dataAlteracao: '2026-10-10T16:56:04',
  status: { nome: 'PENDÊNCIAS TÉCNICAS->PROJETOS', etapa: { nome: '08. ENGENHARIA PROJETO' } },
  statusAtuais: [{ statusId: 50, data: '2026-10-08T16:44:34.01', status: { nome: 'PENDÊNCIAS TÉCNICAS->PROJETOS' } }],
  endereco: { cidade: 'Ibiúna', uf: 'São Paulo', bairro: 'Centro' },
  lead: {
    endereco: { cidade: 'Ibiúna', uf: 'SP' },
    loja: { nome: 'Loja', endereco: { cidade: 'Barueri', uf: 'SP' }, dataInclusao: '2023-01-17T20:02:21' },
    responsavel: { nome: 'Ana', dataStatus: SENTINELA, loja: { endereco: { cidade: 'Barueri', estado: 'MT' } } },
  },
  vendedorResponsavel: { nome: 'Ana', email: 'x', dataStatus: SENTINELA, loja: { endereco: { cidade: 'Barueri' } } },
  concessionaria: { nome: 'ENEL SP' }, unidadeConsumidora: '123', tipoTelhado: { nome: 'Cerâmico' }, faseEnergetica: 'Bifásico',
  prePropostaAceita: { dataInclusao: '2026-10-05T10:00:00', preProposta: { simulacao: { kwP: 6.6, geracaoMensal: 800, preco: 20000 } } },
  prePropostas: [{ simulacao: { kwP: 99 } }, { simulacao: { kwP: 6.6 } }],
  consumo: 41.6, consumoTotal: 500, tipo: { nome: 'Residencial' }, projetista: { nome: 'Pedro', cpf: 'x' }, projetistaId: 3,
})

test('mescla listagem + detalhe: datas e cidade da listagem/endereço do projeto, nunca da loja', () => {
  const mesclado = mesclarProjetoComDetalhe(listagem(), detalhe(), [])
  assert.equal(mesclado.dataUltimoStatus, '2026-10-08T16:44:34.01')
  assert.equal(mesclado.lead, undefined)
  const p = mapProjeto(mesclado, {})
  assert.equal(p.dataUltimoStatus, '2026-10-08T16:44:34.01-03:00')
  assert.equal(p.dataEntradaStatus, '2026-10-08T16:44:34.01-03:00')
  assert.equal(p.dataUltimaAtualizacao, '2026-10-10T16:56:04.11-03:00')
  assert.equal(p.cidade, 'Ibiúna')
  assert.equal(p.estado, 'SP')
  assert.equal(p.concessionaria, 'ENEL SP')
  assert.equal(p.kwp, 6.6)
  assert.equal(p.geracaoMensalPrevista, 800)
  assert.equal(p.consumo, 500)
  assert.equal(p.dataVenda, null)
  assert.equal(p.marco, '3')
  // Cidade da listagem, quando existe, ganha do detalhe.
  assert.equal(mapProjeto(mesclarProjetoComDetalhe(listagem({ cidade: 'Sorocaba', uf: 'São Paulo' }), detalhe(), []), {}).cidade, 'Sorocaba')
})

test('detalhe espalhado por cima da listagem (fluxo antigo do n8n) também sai certo', () => {
  const p = mapProjeto({ ...listagem(), ...detalhe(), camposPersonalizados: [] }, {})
  assert.equal(p.dataUltimoStatus, null)
  assert.equal(p.dataEntradaStatus, '2026-10-08T16:44:34.01-03:00')
  assert.equal(p.cidade, 'Ibiúna')
  assert.equal(p.estado, 'SP')
  assert.equal(p.tipo, 'Residencial')
  assert.equal(p.projetista, 'Pedro')
  assert.equal(p.consumo, 500)
  const card = classificarCard(p, { prazos, hoje: '2026-10-12' })
  assert.equal(card.dias, 3)
})

test('sem detalhe e sem cidade: Barueri da loja nunca aparece, cai no Deals', () => {
  const p = mapProjeto({ ...listagem(), lead: { loja: { endereco: { cidade: 'Barueri', uf: 'SP' } } } }, { 9001: { cidade: 'Itu', estado: 'SP' } })
  assert.equal(p.cidade, 'Itu')
})

test('datas: 0001-01-01, anos < 1950 e futuro absurdo são vazias; UF por extenso vira sigla', () => {
  assert.equal(dataGronerValida(SENTINELA), null)
  assert.equal(dataGronerValida('1901-01-01T00:00:00'), null)
  assert.equal(dataGronerValida('2999-01-01T00:00:00'), null)
  assert.equal(dataGronerValida('lixo'), null)
  assert.equal(dataGronerValida('2026-10-05T13:40:46.72'), '2026-10-05T13:40:46.72-03:00')
  assert.equal(siglaUF('São Paulo'), 'SP')
  assert.equal(siglaUF('mato grosso do sul'), 'MS')
  assert.equal(siglaUF('XX'), null)
})

test('classificarCard com 0001-01-01: não dá 739905 dias, usa a melhor data válida', () => {
  const base = { id: 1, marco: '3', etapa: 'PENDENCIAS TECNICAS->PROJETOS', noFluxoEngenharia: true }
  const sentinela = `${SENTINELA}-03:00`
  const comAtualizacao = classificarCard({ ...base, dataUltimoStatus: sentinela, dataEntradaStatus: sentinela, dataUltimaAtualizacao: '2026-10-10T10:00:00-03:00', dataInclusao: '2026-10-01T10:00:00-03:00' }, { prazos, hoje: '2026-10-12' })
  assert.equal(comAtualizacao.dias, 2)
  assert.equal(comAtualizacao.estimado, true)
  assert.equal(comAtualizacao.desde, '2026-10-10T10:00:00-03:00')
  // Sem nenhuma data válida: aviso, 0 dias e não fica atrasado por isso.
  const semData = classificarCard({ ...base, dataUltimoStatus: sentinela, dataEntradaStatus: sentinela }, { prazos, hoje: '2026-10-12' })
  assert.equal(semData.dias, 0)
  assert.equal(semData.desde, null)
  assert.notEqual(semData.cor, 'atrasado')
  assert.ok(semData.motivos.some((m) => /Sem data de entrada no marco/.test(m)))
  // Data anterior ao cadastro do projeto não vale: cai na próxima.
  const antiga = entradaNoMarco({ ...base, dataUltimoStatus: '2020-01-01T10:00:00-03:00', dataUltimaAtualizacao: '2026-10-10T10:00:00-03:00', dataInclusao: '2026-10-01T10:00:00-03:00' }, '2026-10-12')
  assert.equal(antiga.desde, '2026-10-10T10:00:00-03:00')
  // Data no futuro também não.
  const futura = entradaNoMarco({ ...base, dataUltimoStatus: '2026-12-01T10:00:00-03:00', dataInclusao: '2026-10-01T10:00:00-03:00' }, '2026-10-12')
  assert.equal(futura.desde, '2026-10-01T10:00:00-03:00')
})

test('normalizarProjetoLido corrige registro já gravado com sentinela e cidade da loja', () => {
  const gravado = {
    id: 9001, marco: '3', cidade: 'Barueri', estado: 'MT', kwp: 99, dataUltimoStatus: `${SENTINELA}-03:00`, dataEntradaStatus: `${SENTINELA}-03:00`,
    dataUltimaAtualizacao: '2026-10-10T10:00:00-03:00', dataVenda: null, vendedorResponsavel: 'Ana',
  }
  const p = normalizarProjetoLido(gravado, { 9001: { cidade: 'Ibiúna', estado: 'São Paulo' } }, Date.parse('2026-10-12T12:00:00-03:00'))
  assert.equal(p.dataUltimoStatus, null)
  assert.equal(p.dataEntradaStatus, null)
  assert.equal(p.cidade, 'Ibiúna')
  assert.equal(p.estado, 'SP')
  assert.equal(p.kwp, null)
  assert.equal(p.diasSemAtualizacao, 2)
  // Registro bom não é tocado (só a UF por extenso vira sigla).
  const bom = { id: 2, cidade: 'Itu', estado: 'SP', dataUltimoStatus: '2026-10-08T10:00:00-03:00' }
  assert.equal(normalizarProjetoLido(bom), bom)
  assert.equal(normalizarProjetoLido({ ...bom, estado: 'São Paulo' }).estado, 'SP')
})

test('registro gravado não depende do relógio: mesmo hash em dias diferentes', () => {
  const item = mesclarProjetoComDetalhe(listagem({ dataVenda: '2026-09-01T10:00:00' }), detalhe(), [])
  const registro = mapProjetoParaArmazenar(item, {})
  assert.equal('diasSemAtualizacao' in registro, false)
  assert.equal('diasDesdeVenda' in registro, false)
  assert.equal(canonicalHash(registro), canonicalHash(mapProjetoParaArmazenar(item, {})))
  // A leitura repõe os dias.
  assert.equal(typeof normalizarProjetoLido(registro).diasSemAtualizacao, 'number')
})

test('detalhe embrulhado em { Content } produz cidade, concessionária, kWp e UC', () => {
  const d = detalhe()
  const r = resumirDetalheProjeto({ Content: d })
  assert.equal(r.cidade, 'Ibiúna')
  assert.equal(r.concessionaria, 'ENEL SP')
  assert.equal(r.kwp, 6.6)
  assert.equal(r.uc, '123')
  assert.deepEqual(resumirDetalheProjeto({ content: d }), r)
  assert.deepEqual(resumirDetalheProjeto(d), r)
})

test('datas dd/mm/aaaa e dd/mm/aaaa hh:mm viram ISO; datas impossíveis são vazias', () => {
  assert.equal(dataGronerValida('17/10/2026'), '2026-10-17')
  assert.equal(dataGronerValida('05/03/2026 14:30'), '2026-03-05T14:30:00-03:00')
  assert.equal(dataGronerValida('2026-02-30'), null)
  assert.equal(dataGronerValida('30/02/2026'), null)
  assert.equal(dataGronerValida('2026-13-01'), null)
  assert.equal(dataGronerValida('29/02/2024'), '2024-02-29')
  assert.equal(dataGronerValida('29/02/2026'), null)
  const p = mapProjeto({ ...listagem(), camposPersonalizados: [{ campos: [{ campo: { titulo: 'Data de início da instalação' }, resposta: '12/10/2026' }] }] })
  assert.equal(p.dataInicioInstalacao, '2026-10-12')
})

test('siglaUF aceita hífen no lugar de espaço', () => {
  assert.equal(siglaUF('Distrito-Federal'), 'DF')
  assert.equal(siglaUF('Rio-Grande-do-Sul'), 'RS')
})
