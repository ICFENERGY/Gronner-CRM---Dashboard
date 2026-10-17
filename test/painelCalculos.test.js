import test from 'node:test'
import assert from 'node:assert/strict'
import { tsImport } from 'tsx/esm/api'
import { mapProjeto, normalizarProjetoLido } from '../server/mappers.js'

// calculos.ts é TypeScript do front: carregado pelo tsx (já é dependência de desenvolvimento).
const { calcularPainel, filtrosValidos, opcoesFiltros } = await tsImport('../src/features/painel/calculos.ts', import.meta.url)

const PADRAO = { periodo: '12m', vendedor: '', uf: '' }
// Formato que a sincronização gravou: o objeto completo do usuário no lugar do nome.
const usuario = (nome) => ({ id: 7, nome, cpf: 'x', email: 'x', celular: 'x', loja: { nome: 'Loja' } })

const fontes = () => ({
  vendas: [{ id: 1, vendedor: 'Ana Souza', estado: 'SC', dataVenda: '2026-09-10T10:00:00-03:00', valorTotal: 1000 }],
  propostas: [{ id: 1, vendedorNome: 'Ana Souza', dataInclusao: '2026-09-01T10:00:00-03:00', aceita: true }],
  projetos: [
    { id: 1, funil: '01. LEADS', etapa: 'NOVO', vendedorResponsavel: 'Ana Souza', estado: 'SC' },
    { id: 2, funil: '01. LEADS', etapa: 'NOVO', vendedorResponsavel: usuario('Bruno Lima'), estado: null },
    { id: 3, funil: '01. LEADS', etapa: 'NOVO', vendedorResponsavel: null, estado: { sigla: 'PR' } },
  ],
  tarefas: [],
  usinas: [],
  engenharia: { cards: [{ id: 2, marco: '6', cor: 'ok', vendedor: usuario('Bruno Lima'), estado: 'SC' }], prazos: { metaEntrega: 60 } },
})

test('painel com vendedor filtrado não quebra quando o vendedor do projeto vem como objeto', () => {
  // Antes: TypeError "(a ?? '').trim is not a function" e tela branca.
  for (const periodo of ['30d', 'mes', '3m', '12m', 'ano', 'tudo']) {
    for (const vendedor of ['Ana Souza', 'Bruno Lima', 'Sem Vendas']) {
      for (const uf of ['', 'SC', 'PR']) {
        assert.doesNotThrow(() => calcularPainel(fontes(), { periodo, vendedor, uf }), `${periodo} / ${vendedor} / ${uf}`)
      }
    }
  }
})

test('vendedor que só existe em projetos (como objeto) é filtrado pelo nome', () => {
  const p = calcularPainel(fontes(), { periodo: '12m', vendedor: 'Bruno Lima', uf: '' })
  assert.equal(p.kpis.qtdVendas, 0)
  assert.equal(p.kpis.vendido, 0)
  assert.equal(p.cards.length, 1)
  assert.equal(p.series.funil.reduce((a, f) => a + f.valor, 0), 1)
  assert.ok(p.series.vendasTempo.every((b) => b.valor === 0))
})

test('opções de filtro ignoram valores que não são texto', () => {
  assert.deepEqual(opcoesFiltros(fontes()).ufs, ['SC'])
})

test('filtros salvos inválidos voltam ao padrão', () => {
  assert.deepEqual(filtrosValidos({ periodo: 'xyz', vendedor: { nome: 'A' }, uf: 3 }, PADRAO), PADRAO)
  assert.deepEqual(filtrosValidos(null, PADRAO), PADRAO)
  assert.deepEqual(filtrosValidos([1], PADRAO), PADRAO)
  assert.deepEqual(filtrosValidos({ periodo: 'ano', vendedor: 'Ana', uf: 'SC', extra: 1 }, PADRAO), { periodo: 'ano', vendedor: 'Ana', uf: 'SC' })
})

test('servidor entrega só o nome do vendedor do projeto (sem dados pessoais do usuário)', () => {
  assert.equal(mapProjeto({ id: 1, vendedorResponsavel: usuario('Bruno Lima') }, {}).vendedorResponsavel, 'Bruno Lima')
  assert.equal(mapProjeto({ id: 1, vendedorResponsavel: 'Ana Souza' }, {}).vendedorResponsavel, 'Ana Souza')
  assert.equal(normalizarProjetoLido({ id: 1, vendedorResponsavel: usuario('Bruno Lima') }).vendedorResponsavel, 'Bruno Lima')
  const intacto = { id: 2, vendedorResponsavel: 'Ana' }
  assert.equal(normalizarProjetoLido(intacto), intacto)
})
