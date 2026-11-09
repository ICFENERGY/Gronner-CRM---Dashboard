import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import express from 'express'
import {
  anoMes, cardDoProjeto, chaveEtapa, dataSemFuso, engResumoDoProjeto, etapaEngenharia, formatarTempoCard,
  montarCards, montarEngResumo, montarSales, numeroFunil, propostaPorProjeto, saleDaVenda, slugVendedor, validarMeta,
} from '../server/indicadores.js'
import { createIndicadoresRouter } from '../server/indicadoresRoutes.js'
import { mapVenda } from '../server/mappers.js'

// Formato exato dos arquivos que o painel usava (docs/data_*.json), na mesma ordem de campos.
const CAMPOS = {
  cards: ['codigo', 'funil', 'etapa', 'nome', 'dataAbertura', 'ano', 'mes', 'cidade', 'uf', 'valor', 'diasFluxo', 'atraso', 'dataAtualizacao'],
  eng: ['codigo', 'funil', 'etapa', 'nome', 'cliente', 'valor', 'atraso', 'tempoCard', 'cidade', 'uf'],
  sales: ['codigo', 'idNegocio', 'nome', 'vendedor', 'tipoNegocio', 'tipoVenda', 'statusVenda', 'etapaNegocio', 'statusNegocio', 'origemContato', 'cidade', 'uf', 'cep', 'logradouro', 'valorTotal', 'valorEntrada', 'valorFinanciado', 'valorProduto', 'valorPago', 'valorServico', 'dataCadastro', 'dataVenda', 'ano', 'mes'],
}

const AGORA = Date.parse('2026-11-02T20:00:00-03:00')
const PRAZOS = { '04|PROPOSTA CRIADA': 0.208, '10|PIETA_CRIACAO DO PROJETO': 5 }

// Projeto como a sincronização grava no Neon (mapProjetoParaArmazenar); dados fictícios.
const projeto = (extra = {}) => ({
  id: 67580, nome: 'Cliente Teste', funil: '04. FUNIL DE VENDAS SOLAR 🏆', etapa: 'PROPOSTA CRIADA',
  dataInclusao: '2026-10-23T08:20:30.338-03:00', dataUltimaAtualizacao: '2026-10-29T13:48:31.64-03:00',
  dataEntradaStatus: '2026-10-30T20:00:00-03:00', cidade: 'Cidade Teste', estado: 'SP',
  valorVenda: 0, valorPrePropostaAceita: 14463.4, ...extra,
})

const venda = (extra = {}) => ({
  id: 3, nome: 'Venda Teste', vendedor: 'Vendedora Teste', valorTotal: 49049.13, valorComissao: 0,
  dataVenda: '2023-07-25T14:17:04.455', cicloVenda: 7, origemNome: 'Agente Indicador ', statusNome: 'Pendencia Engrenharia',
  statusCor: '#15803D', cidade: 'Cidade Teste', estado: 'SP', bairro: 'Bairro', fornecedor: 'X', placa: null, inversor: null,
  lucro: null, lucroServico: null, ...extra,
})

test('formato: as listas têm exatamente os campos dos arquivos de docs/', () => {
  assert.deepEqual(Object.keys(cardDoProjeto(projeto(), { agora: AGORA, prazos: PRAZOS })), CAMPOS.cards)
  assert.deepEqual(Object.keys(engResumoDoProjeto(projeto({ funil: '10. HOMOLOGAÇÃO', etapa: 'PIETA_CRIACAO DO PROJETO' }), { agora: AGORA })), CAMPOS.eng)
  assert.deepEqual(Object.keys(saleDaVenda(venda())), CAMPOS.sales)
})

test('formato: confere com os arquivos de docs/ quando estão presentes (amostra local, não versionada)', (t) => {
  const arquivos = { cards: 'docs/data_cards.json', eng: 'docs/data_eng_resumo.json', sales: 'docs/data_sales.json' }
  for (const [nome, caminho] of Object.entries(arquivos)) {
    if (!fs.existsSync(caminho)) { t.diagnostic(`${caminho} ausente: conferência pulada`); continue }
    const [primeiro] = JSON.parse(fs.readFileSync(caminho, 'utf8'))
    assert.deepEqual(Object.keys(primeiro), CAMPOS[nome], caminho)
  }
})

test('card: datas sem fuso, ano/mês da abertura, valor da proposta aceita, dias no status e atraso pelo prazo da etapa', () => {
  const c = cardDoProjeto(projeto(), { agora: AGORA, prazos: PRAZOS })
  assert.equal(c.codigo, 67580)
  assert.equal(c.dataAbertura, '2026-10-23T08:20:30.338')
  assert.equal(c.dataAtualizacao, '2026-10-29T13:48:31.64')
  assert.equal(c.ano, 2026)
  assert.equal(c.mes, 10)
  assert.equal(c.uf, 'SP')
  assert.equal(c.valor, 14463.4)
  assert.equal(c.diasFluxo, 3)
  assert.ok(Math.abs(c.atraso - (3 - 0.208)) < 1e-9)
})

test('card: venda tem prioridade no valor; sem data de status ou sem prazo, diasFluxo/atraso ficam null', () => {
  assert.equal(cardDoProjeto(projeto({ valorVenda: 20000 })).valor, 20000)
  assert.equal(cardDoProjeto(projeto({ valorVenda: null, valorPrePropostaAceita: null })).valor, 0)
  const semData = cardDoProjeto(projeto({ dataEntradaStatus: null }), { agora: AGORA, prazos: PRAZOS })
  assert.equal(semData.diasFluxo, null)
  assert.equal(semData.atraso, null)
  const semPrazo = cardDoProjeto(projeto({ etapa: 'ETAPA NOVA' }), { agora: AGORA, prazos: PRAZOS })
  assert.equal(semPrazo.diasFluxo, 3)
  assert.equal(semPrazo.atraso, null)
  assert.equal(cardDoProjeto(projeto(), { agora: Date.parse('2026-10-30T21:00:00-03:00'), prazos: PRAZOS }).atraso, 0)
})

test('chave da etapa e número do funil', () => {
  assert.equal(numeroFunil('04. FUNIL DE VENDAS SOLAR 🏆'), '04')
  assert.equal(numeroFunil('GRUPOS GRONERZAP'), null)
  assert.equal(chaveEtapa('01. FUNIL OUTBOUND 🎯', 'Prospecção'), '01|PROSPECCAO')
  assert.equal(chaveEtapa('GRUPOS GRONERZAP', 'Novo'), 'GRUPOS GRONERZAP|NOVO')
  assert.equal(dataSemFuso('2026-10-31T21:24:39.56-03:00'), '2026-10-31T21:24:39.56')
  assert.deepEqual(anoMes(null), { ano: null, mes: null })
})

test('resumo da engenharia: só funis 08-14, etapa na grafia do painel, tempo do card e atraso 0/1', () => {
  assert.equal(engResumoDoProjeto(projeto()), null) // funil 04 fica de fora
  const e = engResumoDoProjeto(projeto({ funil: '10. HOMOLOGAÇÃO', etapa: 'PIETA_CRIACAO DO PROJETO', dataEntradaStatus: '2026-10-26T17:00:00-03:00' }), { agora: AGORA, prazos: PRAZOS })
  assert.equal(e.codigo, '#67580')
  assert.equal(e.funil, '10')
  assert.equal(e.etapa, 'Pieta - Criacao do Projeto')
  assert.equal(e.cliente, null)
  assert.equal(e.tempoCard, '7d 3h 0m')
  assert.equal(e.atraso, 1)
  assert.equal(etapaEngenharia('11', 'DIÁRIO DE OBRA / OBRA ANDAMENTO'), 'Diario de Obra / Obra Andamento')
  assert.equal(etapaEngenharia('11', 'Etapa desconhecida'), 'Etapa desconhecida')
  assert.equal(formatarTempoCard(2.982), '2d 23h 34m')
  assert.equal(formatarTempoCard(null), null)
})

test('listas ordenadas: cards do mais novo, engenharia na ordem de funil e etapa', () => {
  const ps = [
    projeto({ id: 1, funil: '11. INSTALAÇÃO', etapa: 'DOSSIE' }),
    projeto({ id: 2, funil: '08. ENGENHARIA PROJETO', etapa: 'PROPOSTA CRIADA APROVADA' }),
    projeto({ id: 3, funil: '08. ENGENHARIA PROJETO', etapa: 'CRIAR PROJETO->PROPOSTA' }),
  ]
  assert.deepEqual(montarCards(ps, { agora: AGORA }).map((c) => c.codigo), [3, 2, 1])
  assert.deepEqual(montarEngResumo(ps, { agora: AGORA }).map((e) => e.codigo), ['#3', '#2', '#1'])
})

test('venda: sem cep/logradouro, origem sem espaço sobrando, negócio pela proposta do projeto', () => {
  const propostas = propostaPorProjeto([
    { projetoId: 10216, aceita: false, dataInclusao: '2023-07-01', projetoTipo: 'Antigo', etapaProjeto: 'x', statusProjeto: 'x' },
    { projetoId: 10216, aceita: true, dataInclusao: '2023-06-01', projetoTipo: '**B2C_Residencial', etapaProjeto: '06. CONTRATO', statusProjeto: 'VENDA REALIZADA' },
  ])
  const s = saleDaVenda(venda({ idNegocio: 10216, cep: '00000-000', logradouro: 'Rua X' }), { propostas, enriquecimento: { 3: { valorProduto: 26533.23, valorServico: 6747.32 } } })
  assert.equal(s.cep, null)
  assert.equal(s.logradouro, null)
  assert.equal(s.origemContato, 'Agente Indicador')
  assert.equal(s.tipoNegocio, '**B2C_Residencial')
  assert.equal(s.etapaNegocio, '06. CONTRATO')
  assert.equal(s.statusNegocio, 'VENDA REALIZADA')
  assert.equal(s.valorProduto, 26533.23)
  assert.equal(s.valorServico, 6747.32)
  assert.equal(s.ano, 2023)
  assert.equal(s.mes, 7)
  assert.equal(s.statusVenda, null)
})

test('venda sem projeto gravado: negócio fica null (lacuna), valores da planilha só como complemento', () => {
  const s = saleDaVenda(venda({ valorProduto: 100 }), { enriquecimento: { 3: { valorProduto: 999 } } })
  assert.equal(s.idNegocio, null)
  assert.equal(s.tipoNegocio, null)
  assert.equal(s.valorProduto, 100)
  assert.deepEqual(montarSales([venda({ id: 9 }), venda({ id: 2 })]).map((x) => x.codigo), [2, 9])
})

test('mapVenda guarda o projeto e os valores da venda para o painel (sem campo novo, null)', () => {
  const r = mapVenda({ id: 5, nome: 'N', vendedor: 'V', valorTotal: 10, projetoId: 77, valorEntrada: 2, valorFinanciamento: 8, dataInclusao: '2026-01-02T10:00:00' }, {})
  assert.equal(r.idNegocio, 77)
  assert.equal(r.valorEntrada, 2)
  assert.equal(r.valorFinanciado, 8)
  assert.equal(r.dataCadastro, '2026-01-02T10:00:00-03:00')
  const vazio = mapVenda({ id: 6, valorTotal: 1 }, {})
  assert.equal(vazio.idNegocio, null)
  assert.equal(vazio.valorEntrada, null)
  assert.equal(vazio.dataCadastro, null)
})

test('meta: valida vendedor conhecido, ano, id e 12 meses', () => {
  const ok = validarMeta('vendedora_teste_2026', { vendedor: 'Vendedora Teste', ano: 2026, valorMinimo: Array(12).fill(1000), valorPrevisto: Array(12).fill('2000') }, ['Vendedora Teste'])
  assert.equal(ok.valorPrevisto[0], 2000)
  assert.equal(slugVendedor('João da Silva'), 'joao_da_silva')
  const corpo = { vendedor: 'Vendedora Teste', ano: 2026, valorMinimo: Array(12).fill(0), valorPrevisto: Array(12).fill(0) }
  assert.throws(() => validarMeta('vendedora_teste_2026', corpo, []), /não encontrado/)
  assert.throws(() => validarMeta('outro_2026', corpo, ['Vendedora Teste']), /não corresponde/)
  assert.throws(() => validarMeta('vendedora_teste_2026', { ...corpo, valorMinimo: [1] }, ['Vendedora Teste']), /12 meses/)
  assert.throws(() => validarMeta('vendedora_teste_2026', { ...corpo, valorMinimo: Array(12).fill(-1) }, ['Vendedora Teste']), /inválido/)
  assert.throws(() => validarMeta('../x', corpo, ['Vendedora Teste']), /inválido/)
})

// ─── Rotas, com o Neon simulado (nenhuma chamada externa) ────────────────────

function pgFalso() {
  const linhas = new Map()
  return {
    linhas,
    async rows(_sql, [chave]) { return linhas.has(chave) ? [{ dados: linhas.get(chave) }] : [] },
    async upsert(itens) { for (const i of itens) { assert.equal(i.tipo, 'config'); assert.equal(i.entidade, 'vendas'); linhas.set(i.chave, i.dados) } },
  }
}

async function servidor(opcoes) {
  const app = express()
  app.use(express.json())
  app.use('/api/indicadores', createIndicadoresRouter(opcoes))
  const srv = http.createServer(app)
  await new Promise((r) => srv.listen(0, r))
  const base = `http://127.0.0.1:${srv.address().port}/api/indicadores`
  return { base, fechar: () => new Promise((r) => srv.close(r)) }
}

test('rotas: listas no formato dos arquivos, lidas só do armazenamento; banco vazio devolve listas vazias com aviso', async () => {
  const lidas = []
  const dados = {
    projetos: { items: [projeto(), projeto({ id: 2, funil: '10. HOMOLOGAÇÃO', etapa: 'PIETA_CRIACAO DO PROJETO' })], sync: { finishedAt: '2026-11-02T10:00:00Z' } },
    vendas: { items: [venda({ idNegocio: 10216 })], sync: { finishedAt: '2026-11-09T07:13:15Z' } },
    propostas: { items: [{ projetoId: 10216, aceita: true, projetoTipo: 'Igreja' }] },
  }
  const { base, fechar } = await servidor({ carregar: async (e) => { lidas.push(e); return dados[e] ?? null }, pg: () => pgFalso(), prazos: PRAZOS, agora: () => AGORA })
  try {
    const cards = await (await fetch(`${base}/cards`)).json()
    assert.equal(cards.length, 2)
    assert.deepEqual(Object.keys(cards[0]), CAMPOS.cards)
    const eng = await (await fetch(`${base}/eng-resumo`)).json()
    assert.deepEqual(eng.map((e) => e.codigo), ['#2'])
    const sales = await (await fetch(`${base}/sales`)).json()
    assert.equal(sales[0].tipoNegocio, 'Igreja')
    assert.equal(sales[0].cep, null)
    const status = await (await fetch(`${base}/status`)).json()
    assert.equal(status.fonte, 'neon')
    assert.equal(status.aviso, null)
    assert.equal(status.sales.atualizadoEm, '2026-11-09T07:13:15Z')
    assert.ok(status.sales.lacunas.some((l) => l.campo === 'cep/logradouro'))
    assert.deepEqual([...new Set(lidas)].sort(), ['projetos', 'propostas', 'vendas'])
  } finally { await fechar() }

  const vazio = await servidor({ carregar: async () => null, pg: () => null })
  try {
    assert.deepEqual(await (await fetch(`${vazio.base}/cards`)).json(), [])
    const status = await (await fetch(`${vazio.base}/status`)).json()
    assert.match(status.aviso, /Ainda não há projetos/)
    assert.equal((await fetch(`${vazio.base}/metas/vendedora_teste_2026`)).status, 503)
  } finally { await vazio.fechar() }
})

test('rotas: metas gravadas na tabela única (config/vendas) e protegidas por METAS_TOKEN quando definido', async () => {
  const pg = pgFalso()
  const dados = { vendas: { items: [venda()] } }
  const { base, fechar } = await servidor({ carregar: async (e) => dados[e] ?? null, pg: () => pg })
  const corpo = { vendedor: 'Vendedora Teste', ano: 2026, valorMinimo: Array(12).fill(1), valorPrevisto: Array(12).fill(2) }
  const put = (headers = {}) => fetch(`${base}/metas/vendedora_teste_2026`, { method: 'PUT', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(corpo) })
  const anterior = process.env.METAS_TOKEN
  try {
    delete process.env.METAS_TOKEN
    let r = await (await fetch(`${base}/metas/vendedora_teste_2026`)).json()
    assert.equal(r.existe, false)
    assert.equal((await put()).status, 200)
    assert.ok(pg.linhas.has('meta:vendedora_teste_2026'))
    r = await (await fetch(`${base}/metas/vendedora_teste_2026`)).json()
    assert.equal(r.existe, true)
    assert.deepEqual(r.dados.valorPrevisto, Array(12).fill(2))
    assert.equal((await fetch(`${base}/metas/x..y`)).status, 400)

    process.env.METAS_TOKEN = 'segredo-teste'
    assert.equal((await put()).status, 401)
    assert.equal((await put({ 'X-Metas-Token': 'segredo-teste' })).status, 200)
  } finally {
    if (anterior === undefined) delete process.env.METAS_TOKEN
    else process.env.METAS_TOKEN = anterior
    await fechar()
  }
})

test('um card em vários funis vira uma linha por funil, com tempo e atraso do próprio funil', async () => {
  const { fluxosDoProjeto } = await import('../server/mappers.js')
  const { montarCards } = await import('../server/indicadores.js')
  const p = {
    statusAtuais: [{ id: 136, nome: 'ATENDIMENTO POS VENDA', etapaId: 25 }, { id: 354, nome: 'VENDA REALIZADA', etapaId: 7 }],
    etapasAtuais: [{ id: 25, nome: '12. POS VENDA CLIENTE' }, { id: 7, nome: '06. CONTRATO' }],
    contadoresFluxo: [
      { etapaId: 7, statusId: 354, entradaColunaEm: '2026-05-19T18:58:06', tempoFluxoMinutos: 2880, atrasoFluxoMinutos: 1440 },
      { etapaId: 25, statusId: 136, entradaColunaEm: '2023-07-23T18:23:08', tempoFluxoMinutos: 0, atrasoFluxoMinutos: 0 },
    ],
  }
  const fluxos = fluxosDoProjeto(p)
  assert.equal(fluxos.length, 2)
  const cards = montarCards([{ id: 1, nome: 'X', funil: '06. CONTRATO', etapa: 'VENDA REALIZADA', fluxos }])
  assert.equal(cards.length, 2)
  const contrato = cards.find((c) => c.funil === '06. CONTRATO')
  assert.equal(contrato.diasFluxo, 2)
  assert.equal(contrato.atraso, 1)
  assert.equal(cards.find((c) => c.funil === '12. POS VENDA CLIENTE').atraso, 0)
})
