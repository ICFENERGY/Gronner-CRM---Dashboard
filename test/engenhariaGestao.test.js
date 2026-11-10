import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import express from 'express'
import { diagnosticarCard, juntarAcoes, montarGestao, resumoGestao, validarAcao, chaveAcao } from '../server/engenhariaGestao.js'
import { createIndicadoresRouter } from '../server/indicadoresRoutes.js'
import { registrarNoGroner, textoComentario, tituloDaTarefa } from '../server/gronerAcoes.js'

const card = (extra = {}) => ({
  codigo: 100, funil: '10. HOMOLOGAÇÃO', etapa: 'PIETA_CRIACAO DO PROJETO', nome: 'Cliente Teste', cidade: 'Londrina', uf: 'PR', valor: 20000, diasFluxo: 9, ...extra,
})
const PRAZO_5 = { '10|PIETA_CRIACAO DO PROJETO': 5 }

test('ação ICF acima do prazo é atraso, com problema e plano', () => {
  const d = diagnosticarCard(card({ diasFluxo: 9 }), { prazos: PRAZO_5 })
  assert.equal(d.status, 'late')
  assert.equal(d.prazo, 5)
  assert.match(d.problema, /passou 4 dia\(s\) do SLA/)
  assert.match(d.planoSugerido, /protocolar/)
  assert.equal(d.papel, 'Homologador')
})

test('últimos 30% do prazo é risco; dentro do prazo é ok', () => {
  const opcoes = { prazos: { '10|PIETA_CRIACAO DO PROJETO': 10 } }
  assert.equal(diagnosticarCard(card({ diasFluxo: 8 }), opcoes).status, 'risk')
  assert.equal(diagnosticarCard(card({ diasFluxo: 2 }), opcoes).status, 'ok')
})

test('espera externa vencida pede cobrança (não é atraso da Engenharia); repouso vai para limpeza', () => {
  const espera = diagnosticarCard(card({ etapa: 'PIETA_PARECER SOLICITADO', diasFluxo: 40 }), { prazos: {} })
  assert.equal(espera.status, 'cobrar')
  assert.match(espera.problema, /Concessionária/)
  const repouso = diagnosticarCard(card({ etapa: 'RELOGIO TROCADO', diasFluxo: 3 }), {})
  assert.equal(repouso.status, 'repouso')
  assert.equal(repouso.prazo, null)
})

test('funil 18 (Parceria Técnica) entra; funil fora da engenharia não', () => {
  const d = diagnosticarCard(card({ funil: '18. PARCERIA TÉCNICA', etapa: 'DOCUMENTOS NECESSÁRIOS', diasFluxo: 20 }), {})
  assert.equal(d.status, 'cobrar')
  assert.equal(d.funilNome, 'Parceria Técnica')
  assert.equal(diagnosticarCard(card({ funil: '04. FUNIL DE VENDAS' }), {}), null)
})

test('etapa sem regra usa prazo provisório e avisa; mais de 30 dias leva à decisão de sexta', () => {
  const d = diagnosticarCard(card({ etapa: 'ETAPA NOVA', diasFluxo: 45 }), { prazos: {} })
  assert.equal(d.status, 'late')
  assert.match(d.problema, /sem regra/)
  assert.match(d.planoSugerido, /30 dias/)
})

test('lista ordenada: atrasado antes de em risco; resumo conta por situação', () => {
  const itens = montarGestao([card({ codigo: 1, diasFluxo: 1 }), card({ codigo: 2, diasFluxo: 9 }), card({ codigo: 3, diasFluxo: 5 })], { prazos: PRAZO_5 })
  assert.equal(itens[0].codigo, 2)
  const r = resumoGestao(itens)
  assert.equal(r.atrasados, 1)
  assert.equal(r.valorAtrasado, 20000)
})

test('validarAcao exige ação, responsável e prazo; card precisa existir', () => {
  const ok = { acao: 'Cobrar a concessionária', responsavel: 'Maria', prazo: '2026-11-12' }
  assert.deepEqual(validarAcao({ codigo: '100', funil: '10' }, ok, {}), ok)
  assert.throws(() => validarAcao({ codigo: '100', funil: '10' }, { ...ok, responsavel: '' }, {}), /responsável/)
  assert.throws(() => validarAcao({ codigo: '100', funil: '10' }, { ...ok, prazo: '12/11' }, {}), /Prazo/)
  assert.throws(() => validarAcao({ codigo: '100', funil: '10' }, ok, undefined), /não encontrado/)
  assert.throws(() => validarAcao({ codigo: '100', funil: '04' }, ok, {}), /inválido/)
})

test('ação fica aberta enquanto o card está na mesma etapa e é resolvida quando ele muda', () => {
  const itens = montarGestao([card()], { prazos: {} })
  const linhas = [
    { chave: chaveAcao(100, '10'), dados: { etapa: 'PIETA_CRIACAO DO PROJETO', concluida: false } },
    { chave: chaveAcao(101, '10'), dados: { etapa: 'PARECER EMITIDO', concluida: false } },
    { chave: chaveAcao(102, '10'), dados: { etapa: 'X', concluida: true } },
  ]
  const { abertas, resolver } = juntarAcoes(itens, linhas, { agora: new Date('2026-11-10T12:00:00Z') })
  assert.deepEqual(Object.keys(abertas), [chaveAcao(100, '10')])
  assert.equal(resolver.length, 1)
  assert.equal(resolver[0].chave, chaveAcao(101, '10'))
  assert.equal(resolver[0].dados.motivo, 'card mudou de etapa')
})

function pgAcoes() {
  const linhas = new Map()
  return {
    linhas,
    async todas(tipo, entidade) { assert.equal(tipo, 'config'); assert.equal(entidade, 'engenharia'); return [...linhas].map(([chave, dados]) => ({ chave, dados })) },
    async upsert(itens) { for (const i of itens) linhas.set(i.chave, i.dados) },
  }
}

test('rotas: gestão devolve o diagnóstico, grava a ação, mantém e conclui', async () => {
  const pg = pgAcoes()
  const projeto = { id: 100, nome: 'Cliente Teste', funil: '10. HOMOLOGAÇÃO', etapa: 'PIETA_CRIACAO DO PROJETO', dataEntradaStatus: '2026-10-20T10:00:00-03:00', dataInclusao: '2026-10-01T10:00:00-03:00', cidade: 'Londrina', estado: 'PR', valorVenda: 1000 }
  const app = express()
  app.use(express.json())
  app.use('/api/indicadores', createIndicadoresRouter({
    carregar: async (e) => (e === 'projetos' ? { items: [projeto], sync: { finishedAt: '2026-11-02T10:00:00Z' } } : null),
    pg: () => pg, prazos: PRAZO_5, agora: () => Date.parse('2026-11-02T20:00:00-03:00'),
  }))
  const srv = http.createServer(app)
  await new Promise((r) => srv.listen(0, r))
  const base = `http://127.0.0.1:${srv.address().port}/api/indicadores/engenharia`
  const anterior = process.env.METAS_TOKEN
  try {
    delete process.env.METAS_TOKEN
    let g = await (await fetch(`${base}/gestao`)).json()
    assert.equal(g.itens.length, 1)
    assert.equal(g.itens[0].status, 'late')
    assert.equal(g.itens[0].acao, null)
    assert.equal(g.resumo.atrasados, 1)

    const corpo = { acao: 'Cobrar o parecer', responsavel: 'Maria', prazo: '2026-11-05' }
    const enviar = (url, c) => fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(c) })
    assert.equal((await enviar(`${base}/acoes/100/10`, { ...corpo, responsavel: '' })).status, 400)
    assert.equal((await enviar(`${base}/acoes/100/10`, corpo)).status, 200)
    g = await (await fetch(`${base}/gestao`)).json()
    assert.equal(g.itens[0].acao.responsavel, 'Maria')
    assert.equal(g.itens[0].acao.etapa, 'PIETA_CRIACAO DO PROJETO')
    assert.equal((await enviar(`${base}/acoes/999/10`, corpo)).status, 400)

    process.env.METAS_TOKEN = 'segredo'
    assert.equal((await enviar(`${base}/acoes/100/10`, corpo)).status, 401)
    delete process.env.METAS_TOKEN

    assert.equal((await fetch(`${base}/acoes/100/10/concluir`, { method: 'POST' })).status, 200)
    g = await (await fetch(`${base}/gestao`)).json()
    assert.equal(g.itens[0].acao, null)
    assert.equal((await fetch(`${base}/acoes/100/10/concluir`, { method: 'POST' })).status, 404)
  } finally {
    if (anterior === undefined) delete process.env.METAS_TOKEN
    else process.env.METAS_TOKEN = anterior
    await new Promise((r) => srv.close(r))
  }
})

// ─── Gravação no card do Groner (sempre com Groner falso nos testes) ────────────────────────────────────────────

const itemCard = { codigo: 100, funil: '10', etapa: 'PIETA_CRIACAO DO PROJETO', problema: '9 dias na etapa, prazo 5.' }

function gronerFalso({ tarefas = [], falhaCriar = false, falhaComentar = false } = {}) {
  const chamadas = { criadas: [], comentarios: [] }
  return {
    chamadas,
    deps: {
      criarTarefa: async (corpo) => { chamadas.criadas.push(corpo); if (falhaCriar) throw new Error('Tempo esgotado'); return { id: 555 } },
      comentar: async (id, texto) => { if (falhaComentar) throw new Error('Erro 500'); chamadas.comentarios.push({ id, texto }) },
      tarefasDoCard: async () => tarefas,
      usuarios: async () => [{ id: 29, nome: 'Eliardo Lemos' }, { id: 67, nome: 'João Martins' }],
    },
  }
}

test('comentário traz o que foi combinado, o @ do responsável e o prazo para finalizar', () => {
  const t = textoComentario({ item: itemCard, acao: 'Cobrar o parecer', responsavel: 'Eliardo Lemos', prazo: '2026-11-13' })
  assert.match(t, /Combinado na reunião/)
  assert.match(t, /O que foi combinado: Cobrar o parecer/)
  assert.match(t, /Responsável: @Eliardo Lemos/)
  assert.ok(t.includes('Prazo para finalizar: 13/11/2026'))
  assert.match(textoComentario({ item: itemCard, acao: 'x', responsavel: 'Y', prazo: '2026-11-13', tipo: 'feito' }), /marcada como feita/)
})

test('ação nova cria a tarefa no card (prazo e responsável) e comenta', async () => {
  const g = gronerFalso()
  const r = await registrarNoGroner({ deps: g.deps, item: itemCard, acao: 'Cobrar o parecer', responsavel: 'Eliardo Lemos', responsavelId: 29, prazo: '2026-11-13' })
  assert.equal(r.tarefaId, 555)
  assert.ok(r.gronerEm)
  assert.equal(r.gronerErro, null)
  assert.equal(g.chamadas.criadas[0].ProjetoId, 100)
  assert.equal(g.chamadas.criadas[0].DataEntrega, '2026-11-13T18:00:00')
  assert.deepEqual(g.chamadas.criadas[0].UsuariosIds, [29])
  assert.ok(g.chamadas.criadas[0].TipoId > 0)
  assert.equal(g.chamadas.comentarios.length, 1)
})

test('ação já gravada só ganha novo comentário (não cria outra tarefa)', async () => {
  const g = gronerFalso()
  const r = await registrarNoGroner({ deps: g.deps, item: itemCard, acao: 'Novo plano', responsavel: 'João Martins', prazo: '2026-11-20', tarefaId: 555 })
  assert.equal(g.chamadas.criadas.length, 0)
  assert.equal(r.tarefaId, 555)
  assert.match(g.chamadas.comentarios[0].texto, /atualizado/)
})

test('se a tarefa já existe no card (tentativa anterior), reaproveita em vez de duplicar', async () => {
  const g = gronerFalso({ tarefas: [{ id: 321, titulo: tituloDaTarefa(itemCard), dataConclusao: null }] })
  const r = await registrarNoGroner({ deps: g.deps, item: itemCard, acao: 'x', responsavel: 'Y', prazo: '2026-11-13' })
  assert.equal(g.chamadas.criadas.length, 0)
  assert.equal(r.tarefaId, 321)
})

test('falha no Groner não perde a ação: devolve o erro para o painel mostrar', async () => {
  const falhaCriar = await registrarNoGroner({ deps: gronerFalso({ falhaCriar: true }).deps, item: itemCard, acao: 'x', responsavel: 'Y', prazo: '2026-11-13' })
  assert.equal(falhaCriar.tarefaId, null)
  assert.match(falhaCriar.gronerErro, /Tempo esgotado/)
  const falhaComentar = await registrarNoGroner({ deps: gronerFalso({ falhaComentar: true }).deps, item: itemCard, acao: 'x', responsavel: 'Y', prazo: '2026-11-13' })
  assert.equal(falhaComentar.tarefaId, 555) // a tarefa foi criada: o próximo salvar só comenta
  assert.match(falhaComentar.gronerErro, /Erro 500/)
})

test('rotas: salvar a ação grava no Groner, guarda a tarefa e lista as pessoas para o @', async () => {
  const pg = pgAcoes()
  const g = gronerFalso()
  const projeto = { id: 100, nome: 'Cliente Teste', funil: '10. HOMOLOGAÇÃO', etapa: 'PIETA_CRIACAO DO PROJETO', dataEntradaStatus: '2026-10-20T10:00:00-03:00', dataInclusao: '2026-10-01T10:00:00-03:00', valorVenda: 1000 }
  const app = express()
  app.use(express.json())
  app.use('/api/indicadores', createIndicadoresRouter({
    carregar: async (e) => (e === 'projetos' ? { items: [projeto], sync: { finishedAt: '2026-11-02T10:00:00Z' } } : null),
    pg: () => pg, prazos: PRAZO_5, agora: () => Date.parse('2026-11-02T20:00:00-03:00'), gronerAcoes: async () => g.deps,
  }))
  const srv = http.createServer(app)
  await new Promise((r) => srv.listen(0, r))
  const base = `http://127.0.0.1:${srv.address().port}/api/indicadores/engenharia`
  const anterior = process.env.METAS_TOKEN
  try {
    delete process.env.METAS_TOKEN
    assert.deepEqual((await (await fetch(`${base}/usuarios`)).json()).map((u) => u.nome), ['Eliardo Lemos', 'João Martins'])
    const corpo = { acao: 'Cobrar o parecer', responsavel: 'Eliardo Lemos', responsavelId: 29, prazo: '2026-11-05' }
    const put = (c) => fetch(`${base}/acoes/100/10`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(c) })
    let r = await (await put(corpo)).json()
    assert.equal(r.dados.tarefaId, 555)
    assert.ok(r.dados.gronerEm)
    assert.equal(g.chamadas.criadas.length, 1)
    r = await (await put({ ...corpo, acao: 'Plano novo' })).json()
    assert.equal(g.chamadas.criadas.length, 1) // não duplicou a tarefa
    assert.equal(g.chamadas.comentarios.length, 2)
    const gestao = await (await fetch(`${base}/gestao`)).json()
    assert.equal(gestao.itens[0].acao.tarefaId, 555)
    assert.equal((await fetch(`${base}/acoes/100/10/concluir`, { method: 'POST' })).status, 200)
    assert.match(g.chamadas.comentarios.at(-1).texto, /marcada como feita/)
  } finally {
    if (anterior === undefined) delete process.env.METAS_TOKEN
    else process.env.METAS_TOKEN = anterior
    await new Promise((r) => srv.close(r))
  }
})
