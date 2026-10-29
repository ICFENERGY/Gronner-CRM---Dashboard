import test from 'node:test'
import assert from 'node:assert/strict'
import { tsImport } from 'tsx/esm/api'

const c = await tsImport('../src/features/areas/calculos.ts', import.meta.url)
const t = await tsImport('../src/features/areas/indicadores.ts', import.meta.url)
const HOJE = '2026-10-29'
const OUT = { ano: '2026', mes: '10', vendedor: '' }

const fontes = (extra = {}) => ({
  vendas: [
    ...[1, 2, 3, 4].map((i) => ({ id: i, vendedor: 'Ana', dataVenda: `2026-09-0${i}T10:00:00-03:00`, valorTotal: 25000, lucro: i === 1 ? 5000 : null, valorComissao: 0 })),
    { id: 9, vendedor: 'Bruno', dataVenda: '2026-10-05T10:00:00-03:00', valorTotal: 10000, lucro: 12000, valorComissao: 300 },
  ],
  propostas: [
    { id: 1, vendedorNome: 'Ana', dataInclusao: '2026-10-02', aceita: true, projetoId: 1, preco: 30000 },
    { id: 2, vendedorNome: 'Ana', dataInclusao: '2026-10-03', aceita: false, projetoId: 2, preco: 9000 },
    { id: 3, vendedorNome: 'Ana', dataInclusao: '2026-10-04', aceita: true, projetoId: 3, preco: 20000 },
  ],
  projetos: [
    { id: 1, funil: '08. ENGENHARIA PROJETO', etapa: 'CRIAR PROJETO->PROPOSTA', valorVenda: 0, valorPrePropostaAceita: 30000, vendedorResponsavel: 'Ana', dataInclusao: '2026-10-01' },
    { id: 3, funil: '04. FUNIL DE VENDAS SOLAR 🏆', etapa: 'FOLLOWUP', valorVenda: 0, valorPrePropostaAceita: 20000, vendedorResponsavel: 'Ana', dataInclusao: '2026-10-02' },
    { id: 4, funil: '07. FINANCEIRO', etapa: 'AGUARDANDO PAGAMENTO', valorVenda: 8000, vendedorResponsavel: 'Ana', dataInclusao: '2026-09-02' },
    { id: 5, funil: '07. FINANCEIRO', etapa: 'PAGAMENTO REALIZADO', valorVenda: 1050, vendedorResponsavel: 'Bruno', dataInclusao: '2026-09-03' },
    { id: 6, funil: '06. CONTRATO', etapa: 'PERDIDO CONTRATO', valorVenda: 0, valorPrePropostaAceita: 7000, vendedorResponsavel: 'Ana', dataInclusao: '2026-10-03' },
    { id: 7, funil: '19. PARCERIAS COMERCIAIS', etapa: 'NOVO PARCEIRO EXPERT', vendedorResponsavel: 'Ana', dataInclusao: '2026-10-04' },
  ],
  tarefas: [{ id: 1, atrasada: true }, { id: 2, atrasada: false }],
  usinas: {
    usinas: [
      { nome: 'A', fonte: 'solarz', potenciaKwp: 10, desempenhoMedio3mPct: 0.4, desempenho30dPct: 0.5, desempenho12mPct: 0.6, statusDesempenho: 'Crítico', statusMonitoramento: 'CRITICO', anoMensal: 2026, mensal: [{ mes: 'Ago', geracaoKwh: 90, prognosticoKwh: 100 }, { mes: 'Set', geracaoKwh: 80, prognosticoKwh: 100 }].map((m, i) => ({ ...m })) },
      { nome: 'B', fonte: 'solarz', potenciaKwp: 5.5, desempenhoMedio3mPct: 1.0, desempenho30dPct: 0.9, desempenho12mPct: 1.0, statusDesempenho: 'Dentro do esperado', statusMonitoramento: 'OK', anoMensal: 2026, mensal: [{ mes: 'Ago', geracaoKwh: 100, prognosticoKwh: 100 }, { mes: 'Set', geracaoKwh: 100, prognosticoKwh: 100 }] },
      { nome: 'C', fonte: 'relatorio', potenciaKwp: 4, desempenhoMedio3mPct: null, statusDesempenho: 'Sem dado', statusMonitoramento: null },
    ],
    avisoIntegracaoSolarZ: null,
    origemDados: { ticketsDisponiveis: true, ticketsAbertos: 2 },
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

// As séries mensais das usinas usam o índice do mês; ajusta para jan..set.
const comMeses = (f) => {
  for (const u of f.usinas.usinas) if (u.mensal) u.mensal = [...Array(7).fill({ mes: '-', geracaoKwh: null }), ...u.mensal]
  return f
}
const linha = (tab, id) => tab.grupos.flatMap((g) => g.linhas).find((l) => l.id === id)

test('vendas: compara o mês em curso com o mesmo trecho do mês anterior', () => {
  const r = c.calcularVendas(fontes(), OUT, HOJE)
  assert.equal(r.vendido, 10000)
  assert.equal(r.vendidoAnt, 100000)
  assert.equal(r.base, '01/09 a 29/09')
  assert.equal(r.propostas, 3)
  assert.equal(r.aceitas, 2)
  assert.equal(Math.round(r.taxaAceite), 67)
  // Leads: projetos de clientes criados no período; parcerias ficam fora.
  assert.equal(r.leads, 3)
  assert.equal(r.serie.length, 12)
  assert.equal(r.serie.at(-1).destaque, true)
  assert.equal(r.serie.at(-1).parcial, true)
})

test('visão geral: unidade, variação com sinal e sentido, situação e posição atual', () => {
  const tab = t.tabelaGeral(fontes(), OUT, HOJE)
  const v = linha(tab, 'vendido')
  assert.equal(v.unidade, 'R$')
  const sp = (x) => x.replace(/\s/g, ' ')
  assert.equal(sp(v.atual), 'R$ 10.000')
  assert.equal(sp(v.anterior), 'R$ 100.000')
  assert.deepEqual([v.variacao.seta, v.variacao.texto, v.variacao.tom], ['↓', '−90%', 'ruim'])
  assert.equal(v.situacao, 'atencao') // queda de 50% ou mais com base de 3 vendas
  const taxa = linha(tab, 'taxa')
  assert.match(taxa.variacao === null ? '' : taxa.variacao.texto, /^$|p\.p\.$/)
  const tarefas = linha(tab, 'tarefas')
  assert.equal(tarefas.posicaoAtual, true)
  assert.equal(tarefas.anterior, null)
  assert.equal(tarefas.atual, '1')
  assert.deepEqual(tab.grupos.map((g) => g.titulo), ['Projetos', 'Funil · posição de hoje', 'Propostas', 'Vendas', 'Tarefas · posição de hoje'])
  assert.equal(linha(tab, 'tarefas-abertas').atual, '2') // sem status = aberta
})

test('visão geral: projetos ativos, parados, carteira e funil por categoria', () => {
  const f = fontes()
  f.projetos.push({ id: 8, funil: '22. PERDAS', etapa: 'PERDIDO', vendedorResponsavel: 'Ana', dataInclusao: '2026-01-01' })
  f.projetos.find((p) => p.id === 4).diasSemAtualizacao = 45
  f.projetos.find((p) => p.id === 1).kwp = 7.5
  const g = c.calcularGeral(f, OUT, HOJE)
  // Ativos: 1 (08), 3 (04), 4 e 5 (07); fora: 6 (perdido), 7 (parceria) e 8 (perdas).
  assert.equal(g.ativos, 4)
  assert.equal(g.emMovimento, 4)
  assert.equal(g.parados, 1)
  assert.equal(g.kwpCarteira, 7.5)
  assert.equal(g.valorCarteira, 30000 + 8000 + 1050)
  assert.deepEqual(g.funis.map((x) => [x.n, x.qtd]), [[4, 1], [7, 2], [8, 1]])
  assert.deepEqual(g.categorias.map((x) => x.qtd).reduce((a, b) => a + b, 0), 4)
  assert.deepEqual(g.porVendedor, [{ nome: 'Ana', valor: 3 }, { nome: 'Bruno', valor: 1 }])
  assert.ok(c.alertasDaArea('geral', f, HOJE).some((a) => a.id === 'projetos-parados'))
})

test('vendas (aprofundamento): conversão, ciclo, mediana e ranking por vendedor', () => {
  const f = fontes()
  f.vendas.forEach((v, i) => { v.cicloVenda = 10 * (i + 1) })
  const r = c.calcularComercial(f, { ano: '2026', mes: '09', vendedor: '' }, HOJE)
  assert.equal(r.atual.vendas.length, 4)
  assert.equal(r.atual.ciclo, 25)
  assert.equal(r.atual.medianaVenda, 25000)
  assert.equal(r.atual.vendedores, 1)
  assert.equal(r.atual.concentracao, 100)
  assert.equal(r.vendedores[0].vendedor, 'Ana')
  assert.equal(r.vendedores[0].vendido, 100000)
  const out = c.calcularComercial(f, OUT, HOJE)
  assert.equal(out.conversao, 50) // 2 projetos com aceita: 1 vendido (funil 08), 1 sem venda
  const tab = t.tabelaVendas(f, OUT, HOJE)
  assert.deepEqual(tab.grupos.map((g) => g.titulo), ['Conversão', 'Ticket', 'Vendedores'])
  // Nada da tabela da Visão Geral se repete aqui.
  const ids = new Set(t.tabelaGeral(f, OUT, HOJE).grupos.flatMap((g) => g.linhas.map((l) => l.id)))
  assert.ok(tab.grupos.flatMap((g) => g.linhas).every((l) => !ids.has(l.id)))
})

test('variação: taxa em p.p., base zero sem variação, sentido neutro sem tom', () => {
  assert.deepEqual(t.variacao(70, 60, '%', 'maior-melhor'), { seta: '↑', texto: '+10 p.p.', tom: 'bom', sentido: 'maior-melhor' })
  assert.equal(t.variacao(5, 0, 'qtd.', 'maior-melhor'), null)
  assert.equal(t.variacao(0, 0, 'qtd.', 'maior-melhor').texto, '0%')
  assert.equal(t.variacao(120, 100, 'R$', 'neutro').tom, 'neutro')
  assert.equal(t.variacao(120, 100, 'qtd.', 'menor-melhor').tom, 'ruim')
})

test('financeiro: propostas aceitas por projeto, lucro sem passar da venda e funil de hoje', () => {
  const f = fontes()
  // Projeto 1 com duas aceitas: vale a alterada por último.
  f.propostas.push({ id: 4, vendedorNome: 'Ana', dataInclusao: '2026-10-05', dataAlteracao: '2026-10-20', aceita: true, projetoId: 1, preco: 35000 })
  const r = c.calcularFinanceiro(f, OUT, HOJE)
  assert.equal(r.aceitas.qtd, 2)
  assert.equal(r.aceitas.valor, 35000 + 20000)
  assert.equal(r.aceitas.vendidas, 35000) // projeto 1 está no funil 08 (depois do contrato)
  assert.equal(r.aceitas.semVenda, 20000)
  assert.equal(r.res.lucro, 10000) // lucro 12.000 limitado à venda de 10.000
  assert.equal(r.res.margem, 100)
  assert.equal(r.res.comissao, 300)
  assert.deepEqual(r.aguardandoPagamento, { qtd: 1, valor: 8000 })
  assert.deepEqual(r.pagamentoRealizado, { qtd: 1, valor: 1050 })
  // Etapa de perda fica fora da carteira; o valor cai na proposta aceita quando não há venda.
  assert.deepEqual(r.carteira.find((x) => x.n === 6), { n: 6, nome: 'Contrato', qtd: 0, valor: 0 })
  assert.deepEqual(r.carteira.find((x) => x.n === 8), { n: 8, nome: 'Engenharia projeto', qtd: 1, valor: 30000 })
  assert.equal(r.carteiraTotal.valor, 30000 + 8000 + 1050)
  // Vendedor recorta tudo.
  const b = c.calcularFinanceiro(f, { ...OUT, vendedor: 'Bruno' }, HOJE)
  assert.equal(b.aceitas.qtd, 0)
  assert.deepEqual(b.aguardandoPagamento, { qtd: 0, valor: 0 })
  assert.equal(b.pagamentoRealizado.qtd, 1)
  const tab = t.tabelaFinanceiro(f, OUT, HOJE)
  assert.equal(linha(tab, 'carteira-total').posicaoAtual, true)
  assert.equal(linha(tab, 'carteira-7'), undefined) // o funil 07 aparece pelas etapas, não repetido na carteira
})

test('usinas: parque, mês de referência contra o anterior, faixas de desempenho e farol', () => {
  const r = c.calcularUsinas(comMeses(fontes()), HOJE)
  assert.deepEqual([r.total, r.premium, r.naoPremium, r.kwp], [3, 2, 1, 19.5])
  assert.equal(r.ultimo.nome, 'set/26')
  assert.equal(r.ultimo.geracao, 180)
  assert.equal(r.penultimo.geracao, 190)
  assert.equal(Math.round(r.d3.valor), 70)
  assert.deepEqual([r.criticas, r.dentro, r.semDado, r.farolCritico, r.tickets], [1, 1, 1, 1, 2])
  const tab = t.tabelaUsinas(comMeses(fontes()), HOJE)
  const mes = linha(tab, 'desempenho-mes')
  assert.equal(mes.atual, '90%')
  assert.equal(mes.base, 'ago/26')
  assert.equal(mes.variacao.texto, '−5 p.p.')
  assert.equal(mes.situacao, 'ok')
  assert.equal(linha(tab, 'd3').situacao, 'atencao') // 70% cai em Atenção
  assert.equal(linha(tab, 'st-criticas').situacao, 'atencao')
  assert.equal(t.situacaoDesempenho(50), 'critico')
  assert.equal(t.situacaoDesempenho(71), 'ok')
})

test('homologação lê o prazo dd/mm/aaaa da PIETA e conta pendências pelo status', () => {
  const r = c.calcularHomologacao(fontes(), HOJE)
  assert.equal(r.ativos.length, 3)
  assert.equal(r.vencidos.length, 1)
  assert.equal(r.pendencia.length, 1)
  assert.equal(r.finMes, 1)
  assert.equal(r.etapas[0].etapa, 'Em Vistoria')
  const tab = t.tabelaHomologacao(fontes(), HOJE)
  assert.equal(linha(tab, 'vencidos').situacao, 'atencao')
  assert.equal(linha(tab, 'finalizados').base, '01/09 a 29/09')
})

test('alertas: no máximo 3 por área, só da própria área, do mais grave ao menos grave', () => {
  const vendas = c.alertasDaArea('geral', fontes(), HOJE)
  assert.deepEqual(vendas.map((a) => a.id), ['vendas-queda', 'tarefas'])
  assert.deepEqual(c.alertasDaArea('vendas', fontes(), HOJE).map((a) => a.id), ['vendas-queda'])
  assert.equal(vendas[0].gravidade, 2)
  const usinas = c.alertasDaArea('usinas', fontes(), HOJE)
  assert.deepEqual(usinas.map((a) => a.id).sort(), ['usinas-criticas', 'usinas-farol'])
  assert.deepEqual(c.alertasDaArea('homologacao', fontes(), HOJE).map((a) => a.id), ['homologacao-vencidos', 'homologacao-pendencia'])
  assert.deepEqual(c.alertasDaArea('financeiro', fontes(), HOJE), [])
  for (const area of ['geral', 'vendas', 'usinas', 'homologacao']) assert.ok(c.alertasDaArea(area, fontes(), HOJE).length <= c.MAX_ALERTAS)
  // Sem nada a agir, nada aparece.
  const vazio = { ...fontes(), vendas: [], tarefas: [], usinas: { usinas: [] }, pietaResumo: { projects: [] } }
  for (const area of ['geral', 'vendas', 'usinas', 'homologacao']) assert.deepEqual(c.alertasDaArea(area, vazio, HOJE), [])
})

test('nomes das áreas e fontes são fixos', () => {
  assert.deepEqual(Object.values(c.AREAS).map((a) => `${a.nome} · ${a.fonte}`), ['Visão Geral · Groner CRM', 'Vendas · Groner CRM', 'Financeiro · Groner CRM', 'Usinas · SolarZ', 'Homologação · PIETA'])
})
