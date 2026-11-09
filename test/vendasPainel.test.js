import test from 'node:test'
import assert from 'node:assert/strict'
import { tsImport } from 'tsx/esm/api'

// vendasPainel.ts é TypeScript do front (aba Vendas): carregado pelo tsx.
const { combinarVendas, filtrarVendas, saleDeVendaRaw, somaInformada, rotuloMes } = await tsImport('../src/features/vendas/vendasPainel.ts', import.meta.url)

// Dados fictícios.
const sale = (extra = {}) => ({
  codigo: 3, idNegocio: 10216, nome: 'Cliente A', vendedor: ' Ana ', tipoNegocio: '**B2C_Residencial', tipoVenda: null, statusVenda: null,
  etapaNegocio: '06. CONTRATO', statusNegocio: 'VENDA REALIZADA', origemContato: 'Agente Indicador ', cidade: 'Canoas', uf: 'RS',
  cep: null, logradouro: null, valorTotal: 1000, valorEntrada: null, valorFinanciado: null, valorProduto: 600, valorPago: null,
  valorServico: null, dataCadastro: null, dataVenda: '2026-03-10T10:00:00', ano: 2026, mes: 3, ...extra,
})
const raw = (extra = {}) => ({
  id: 3, nome: 'Cliente A', vendedor: 'Ana', valorTotal: 1000, valorComissao: 50, dataVenda: '2026-03-10T10:00:00', cicloVenda: 7,
  origemNome: 'Agente Indicador', statusNome: 'Pendencia Engrenharia', statusCor: '#000', cidade: 'Canoas', estado: 'RS', bairro: 'B',
  fornecedor: 'FortLev', placa: null, inversor: null, lucro: 10, lucroServico: null, ...extra,
})

test('combina sales (fonte principal) com a venda gravada pelo código', () => {
  const [v] = combinarVendas([sale()], [raw()])
  assert.equal(v.vendedor, 'Ana')
  assert.equal(v.origemContato, 'Agente Indicador')
  assert.equal(v.tipoNegocio, '**B2C_Residencial')
  assert.equal(v.fornecedor, 'FortLev')
  assert.equal(v.valorComissao, 50)
  assert.equal(v.statusNome, 'Pendencia Engrenharia')
})

test('sem sales, usa as vendas gravadas no mesmo formato', () => {
  const [v] = combinarVendas(null, [raw()])
  assert.equal(v.codigo, 3)
  assert.equal(v.uf, 'RS')
  assert.equal(v.ano, 2026)
  assert.equal(v.mes, 3)
  assert.equal(v.tipoNegocio, null)
  assert.equal(saleDeVendaRaw(raw({ dataVenda: null })).ano, null)
  assert.deepEqual(combinarVendas(null, null), [])
})

test('filtros por ano, mês, vendedor, tipo, origem, UF e busca', () => {
  const vendas = combinarVendas([sale(), sale({ codigo: 4, vendedor: 'Bia', ano: 2025, mes: 12, uf: 'SP', tipoNegocio: 'Igreja', nome: 'Outro' })], [])
  assert.equal(filtrarVendas(vendas, { ano: '2026' }).length, 1)
  assert.equal(filtrarVendas(vendas, { mes: 'Dez' })[0].codigo, 4)
  assert.equal(filtrarVendas(vendas, { vendedor: 'Ana' }).length, 1)
  assert.equal(filtrarVendas(vendas, { tipoNegocio: 'Igreja' })[0].codigo, 4)
  assert.equal(filtrarVendas(vendas, { origem: 'Agente Indicador' }).length, 2)
  assert.equal(filtrarVendas(vendas, { uf: 'SP' }).length, 1)
  assert.equal(filtrarVendas(vendas, { busca: 'cliente' }).length, 1)
  assert.equal(rotuloMes({ mes: null }), '—')
})

test('soma de valores opcionais conta só quem informa', () => {
  const vendas = [sale(), sale({ valorProduto: null }), sale({ valorProduto: 400 })]
  assert.deepEqual(somaInformada(vendas, 'valorProduto'), { soma: 1000, informadas: 2 })
  assert.deepEqual(somaInformada(vendas, 'valorEntrada'), { soma: 0, informadas: 0 })
})
