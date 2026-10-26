import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { classificarCard, completarComPropostas, entradaNoMarco, montarEngenharia, prazosEfetivos } from '../server/engenharia.js'
import { STATUS_FINALIZADOS_INSTALACAO, estaFinalizadoNaInstalacao } from '../shared/engenharia.js'
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

test('G6 sem venda não projeta entrega; SLA salvo muda o semáforo; data inválida vira aviso', () => {
  const g6 = classificarCard(projeto({ marco: 'G6', etapa: 'AGUARDANDO ASSINATURA', dataUltimoStatus: '2026-10-04T10:00:00-03:00' }), { prazos, hoje: HOJE })
  assert.equal(g6.projecao, null)
  assert.equal(g6.cor, 'ok')
  const apertado = prazosEfetivos({ sla: { 6: 2 }, metaEntrega: 90 })
  assert.equal(apertado.sla['6'], 2)
  assert.equal(apertado.sla['5'], 15)
  assert.equal(classificarCard(projeto(), { prazos: apertado, hoje: HOJE }).cor, 'atrasado')
  const semData = classificarCard(projeto({ dataUltimoStatus: 'lixo', dataEntradaStatus: null, dataUltimaAtualizacao: null }), { prazos, hoje: HOJE })
  assert.ok(semData.motivos.includes('Sem data de entrada no marco no Groner'))
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
    { projetoId: '2', aceita: true, kwP: 3 },
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

/** Salva as variáveis de ambiente usadas, aplica `vars` (sem o resto) e devolve a função que restaura. */
function isolarAmbiente(vars) {
  const chaves = ['ENGENHARIA_EQUIPE_TOKEN', 'ENGENHARIA_ADMIN_TOKEN', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'DASHBOARD_STORAGE', 'VERCEL']
  const salvo = Object.fromEntries(chaves.map((k) => [k, process.env[k]]))
  for (const k of chaves) delete process.env[k]
  Object.assign(process.env, vars)
  return () => { for (const k of chaves) { if (salvo[k] === undefined) delete process.env[k]; else process.env[k] = salvo[k] } }
}

test('rotas: leitura aberta, escrita exige o código certo e prazos exigem o de administração', async () => {
  const restaurar = isolarAmbiente({ ENGENHARIA_EQUIPE_TOKEN: 'equipe-teste', ENGENHARIA_ADMIN_TOKEN: 'admin-teste' })
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
    assert.equal((await fetch(`${base}/acoes/0`, { method: 'PUT', headers: { ...json, 'X-Engenharia-Token': 'equipe-teste' }, body: corpo })).status, 400)
    assert.equal((await fetch(`${base}/acoes/1/historico`)).status, 401)
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
    restaurar()
  }
})

test('Funil 11: status já entregues são finalizados (fora da Pauta, contam como encerrados)', () => {
  const base = { funil: '11. INSTALAÇÃO', noFluxoEngenharia: true, dataUltimoStatus: '2026-09-01T10:00:00-03:00', dataUltimaAtualizacao: '2026-09-01T10:00:00-03:00' }
  const finalizados = [
    ['INSTALAÇÃO CONCLUÍDA', null], ['INSTALAÇÃO APP MONITORAMENTO', '13'], ['APP MONITOR INSTALADO', '14'], ['TERMO DE ACEITE', '15'],
  ].map(([etapa, marco], i) => ({ ...base, id: 100 + i, etapa, marco: marco ?? '13' }))
  const ativo = { ...base, id: 200, etapa: 'PENDENCIA DE OBRA', marco: '11' }
  const r = montarEngenharia({ projetos: [...finalizados, ativo], agora: AGORA })
  assert.deepEqual(r.cards.map((c) => c.id), [200])
  assert.equal(r.painel.ativos, 1)
  assert.equal(r.painel.encerrados, 4)
  assert.equal(r.painel.fila.n, 0)
  assert.equal(r.painel.obra.n, 0)
})

test('Funil 11: variações de acento e caixa também são finalizadas; outros funis mantêm a regra anterior', () => {
  assert.equal(STATUS_FINALIZADOS_INSTALACAO.length, 4)
  assert.equal(estaFinalizadoNaInstalacao('11. INSTALAÇÃO', 'Instalacao Concluida'), true)
  assert.equal(estaFinalizadoNaInstalacao('11. INSTALAÇÃO', 'termo  de aceite'), true)
  assert.equal(estaFinalizadoNaInstalacao('11. INSTALAÇÃO', 'PENDENCIA DE OBRA'), false)
  assert.equal(estaFinalizadoNaInstalacao('11. INSTALAÇÃO', 'TERMO DE ACEITE ASSINADO'), false)
  assert.equal(estaFinalizadoNaInstalacao('12. PÓS-VENDA', 'TERMO DE ACEITE'), false)
  const outro = { id: 300, funil: '10. VISTORIA', etapa: 'TERMO DE ACEITE', marco: '15', noFluxoEngenharia: true, dataUltimoStatus: '2026-10-01T10:00:00-03:00', dataUltimaAtualizacao: '2026-10-04T10:00:00-03:00' }
  const r = montarEngenharia({ projetos: [outro], agora: AGORA })
  assert.equal(r.cards.length, 1)
  assert.equal(r.painel.ativos, 1)
  assert.equal(r.painel.encerrados, 0)
})

test('Funil 11: finalizado sai dos ativos mas posRelogio/monitoradas usam o marco original', () => {
  const base = { funil: '11. INSTALAÇÃO', noFluxoEngenharia: true, dataUltimoStatus: '2026-09-01T10:00:00-03:00', dataUltimaAtualizacao: '2026-09-01T10:00:00-03:00' }
  const projetos = [
    { ...base, id: 1, etapa: 'INSTALAÇÃO APP MONITORAMENTO', marco: '13' }, // relógio trocado, sem monitoramento
    { ...base, id: 2, etapa: 'APP MONITOR INSTALADO', marco: '14' }, // monitorado
    { ...base, id: 3, etapa: 'PENDENCIA DE OBRA', marco: '11' }, // ativo, fora do pós-relógio
  ]
  const r = montarEngenharia({ projetos, agora: AGORA })
  assert.deepEqual(r.cards.map((c) => c.id), [3])
  assert.equal(r.painel.ativos, 1)
  assert.equal(r.painel.encerrados, 2)
  assert.equal(r.painel.monitoramento.base, 2)
  assert.equal(r.painel.monitoramento.relogioSemMonitoramento, 1)
  assert.equal(r.painel.monitoramento.pct, 50)
})
