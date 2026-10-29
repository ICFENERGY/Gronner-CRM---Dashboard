import test from 'node:test'
import assert from 'node:assert/strict'
import { tsImport } from 'tsx/esm/api'

const c = await tsImport('../src/features/visao/calculos.ts', import.meta.url)
const HOJE = '2026-10-29'

const card = (id, marco, cor, extra = {}) => ({ id, marco, momento: 'imp', cor, dias: 10, acao: null, vendedor: 'Ana', ...extra })
const fontes = (extra = {}) => ({
  vendas: [
    ...[1, 2, 3, 4].map((i) => ({ id: i, vendedor: 'Ana', dataVenda: `2026-09-0${i}T10:00:00-03:00`, valorTotal: 25000 })),
    { id: 9, vendedor: 'Bruno', dataVenda: '2026-10-05T10:00:00-03:00', valorTotal: 10000 },
  ],
  propostas: [
    { id: 1, vendedorNome: 'Ana', dataInclusao: '2026-10-02', aceita: true, projetoId: 1 },
    { id: 2, vendedorNome: 'Ana', dataInclusao: '2026-10-03', aceita: false, projetoId: 2 },
  ],
  projetos: [],
  tarefas: [{ id: 1, atrasada: true }, { id: 2, atrasada: false }],
  usinas: {
    usinas: [
      { nome: 'A', fonte: 'solarz', desempenhoMedio3mPct: 0.4, statusDesempenho: 'Crítico', statusMonitoramento: 'CRITICO', anoMensal: 2026, mensal: [{ mes: 'Set', geracaoKwh: 80, prognosticoKwh: 100 }] },
      { nome: 'B', fonte: 'solarz', desempenhoMedio3mPct: 1.0, statusDesempenho: 'Dentro do esperado', statusMonitoramento: 'OK', anoMensal: 2026, mensal: [{ mes: 'Set', geracaoKwh: 100, prognosticoKwh: 100 }] },
      { nome: 'C', fonte: 'relatorio', desempenhoMedio3mPct: null, statusDesempenho: 'Sem dado', statusMonitoramento: null },
    ],
    avisoIntegracaoSolarZ: null,
    origemDados: { ticketsDisponiveis: true, ticketsAbertos: 2 },
  },
  engenharia: {
    cards: [card(1, '13', 'atrasado'), card(2, '13', 'atrasado'), card(3, '6', 'atrasado', { acao: { acao: 'x' } }), card(4, '6', 'ok', { vendedor: 'Bruno' })],
    prazos: { sla: { 13: 3, 6: 10 }, metaEntrega: 60 },
    painel: { concluidosPorMes: [{ mes: '2026-09', n: 4 }, { mes: '2026-10', n: 2 }] },
  },
  pietaResumo: {
    projects: [
      { projectId: 1, status: 'Em Vistoria', dueDate: '28/10/2026' },
      { projectId: 2, status: 'Em Vistoria', dueDate: '05/11/2026' },
      { projectId: 3, status: 'Pendência nas Assinaturas', dueDate: null },
      { projectId: 4, status: 'Finalizado', lastStatusChange: '2026-10-10T10:00:00-03:00' },
    ],
  },
  pietaMetricas: null,
  ...extra,
})

test('comercial compara o mês em curso com o mesmo trecho do mês anterior', () => {
  const r = c.calcularComercial(fontes(), { ano: '2026', mes: '10', vendedor: '' }, HOJE)
  assert.equal(r.vendido, 10000)
  assert.equal(r.vendidoAnt, 100000)
  assert.equal(r.base, 'vs 01/09 a 29/09')
  assert.equal(r.kpis.find((k) => k.id === 'vendido').delta.texto, '↓ 90%')
  assert.equal(r.kpis.find((k) => k.id === 'vendido').delta.tom, 'ruim')
  assert.match(r.frase, /^Em outubro\/2026 \(até 29\/10\): R\$ 10 mil em 1 venda, contra R\$ 100 mil em 4 vendas de 01\/09 a 29\/09\./)
  assert.equal(r.serie.length, 12)
  assert.equal(r.serie.at(-1).destaque, true)
  assert.equal(r.serie.at(-1).parcial, true)
})

test('engenharia: gargalo é o marco com mais atrasados e o vendedor recorta os cards', () => {
  const r = c.calcularEngenharia(fontes(), { vendedor: '' }, HOJE)
  assert.equal(r.atrasados, 3)
  assert.equal(r.gargalo.marco, '13')
  assert.equal(r.frase, '3 de 4 cards ativos estão atrasados (75%); o maior gargalo é o marco 13 · Relógio trocado, com 2 cards atrasados.')
  assert.equal(r.kpis.find((k) => k.id === 'concluidos').valor, '2')
  assert.equal(c.calcularEngenharia(fontes(), { vendedor: 'Bruno' }, HOJE).cards.length, 1)
})

test('usinas: críticas, farol e geração só das usinas da SolarZ em mês fechado', () => {
  const r = c.calcularUsinas(fontes(), HOJE)
  assert.equal(r.criticas, 1)
  assert.equal(r.farolCritico, 1)
  assert.equal(r.serie.length, 1)
  assert.equal(r.serie[0].pct, 90)
  assert.equal(r.kpis.find((k) => k.id === 'desempenho').valor, '70%')
})

test('homologação lê o prazo dd/mm/aaaa da Pieta e conta pendências pelo status', () => {
  const r = c.calcularHomologacao(fontes(), HOJE)
  assert.equal(r.ativos.length, 3)
  assert.equal(r.vencidos.length, 1)
  assert.equal(r.pendencia.length, 1)
  assert.equal(r.finMes, 1)
})

test('itens de atenção: só o que pede ação, do mais grave ao menos grave, no máximo 6', () => {
  const itens = c.itensAtencao(fontes(), HOJE)
  assert.equal(itens[0].id, 'eng-atrasados')
  assert.equal(itens[0].gravidade, 1)
  assert.ok(itens.length <= c.MAX_ITENS_ATENCAO)
  assert.ok(itens.some((i) => i.id === 'vendas-queda'))
  for (let i = 1; i < itens.length; i++) assert.ok(itens[i - 1].gravidade <= itens[i].gravidade)
  // Sem nada a agir, a lista fica vazia.
  const vazio = c.itensAtencao({ ...fontes(), vendas: [], tarefas: [], engenharia: { ...fontes().engenharia, cards: [card(1, '6', 'ok')] }, usinas: { usinas: [] }, pietaResumo: { projects: [] } }, HOJE)
  assert.deepEqual(vazio, [])
})
