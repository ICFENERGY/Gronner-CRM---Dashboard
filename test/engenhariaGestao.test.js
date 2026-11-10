import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import express from 'express'
import { diagnosticarCard, juntarAcoes, montarGestao, resumoGestao, validarAcao, chaveAcao } from '../server/engenhariaGestao.js'
import { createIndicadoresRouter } from '../server/indicadoresRoutes.js'

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
