import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { classificarCard, completarComPropostas, entradaNoMarco, montarEngenharia, prazosEfetivos } from '../server/engenharia.js'
import { createEngenhariaRouter } from '../server/engenhariaRoutes.js'
import { validarAcao, validarPrazos } from '../server/engenhariaStore.js'
import { mapProjeto } from '../server/mappers.js'

const AGORA = new Date('2026-10-05T15:00:00-03:00')
const HOJE = '2026-10-05'
const prazos = prazosEfetivos(null)

const projeto = (extra) => ({
  id: 1, marco: '6', etapa: 'PENDENCIA ICF', funil: '09. HOMOLOGAÇÃO', noFluxoEngenharia: true,
  dataUltimoStatus: '2026-10-01T10:00:00-03:00', dataUltimaAtualizacao: '2026-10-04T10:00:00-03:00', ...extra,
})

test('marco no prazo, em risco e atrasado pelo tempo no marco', () => {
  // Marco 6 tem prazo 10; margem de risco = 3 dias.
  assert.equal(classificarCard(projeto({ dataUltimoStatus: '2026-10-01T10:00:00-03:00' }), { prazos, hoje: HOJE }).cor, 'ok')
  assert.equal(classificarCard(projeto({ dataUltimoStatus: '2026-09-27T10:00:00-03:00' }), { prazos, hoje: HOJE }).cor, 'risco')
  const atrasado = classificarCard(projeto({ dataUltimoStatus: '2026-09-20T10:00:00-03:00' }), { prazos, hoje: HOJE })
  assert.equal(atrasado.cor, 'atrasado')
  assert.match(atrasado.motivos[0], /15 dias no marco, prazo 10/)
  assert.equal(atrasado.estimado, true)
})

test('entrega: passa da meta desde a venda e projeção acima da meta', () => {
  const vencida = classificarCard(projeto({ dataVenda: '2026-07-01T10:00:00' }), { prazos, hoje: HOJE })
  assert.equal(vencida.cor, 'atrasado')
  assert.ok(vencida.motivos.some((m) => /meta 60/.test(m)))
  // Venda há 40 dias no marco 6: faltam 6 do marco + 9,10,11,12 (5+7+7+7) = 66 > 60.
  const projetada = classificarCard(projeto({ dataVenda: '2026-08-26T10:00:00' }), { prazos, hoje: HOJE })
  assert.equal(projetada.cor, 'risco')
  assert.equal(projetada.projecao, 40 + 6 + 26)
})

test('ação combinada vencida vira atrasado e vai para o topo da pauta', () => {
  const r = montarEngenharia({
    projetos: [projeto({ id: 1 }), projeto({ id: 2, dataUltimoStatus: '2026-09-01T10:00:00-03:00' })],
    acoes: { 1: { acao: 'Cobrar', dono: 'João', prazo: '2026-10-03', feita: false, em: '2026-10-02T12:00:00Z' } },
    agora: AGORA,
  })
  assert.equal(r.cards[0].id, 1)
  assert.equal(r.cards[0].acaoVencida, true)
  assert.match(r.cards[0].motivos[0], /venceu em 03\/10/)
  // Ação concluída não conta como plano aberto.
  const concluida = montarEngenharia({ projetos: [projeto({ id: 1 })], acoes: { 1: { acao: 'x', dono: 'y', prazo: '2026-10-03', feita: true } }, agora: AGORA })
  assert.equal(concluida.cards[0].acao, null)
  assert.equal(concluida.cards[0].acaoVencida, false)
})

test('entrada no marco usa o histórico e só é exata com transição vinda de outro marco', () => {
  const exato = entradaNoMarco(projeto({
    historicoStatus: [
      { statusAnterior: 'PIETA_PARECER SOLICITADO', statusNovo: 'PENDENCIA DE HOMOLOGAÇÃO', em: '2026-09-28T09:00:00Z' },
      { statusAnterior: 'PENDENCIA DE HOMOLOGAÇÃO', statusNovo: 'PENDENCIA ICF', em: '2026-10-02T09:00:00Z' },
    ],
  }))
  assert.deepEqual(exato, { desde: '2026-09-28T09:00:00Z', estimado: false })
  const estimado = entradaNoMarco(projeto({ historicoStatus: [{ statusAnterior: 'PENDENCIA DE HOMOLOGAÇÃO', statusNovo: 'PENDENCIA ICF', em: '2026-10-02T09:00:00Z' }] }))
  assert.equal(estimado.estimado, true)
  assert.equal(estimado.desde, '2026-10-01T10:00:00-03:00')
})

test('kit (marco 7, paralelo): projeção conta do instalador (9) em diante', () => {
  // Venda há 10 dias, 4 dias no kit (prazo 10): faltam 6 + 9,10,11,12 (5+7+7+7 = 26).
  const kit = classificarCard(projeto({ marco: '7', etapa: 'PEDIDO ENTREGUE', dataVenda: '2026-09-25T10:00:00' }), { prazos, hoje: HOJE })
  assert.equal(kit.diasDesdeVenda, 10)
  assert.equal(kit.projecao, 10 + 6 + 26)
})

test('universo: só fluxo da Engenharia; encerrados ficam fora da pauta mas contam no painel', () => {
  const r = montarEngenharia({
    projetos: [projeto({ id: 1 }), projeto({ id: 2, marco: 'FIM', etapa: 'DOSSIE ENVIADO' }), projeto({ id: 3, noFluxoEngenharia: false })],
    agora: AGORA,
  })
  assert.deepEqual(r.cards.map((c) => c.id), [1])
  assert.equal(r.painel.universo, 2)
  assert.equal(r.painel.encerrados, 1)
})

test('proposta aceita completa kWp e valor sem sobrescrever o que o projeto já tem', () => {
  const [a, b] = completarComPropostas([{ id: 1, kwp: null }, { id: 2, kwp: 9 }], [
    { projetoId: 1, aceita: true, kwP: 4.5, preco: 20000, geracaoAnual: 6000, dataAlteracao: '2026-09-01' },
    { projetoId: 1, aceita: true, kwP: 5.5, preco: 25000, dataAlteracao: '2026-09-10' },
    { projetoId: 2, aceita: true, kwP: 3 },
    { projetoId: 1, aceita: false, kwP: 99 },
  ])
  assert.equal(a.kwp, 5.5)
  assert.equal(a.valorPrePropostaAceita, 25000)
  assert.equal(b.kwp, 9)
})

test('mapProjeto: "Sem Projetista"/id 0 não contam como dono e venda 0001 é vazia', () => {
  const p = mapProjeto({ id: 7, etapa: '09. HOMOLOGAÇÃO', status: { nome: 'PENDENCIA ICF' }, projetista: 'Sem Projetista', projetistaId: 0, homologador: 'Maria', homologadorId: 12, tecnicoResponsavel: 'Sem Técnico', tecnicoResponsavelId: 0, dataVenda: '0001-01-01T00:00:00' }, {})
  assert.equal(p.projetista, null)
  assert.equal(p.tecnico, null)
  assert.equal(p.homologador, 'Maria')
  assert.equal(p.donoNominal, 'Maria')
  assert.equal(p.dataVenda, null)
})

test('validação de ação e de prazos', () => {
  assert.deepEqual(validarAcao({ acao: '  Cobrar   parecer ', dono: 'João', prazo: '2026-10-06' }), { acao: 'Cobrar parecer', dono: 'João', prazo: '2026-10-06' })
  assert.throws(() => validarAcao({ acao: 'x', dono: '', prazo: '2026-10-06' }), /responsável/)
  assert.throws(() => validarAcao({ acao: 'x', dono: 'y', prazo: '06/10/2026' }), /prazo/)
  const ok = validarPrazos({ sla: prazos.sla, metaEntrega: 60 })
  assert.equal(ok.sla.G6, 5)
  assert.throws(() => validarPrazos({ sla: { ...prazos.sla, 6: 0 }, metaEntrega: 60 }), /marco 6/)
})

test('rotas: leitura aberta, escrita exige o código certo e prazos exigem o de administração', async () => {
  process.env.ENGENHARIA_EQUIPE_TOKEN = 'equipe-teste'
  process.env.ENGENHARIA_ADMIN_TOKEN = 'admin-teste'
  const app = express()
  app.use(express.json())
  app.use('/api/engenharia', createEngenhariaRouter({ carregarProjetos: async () => ({ items: [projeto({ id: 1 })] }), agora: () => AGORA }))
  const server = app.listen(0, '127.0.0.1')
  await new Promise((r) => server.once('listening', r))
  const base = `http://127.0.0.1:${server.address().port}/api/engenharia`
  const json = { 'Content-Type': 'application/json' }
  try {
    const get = await fetch(base).then((r) => r.json())
    assert.equal(get.cards.length, 1)
    assert.deepEqual(get.edicao, { armazenamento: true, acoes: true, prazos: true })

    const corpo = JSON.stringify({ acao: 'Cobrar', dono: 'João', prazo: '2026-10-06', por: 'Fabio' })
    assert.equal((await fetch(`${base}/acoes/1`, { method: 'PUT', headers: json, body: corpo })).status, 401)
    assert.equal((await fetch(`${base}/acoes/abc`, { method: 'PUT', headers: { ...json, 'X-Engenharia-Token': 'equipe-teste' }, body: corpo })).status, 400)
    assert.equal((await fetch(`${base}/acoes/1`, { method: 'PUT', headers: { ...json, 'X-Engenharia-Token': 'equipe-teste' }, body: corpo })).status, 200)
    const depois = await fetch(base).then((r) => r.json())
    assert.equal(depois.cards[0].acao.dono, 'João')
    assert.equal(depois.cards[0].acao.por, 'Fabio')

    const prazosCorpo = JSON.stringify({ sla: { ...prazos.sla, 6: 20 }, metaEntrega: 90 })
    assert.equal((await fetch(`${base}/prazos`, { method: 'PUT', headers: { ...json, 'X-Engenharia-Token': 'equipe-teste' }, body: prazosCorpo })).status, 401)
    assert.equal((await fetch(`${base}/prazos`, { method: 'PUT', headers: { ...json, 'X-Engenharia-Token': 'admin-teste' }, body: prazosCorpo })).status, 200)
    const comPrazos = await fetch(base).then((r) => r.json())
    assert.equal(comPrazos.prazos.sla['6'], 20)
    assert.equal(comPrazos.prazos.proposta, false)

    delete process.env.ENGENHARIA_EQUIPE_TOKEN
    assert.equal((await fetch(`${base}/acoes/1`, { method: 'PUT', headers: { ...json, 'X-Engenharia-Token': 'equipe-teste' }, body: corpo })).status, 403)
  } finally {
    server.close()
    delete process.env.ENGENHARIA_EQUIPE_TOKEN
    delete process.env.ENGENHARIA_ADMIN_TOKEN
  }
})
