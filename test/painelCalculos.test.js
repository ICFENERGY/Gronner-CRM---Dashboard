import test from 'node:test'
import assert from 'node:assert/strict'
import { tsImport } from 'tsx/esm/api'
import { mapProjeto, normalizarProjetoLido } from '../server/mappers.js'

// calculos.ts é TypeScript do front: carregado pelo tsx (já é dependência de desenvolvimento).
const { calcularPainel, filtrosValidos, opcoesFiltros, projetoVendido } = await tsImport('../src/features/painel/calculos.ts', import.meta.url)
const { intervalo, textoPeriodo } = await tsImport('../src/features/painel/periodo.ts', import.meta.url)

const PADRAO = { ano: '12m', mes: '', vendedor: '', uf: '' }
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
  engenharia: { cards: [{ id: 2, marco: '6', momento: 'imp', cor: 'ok', vendedor: usuario('Bruno Lima'), estado: 'SC' }], prazos: { metaEntrega: 60 } },
})

test('painel com vendedor filtrado não quebra quando o vendedor do projeto vem como objeto', () => {
  // Antes: TypeError "(a ?? '').trim is not a function" e tela branca.
  for (const [ano, mes] of [['12m', ''], ['tudo', ''], ['2026', ''], ['2026', '09'], ['2025', '02']]) {
    for (const vendedor of ['Ana Souza', 'Bruno Lima', 'Sem Vendas']) {
      for (const uf of ['', 'SC', 'PR']) {
        assert.doesNotThrow(() => calcularPainel(fontes(), { ano, mes, vendedor, uf }), `${ano} / ${mes} / ${vendedor} / ${uf}`)
      }
    }
  }
})

test('vendedor que só existe em projetos (como objeto) é filtrado pelo nome', () => {
  const p = calcularPainel(fontes(), { ano: 'tudo', mes: '', vendedor: 'Bruno Lima', uf: '' })
  assert.equal(p.kpis.qtdVendas, 0)
  assert.equal(p.kpis.vendido, 0)
  assert.equal(p.cards.length, 1)
  assert.equal(p.series.funil.reduce((a, f) => a + f.valor, 0), 1)
  assert.equal(p.series.engMomento.find((m) => m.nome === 'Implantação').valor, 1)
  assert.ok(p.series.vendasTempo.every((b) => b.valor === 0))
})

test('opções de filtro ignoram valores que não são texto', () => {
  assert.deepEqual(opcoesFiltros(fontes()).ufs, ['SC'])
})

test('filtros salvos inválidos voltam ao padrão', () => {
  assert.deepEqual(filtrosValidos({ periodo: 'xyz', vendedor: { nome: 'A' }, uf: 3 }, PADRAO), PADRAO)
  assert.deepEqual(filtrosValidos({ ano: 'abc', mes: '13' }, PADRAO), PADRAO)
  assert.deepEqual(filtrosValidos(null, PADRAO), PADRAO)
  assert.deepEqual(filtrosValidos([1], PADRAO), PADRAO)
  assert.deepEqual(filtrosValidos({ ano: '2025', mes: '03', vendedor: 'Ana', uf: 'SC', extra: 1 }, PADRAO), { ano: '2025', mes: '03', vendedor: 'Ana', uf: 'SC' })
  // mês sem ano específico é descartado
  assert.deepEqual(filtrosValidos({ ano: 'tudo', mes: '03' }, PADRAO), { ...PADRAO, ano: 'tudo', mes: '' })
})

test('filtros antigos (periodo) são migrados ou ignorados', () => {
  const hoje = '2026-10-17'
  assert.deepEqual(filtrosValidos({ periodo: 'tudo', vendedor: 'Ana' }, PADRAO, hoje), { ano: 'tudo', mes: '', vendedor: 'Ana', uf: '' })
  assert.deepEqual(filtrosValidos({ periodo: 'ano' }, PADRAO, hoje), { ...PADRAO, ano: '2026' })
  assert.deepEqual(filtrosValidos({ periodo: 'mes' }, PADRAO, hoje), { ...PADRAO, ano: '2026', mes: '10' })
  assert.deepEqual(filtrosValidos({ periodo: '12m' }, PADRAO, hoje), PADRAO)
  assert.deepEqual(filtrosValidos({ periodo: '30d', uf: 'SC' }, PADRAO, hoje), { ...PADRAO, uf: 'SC' })
  assert.deepEqual(filtrosValidos({ periodo: '3m' }, PADRAO, hoje), PADRAO)
})

test('filtro Ano e Mês: intervalo e período anterior', () => {
  const hoje = '2026-10-17'
  // mês fechado: mês anterior inteiro
  assert.deepEqual(intervalo('2026', '03', hoje), { inicio: '2026-03-01', fim: '2026-03-31', anterior: { inicio: '2026-02-01', fim: '2026-02-28' }, porDia: true })
  // mês em curso termina hoje; anterior tem o mesmo número de dias
  assert.deepEqual(intervalo('2026', '10', hoje), { inicio: '2026-10-01', fim: '2026-10-17', anterior: { inicio: '2026-09-01', fim: '2026-09-17' }, porDia: true })
  // ano fechado: ano anterior inteiro; série por mês
  assert.deepEqual(intervalo('2025', '', hoje), { inicio: '2025-01-01', fim: '2025-12-31', anterior: { inicio: '2024-01-01', fim: '2024-12-31' }, porDia: false })
  // ano em curso: até hoje contra o mesmo trecho do ano anterior
  assert.deepEqual(intervalo('2026', '', hoje), { inicio: '2026-01-01', fim: '2026-10-17', anterior: { inicio: '2025-01-01', fim: '2025-10-17' }, porDia: false })
  // 12 meses: período anterior com o mesmo número de dias, terminando na véspera do início
  assert.deepEqual(intervalo('12m', '', hoje), { inicio: '2025-11-01', fim: hoje, anterior: { inicio: '2024-11-15', fim: '2025-10-31' }, porDia: false })
  // todos os anos: sem variação; mês sem ano específico é ignorado
  assert.deepEqual(intervalo('tudo', '05', hoje), { inicio: null, fim: hoje, anterior: null, porDia: false })
  assert.equal(textoPeriodo('2026', '03'), '2026 · março')
  assert.equal(textoPeriodo('2026', ''), '2026')
  assert.equal(textoPeriodo('12m'), 'últimos 12 meses')
})

test('Ano/Mês recorta vendas, compara com o anterior e agrupa por dia só com mês', () => {
  const f = fontes()
  f.vendas = [
    { id: 1, vendedor: 'Ana', estado: 'SC', dataVenda: '2026-03-10T10:00:00-03:00', valorTotal: 1000 },
    { id: 2, vendedor: 'Ana', estado: 'SC', dataVenda: '2026-03-20T10:00:00-03:00', valorTotal: 500 },
    { id: 3, vendedor: 'Ana', estado: 'SC', dataVenda: '2026-02-10T10:00:00-03:00', valorTotal: 750 },
    { id: 4, vendedor: 'Ana', estado: 'SC', dataVenda: '2025-03-05T10:00:00-03:00', valorTotal: 300 },
  ]
  const mar = calcularPainel(f, { ano: '2026', mes: '03', vendedor: '', uf: '' })
  assert.equal(mar.kpis.vendido, 1500)
  assert.equal(mar.kpis.vendidoVar, 100) // contra fevereiro (750)
  assert.equal(mar.series.vendasTempo.length, 31)
  const a2026 = calcularPainel(f, { ano: '2026', mes: '', vendedor: '', uf: '' })
  assert.equal(a2026.kpis.vendido, 2250)
  assert.equal(a2026.kpis.vendidoVar, 650) // contra o mesmo trecho de 2025 (300)
  assert.equal(a2026.series.vendasTempo[0].nome, 'jan/26')
  assert.equal(calcularPainel(f, { ano: 'tudo', mes: '', vendedor: '', uf: '' }).kpis.vendidoVar, null)
  const anos = opcoesFiltros(f).anos
  assert.ok(anos.indexOf('2026') < anos.indexOf('2025') && anos.includes('2025'))
})

test('composição financeira não tem negativos e fecha com o valor vendido', () => {
  const f = fontes()
  f.vendas = [
    { id: 1, vendedor: 'Ana', estado: 'SC', dataVenda: '2026-03-10', valorTotal: 1000, lucro: 200, valorComissao: 50 },
    { id: 2, vendedor: 'Ana', estado: 'SC', dataVenda: '2026-03-11', valorTotal: 400, lucro: -80, valorComissao: null },
    { id: 3, vendedor: 'Ana', estado: 'SC', dataVenda: '2026-03-12', valorTotal: 100, lucro: 90, valorComissao: 40 },
    { id: 4, vendedor: 'Ana', estado: 'SC', dataVenda: '2026-03-13', valorTotal: -50, lucro: 10, valorComissao: 5 },
  ]
  const { series } = calcularPainel(f, { ano: '2026', mes: '03', vendedor: '', uf: '' })
  const [lucro, comissao, outros] = series.finComposicao.map((x) => x.valor)
  assert.equal(lucro, 200 + 0 + 90)
  assert.equal(comissao, 50 + 0 + 10) // venda 3: comissão limitada ao que sobra (100 - 90)
  assert.equal(outros, 750 + 400 + 0)
  assert.ok(series.finComposicao.every((x) => x.valor >= 0))
  assert.equal(lucro + comissao + outros, 1000 + 400 + 100) // venda de valor negativo fica de fora
})

test('propostas aceitas: vendidas x ainda não vendidas, cruzando o projeto', () => {
  const f = fontes()
  f.propostas = [
    { id: 1, projetoId: 10, aceita: true, preco: 1000, vendedorNome: 'Ana', dataInclusao: '2026-03-02' },
    { id: 2, projetoId: 11, aceita: true, preco: 2000, vendedorNome: 'Ana', dataInclusao: '2026-03-03' },
    { id: 3, projetoId: 12, aceita: true, preco: 4000, vendedorNome: 'Ana', dataInclusao: '2026-03-04' },
    { id: 4, projetoId: 99, aceita: true, preco: 8000, vendedorNome: 'Ana', dataInclusao: '2026-03-05' },
    { id: 5, projetoId: 10, aceita: false, preco: 16000, vendedorNome: 'Ana', dataInclusao: '2026-03-06' },
    { id: 6, projetoId: 10, aceita: true, preco: 32000, vendedorNome: 'Ana', dataInclusao: '2025-03-06' },
  ]
  f.projetos = [
    { id: 10, funil: '04. FUNIL DE VENDAS SOLAR', etapa: 'GANHO', valorVenda: 900 },
    { id: 11, funil: '08. ENGENHARIA PROJETO', etapa: 'PROJETO', valorVenda: null },
    { id: 12, funil: '04. FUNIL DE VENDAS SOLAR', etapa: 'NEGOCIAÇÃO', valorVenda: 0 },
  ]
  const p = calcularPainel(f, { ano: '2026', mes: '03', vendedor: '', uf: '' })
  const [vendidas, nao] = p.series.finPropostas
  assert.equal(vendidas.valor, 1000 + 2000) // valorVenda > 0, e funil 08 (depois do contrato)
  assert.equal(nao.valor, 4000 + 8000) // sem venda, ou projeto que não existe
  assert.deepEqual(p.series.propostasAceitacao.map((x) => x.valor), [4, 1]) // 5 propostas no mês, 4 aceitas
  assert.equal(projetoVendido(undefined), false)
  // funil financeiro por etapa
  f.projetos.push({ id: 13, funil: '07. FINANCEIRO', etapa: 'PAGAMENTO REALIZADO' }, { id: 14, funil: '07. FINANCEIRO', etapa: 'PAGAMENTO REALIZADO' })
  const fin = calcularPainel(f, { ano: '2026', mes: '03', vendedor: '', uf: '' }).series.finFunil
  assert.deepEqual(fin, [{ nome: 'PAGAMENTO REALIZADO', valor: 2, extra: 0 }])
})

test('servidor entrega só o nome do vendedor do projeto (sem dados pessoais do usuário)', () => {
  assert.equal(mapProjeto({ id: 1, vendedorResponsavel: usuario('Bruno Lima') }, {}).vendedorResponsavel, 'Bruno Lima')
  assert.equal(mapProjeto({ id: 1, vendedorResponsavel: 'Ana Souza' }, {}).vendedorResponsavel, 'Ana Souza')
  assert.equal(normalizarProjetoLido({ id: 1, vendedorResponsavel: usuario('Bruno Lima') }).vendedorResponsavel, 'Bruno Lima')
  const intacto = { id: 2, vendedorResponsavel: 'Ana' }
  assert.equal(normalizarProjetoLido(intacto), intacto)
})

test('12 meses: período anterior tem o mesmo número de dias do atual', () => {
  const dias = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
  for (const hoje of ['2026-10-17', '2026-03-31', '2028-02-29']) {
    const iv = intervalo('12m', '', hoje)
    assert.equal(dias(iv.anterior.inicio, iv.anterior.fim), dias(iv.inicio, iv.fim), hoje)
    assert.equal(dias(iv.anterior.fim, iv.inicio), 1, hoje)
  }
})

test('ano específico: período anterior pelo mesmo MM-DD (29/02 vira 28/02)', () => {
  assert.deepEqual(intervalo('2024', '', '2024-03-01').anterior, { inicio: '2023-01-01', fim: '2023-03-01' })
  assert.deepEqual(intervalo('2024', '', '2024-02-29').anterior, { inicio: '2023-01-01', fim: '2023-02-28' })
  assert.deepEqual(intervalo('2026', '', '2026-10-17').anterior, { inicio: '2025-01-01', fim: '2025-10-17' })
})

test('mês ou ano futuro: sem comparação com período anterior', () => {
  const hoje = '2026-10-17'
  assert.equal(intervalo('2026', '12', hoje).anterior, null)
  assert.equal(intervalo('2026', '11', hoje).anterior, null)
  assert.equal(intervalo('2027', '', hoje).anterior, null)
  assert.notEqual(intervalo('2026', '10', hoje).anterior, null)
  const p = calcularPainel(fontes(), { ano: '2026', mes: '12', vendedor: '', uf: '' })
  assert.ok(p)
})

test('projeto com duas propostas aceitas conta uma vez, pela alterada por último', () => {
  const f = fontes()
  f.propostas = [
    { id: 1, projetoId: 10, aceita: true, preco: 1000, vendedorNome: 'Ana', dataInclusao: '2026-03-02', dataAlteracao: '2026-03-10' },
    { id: 2, projetoId: 10, aceita: true, preco: 5000, vendedorNome: 'Ana', dataInclusao: '2026-03-03', dataAlteracao: '2026-03-20' },
  ]
  f.projetos = [{ id: 10, funil: '04. FUNIL DE VENDAS SOLAR', etapa: 'GANHO', valorVenda: 900 }]
  const p = calcularPainel(f, { ano: '2026', mes: '03', vendedor: '', uf: '' })
  const [vendidas, nao] = p.series.finPropostas
  assert.equal(vendidas.extra, 1)
  assert.equal(vendidas.valor, 5000)
  assert.equal(nao.extra, 0)
  assert.deepEqual(p.propostasVendidas.map((x) => x.id), [2])
})
