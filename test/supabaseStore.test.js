import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createSupabaseRest, TABELA } from '../server/supabaseRest.js'
import { createSupabaseSyncStore } from '../server/supabaseSyncStore.js'
import { createSupabaseEngenhariaStore } from '../server/supabaseEngenhariaStore.js'
import { armazenamentoSync, getSyncStatuses, getSyncStore, loadSyncedEntity, syncStorageConfigured } from '../server/syncStore.js'
import { engenhariaStore } from '../server/engenhariaStore.js'
import { createSyncRouter } from '../server/syncRoutes.js'

const URL_BASE = 'https://exemplo.supabase.co'
const CHAVE = 'sb_secret_CHAVE_DE_TESTE_123'
const ENTIDADES = ['projetos', 'tarefas', 'propostas', 'vendas', 'engenharia']
const TIPOS = ['registro', 'historico', 'lote', 'resultado', 'final', 'estado', 'trava', 'acao', 'acao_log', 'config']
const COLUNAS = ['tipo', 'entidade', 'chave', 'dados', 'hash', 'ativo', 'expira_em', 'criado_em', 'atualizado_em']

// ---------------------------------------------------------------------------
// PostgREST falso em memória: entende eq/neq/gt/lt/gte/lte/in/is, or=(...), select com
// colunas e dados->chave, order, limit (com max-rows), upsert merge-duplicates, PATCH,
// DELETE e as funções dashboard_crm_* reimplementadas com a mesma semântica do SQL.
// ---------------------------------------------------------------------------
function criarPostgrestFalso({ maxRows = 1000 } = {}) {
  const tabela = new Map()
  let relogio = Date.now()
  const requisicoes = []
  const idDe = (tipo, entidade, chave) => `${tipo}\u0000${entidade}\u0000${chave}`
  const agora = () => new Date(relogio).toISOString()

  class ErroHttp extends Error {
    constructor(status, code, message) { super(message); this.status = status; this.code = code }
  }
  const negocio = (status, message) => new ErroHttp(status, `PT${status}`, message)

  function gravar(tipo, entidade, chave, campos) {
    if (!TIPOS.includes(tipo) || !ENTIDADES.includes(entidade) || !(String(chave).length >= 1 && String(chave).length <= 200)) {
      throw new ErroHttp(400, '23514', 'violação de check constraint')
    }
    const id = idDe(tipo, entidade, chave)
    const atual = tabela.get(id)
    const linha = { tipo, entidade, chave, dados: {}, hash: null, ativo: true, expira_em: null, criado_em: agora(), ...(atual ?? {}), ...campos }
    if (linha.dados == null || linha.ativo == null) throw new ErroHttp(400, '23502', 'violação de not null')
    linha.atualizado_em = agora() // gatilho dashboard_crm_tocar
    linha.criado_em = atual?.criado_em ?? linha.criado_em
    tabela.set(id, structuredClone(linha))
    return linha
  }

  const valorDe = (linha, campo) => {
    if (campo.startsWith('dados->>')) { const v = linha.dados?.[campo.slice(8)]; return v == null ? null : String(v) }
    if (campo.startsWith('dados->')) return linha.dados?.[campo.slice(7)] ?? null
    return linha[campo]
  }
  const igual = (a, b) => String(a) === String(b)
  function condicao(linha, campo, expressao) {
    const ponto = expressao.indexOf('.')
    const op = expressao.slice(0, ponto)
    const alvo = expressao.slice(ponto + 1)
    const v = valorDe(linha, campo)
    switch (op) {
      case 'eq': return v != null && igual(v, alvo)
      case 'neq': return !igual(v, alvo)
      case 'gt': return v != null && String(v) > alvo
      case 'gte': return v != null && String(v) >= alvo
      case 'lt': return v != null && String(v) < alvo
      case 'lte': return v != null && String(v) <= alvo
      case 'in': return alvo.slice(1, -1).split(',').includes(String(v))
      case 'is': return alvo === 'null' ? v == null : v === (alvo === 'true')
      default: throw new ErroHttp(400, 'PGRST100', `operador ${op}`)
    }
  }
  const RESERVADOS = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'])
  function filtrar(params) {
    const condicoes = []
    for (const [campo, expressao] of params.entries()) {
      if (RESERVADOS.has(campo)) continue
      if (campo === 'or') {
        const partes = expressao.slice(1, -1).split(',').map((parte) => { const [c, ...resto] = parte.split('.'); return [c, resto.join('.')] })
        condicoes.push((linha) => partes.some(([c, e]) => condicao(linha, c, e)))
      } else {
        condicoes.push((linha) => condicao(linha, campo, expressao))
      }
    }
    return [...tabela.values()].filter((linha) => condicoes.every((c) => c(linha)))
  }
  function projetar(linha, select) {
    if (!select) return structuredClone(linha)
    const saida = {}
    for (const item of select.split(',')) {
      const m = /^(?:(\w+):)?(dados->>?\w+|\w+)$/.exec(item)
      if (!m) throw new ErroHttp(400, 'PGRST100', `select ${item}`)
      const campo = m[2]
      if (campo.startsWith('dados->')) saida[m[1] ?? campo.replace(/^dados->>?/, '')] = structuredClone(valorDe(linha, campo))
      else saida[m[1] ?? campo] = structuredClone(linha[campo])
    }
    return saida
  }

  // -------- funções SQL (espelham supabase/dashboard-gronner-crm.sql) --------
  const ehCronologico = (v) => !Number.isNaN(Date.parse(v))
  const funcoes = {
    dashboard_crm_limpar_expirados() {
      let removidos = 0
      for (const [id, linha] of tabela) if (linha.expira_em != null && linha.expira_em < agora()) { tabela.delete(id); removidos += 1 }
      return removidos
    },
    dashboard_crm_travar({ p_entidade, p_chave, p_dono, p_segundos }) {
      if (!ENTIDADES.includes(p_entidade)) throw negocio(400, 'Entidade inválida')
      if (!p_chave || !p_dono) throw negocio(400, 'Trava inválida')
      if (!Number.isInteger(p_segundos) || p_segundos < 1 || p_segundos > 3600) throw negocio(400, 'Validade da trava inválida')
      const atual = tabela.get(idDe('trava', p_entidade, p_chave))
      if (!atual || atual.expira_em == null || atual.expira_em <= agora() || atual.dados.dono === p_dono) {
        gravar('trava', p_entidade, p_chave, { dados: { dono: p_dono }, expira_em: new Date(relogio + p_segundos * 1000).toISOString() })
        return { ok: true, dono: p_dono }
      }
      return { ok: false, dono: atual.dados.dono }
    },
    dashboard_crm_liberar({ p_entidade, p_chave, p_dono }) {
      const id = idDe('trava', p_entidade, p_chave)
      if (tabela.get(id)?.dados.dono === p_dono) { tabela.delete(id); return true }
      return false
    },
    dashboard_crm_salvar_acao({ p_card, p_registro }) {
      if (!/^[1-9][0-9]{0,11}$/.test(p_card ?? '')) throw negocio(400, 'Card inválido')
      if (!p_registro || typeof p_registro !== 'object' || Array.isArray(p_registro)) throw negocio(400, 'Ação inválida')
      gravar('acao', 'engenharia', p_card, { dados: p_registro })
      const log = tabela.get(idDe('acao_log', 'engenharia', p_card))?.dados ?? []
      gravar('acao_log', 'engenharia', p_card, { dados: [p_registro, ...log].slice(0, 20) })
      return p_registro
    },
    dashboard_crm_finalizar({ p_entidade, p_run_id, p_run_started_at, p_batch_count, p_expected_total }) {
      if (!['projetos', 'tarefas', 'propostas', 'vendas'].includes(p_entidade)) throw negocio(400, 'Entidade de sincronização desconhecida')
      if (!/^[a-z]+-[0-9TZ]+$/i.test(p_run_id ?? '')) throw negocio(400, 'runId inválido')
      if (!Number.isInteger(p_batch_count) || p_batch_count < 1) throw negocio(400, 'batchCount inválido')
      if (!Number.isInteger(p_expected_total) || p_expected_total < 0) throw negocio(400, 'expectedTotal inválido')
      if (!ehCronologico(p_run_started_at)) throw negocio(400, 'runStartedAt inválido')
      const valida = (linha) => linha && (linha.expira_em == null || linha.expira_em > agora())

      const final = tabela.get(idDe('final', p_entidade, p_run_id))
      if (valida(final)) return structuredClone(final.dados)
      const atual = tabela.get(idDe('estado', p_entidade, 'current'))?.dados
      if (atual && Date.parse(atual.runStartedAt) > Date.parse(p_run_started_at)) throw negocio(409, 'Existe uma sincronização mais nova já publicada')

      const chaves = Array.from({ length: p_batch_count }, (_, i) => `${p_run_id}:${i + 1}`)
      const lotes = chaves.map((c) => tabela.get(idDe('lote', p_entidade, c))).filter(valida)
      if (lotes.length !== p_batch_count) throw negocio(409, 'Nem todos os lotes foram recebidos')
      const recebidos = lotes.reduce((total, l) => total + l.dados.items.length, 0)
      const inconsistentes = lotes.filter((l) => (
        l.dados.runId !== p_run_id || l.dados.entity !== p_entidade || l.dados.batchIndex !== Number(l.chave.split(':')[1]) ||
        l.dados.batchCount !== p_batch_count || l.dados.expectedTotal !== p_expected_total
      )).length
      if (recebidos !== p_expected_total || inconsistentes > 0) throw negocio(409, 'Carga incompleta ou metadados inconsistentes')
      const ids = lotes.flatMap((l) => l.dados.items.map((item) => String(item.id)))
      if (new Set(ids).size !== ids.length) throw negocio(409, 'IDs duplicados entre lotes')

      for (const lote of lotes) {
        for (const item of lote.dados.items) {
          const id = String(item.id)
          const hash = lote.dados.hashes[id]
          const existente = tabela.get(idDe('registro', p_entidade, id))
          if (!existente || existente.hash !== hash || !existente.ativo) gravar('registro', p_entidade, id, { dados: item, hash, ativo: true, expira_em: null })
        }
      }
      let softDeleted = 0
      for (const linha of [...tabela.values()]) {
        if (linha.tipo === 'registro' && linha.entidade === p_entidade && linha.ativo && !ids.includes(linha.chave)) {
          gravar('registro', p_entidade, linha.chave, { ativo: false })
          softDeleted += 1
        }
      }
      const resultados = chaves.map((c) => tabela.get(idDe('resultado', p_entidade, `lote:${c}`))?.dados)
      const soma = (campo) => resultados.reduce((total, r) => total + Number(r?.[campo] ?? 0), 0)
      const manifesto = { entity: p_entidade, runId: p_run_id, runStartedAt: p_run_started_at, finishedAt: agora(), batchCount: p_batch_count, expectedTotal: p_expected_total }
      const resposta = { ...manifesto, ok: true, inserted: soma('inserted'), updated: soma('updated'), unchanged: soma('unchanged'), softDeleted, activeTotal: ids.length }
      gravar('estado', p_entidade, 'current', { dados: manifesto })
      gravar('estado', p_entidade, 'status', { dados: resposta })
      gravar('final', p_entidade, p_run_id, { dados: resposta, expira_em: new Date(relogio + 2 * 86400000).toISOString() })
      for (const [id, linha] of [...tabela]) {
        if (linha.tipo === 'lote' && linha.entidade === p_entidade && (chaves.includes(linha.chave) || (atual && atual.runId !== p_run_id && linha.chave.split(':')[0] === atual.runId))) tabela.delete(id)
      }
      const trava = tabela.get(idDe('trava', p_entidade, 'atividade'))
      if (trava?.dados.dono === `full:${p_run_id}`) tabela.delete(idDe('trava', p_entidade, 'atividade'))
      funcoes.dashboard_crm_limpar_expirados()
      return resposta
    },
  }

  async function fetchFalso(url, init = {}) {
    const alvo = new URL(url)
    const cabecalhos = Object.fromEntries(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]))
    const corpo = init.body ? JSON.parse(init.body) : undefined
    requisicoes.push({ url: String(url), metodo: init.method ?? 'GET', cabecalhos, corpo, caminho: alvo.pathname, params: alvo.searchParams })
    relogio += 1
    const json = (status, valor) => new Response(valor === undefined ? null : JSON.stringify(valor), { status, headers: { 'Content-Type': 'application/json' } })
    try {
      if (cabecalhos.apikey !== CHAVE || cabecalhos.authorization !== `Bearer ${CHAVE}`) return json(401, { message: 'Invalid API key' })
      const rpc = /^\/rest\/v1\/rpc\/(\w+)$/.exec(alvo.pathname)
      if (rpc) {
        if (!funcoes[rpc[1]]) return json(404, { code: 'PGRST202', message: 'função inexistente' })
        return json(200, funcoes[rpc[1]](corpo ?? {}))
      }
      if (alvo.pathname !== `/rest/v1/${TABELA}`) return json(404, { code: 'PGRST205', message: 'tabela inexistente' })
      const params = alvo.searchParams
      const metodo = init.method ?? 'GET'
      if (metodo === 'GET') {
        let linhas = filtrar(params)
        const ordem = params.get('order')
        if (ordem) {
          const [campo, sentido] = ordem.split('.')
          linhas.sort((a, b) => (String(a[campo]) < String(b[campo]) ? -1 : String(a[campo]) > String(b[campo]) ? 1 : 0) * (sentido === 'desc' ? -1 : 1))
        }
        linhas = linhas.slice(0, Math.min(Number(params.get('limit') ?? Infinity), maxRows))
        return json(200, linhas.map((linha) => projetar(linha, params.get('select'))))
      }
      if (metodo === 'POST') {
        assert.match(cabecalhos.prefer, /resolution=merge-duplicates/)
        assert.equal(params.get('on_conflict'), 'tipo,entidade,chave')
        const colunas = params.get('columns').split(',')
        const copia = new Map(tabela)
        try {
          for (const item of corpo) {
            const campos = {}
            for (const c of colunas) if (!['tipo', 'entidade', 'chave'].includes(c)) campos[c] = item[c] ?? null
            gravar(item.tipo, item.entidade, item.chave, campos)
          }
        } catch (err) {
          tabela.clear(); for (const [k, v] of copia) tabela.set(k, v) // transação: tudo ou nada
          throw err
        }
        return json(201)
      }
      if (metodo === 'PATCH') {
        for (const linha of filtrar(params)) gravar(linha.tipo, linha.entidade, linha.chave, corpo)
        return json(204)
      }
      if (metodo === 'DELETE') {
        if (![...params.keys()].length) return json(400, { code: 'PGRST', message: 'DELETE sem filtro' })
        for (const linha of filtrar(params)) tabela.delete(idDe(linha.tipo, linha.entidade, linha.chave))
        return json(204)
      }
      return json(405, { message: 'método' })
    } catch (err) {
      if (err instanceof ErroHttp) return json(err.status, { code: err.code, message: err.message, details: null, hint: null })
      throw err
    }
  }

  return {
    fetch: fetchFalso,
    tabela,
    requisicoes,
    avancar: (ms) => { relogio += ms },
    linhas: (tipo, entidade) => [...tabela.values()].filter((l) => l.tipo === tipo && (!entidade || l.entidade === entidade)),
    semear: (tipo, entidade, chave, campos) => gravar(tipo, entidade, chave, campos),
    rest: (opcoes = {}) => createSupabaseRest({ url: URL_BASE, chave: CHAVE, fetch: fetchFalso, esperaRetentativaMs: 1, log: () => {}, ...opcoes }),
  }
}

function lote(runId, items, extras = {}) {
  return {
    runId, runStartedAt: '2026-10-05T11:00:00.000Z', entity: 'projetos', batchIndex: 1, batchCount: 1,
    expectedTotal: items.length, items, ...extras,
  }
}
const igualdade = (item) => item
const contagens = ({ inserted, updated, unchanged }) => ({ inserted, updated, unchanged })

function novo(opcoesFalso, opcoesRest) {
  const falso = criarPostgrestFalso(opcoesFalso)
  const rest = falso.rest(opcoesRest)
  return { falso, rest, store: createSupabaseSyncStore(rest) }
}

// ---------------------------------------------------------------------------
// 1. Carga completa
// ---------------------------------------------------------------------------
test('supabase: carga completa idempotente, publica na finalização, segunda carga igual e carga menor com soft delete', async () => {
  const { falso, store } = novo()
  const primeira = lote('projetos-20261005T110000Z', [{ id: 1, etapa: 'Novo' }, { id: 2, etapa: 'Proposta' }])
  const r1 = await store.upsertBatch(primeira, igualdade)
  assert.deepEqual(contagens(r1), { inserted: 2, updated: 0, unchanged: 0 })
  assert.deepEqual(await store.upsertBatch(primeira, igualdade), r1)
  assert.equal(await store.load('projetos'), null) // nada publicado antes da finalização

  const final1 = await store.finalize(primeira)
  assert.equal(final1.activeTotal, 2)
  assert.equal(final1.softDeleted, 0)
  assert.deepEqual(contagens(final1), { inserted: 2, updated: 0, unchanged: 0 })
  assert.equal(falso.linhas('lote').length, 0) // lotes apagados pela finalização
  assert.equal(falso.linhas('trava').length, 0)
  const carregado = await store.load('projetos')
  assert.deepEqual(carregado.items.map(({ id, etapa, historicoStatus }) => ({ id, etapa, historicoStatus })), [
    { id: 1, etapa: 'Novo', historicoStatus: [] },
    { id: 2, etapa: 'Proposta', historicoStatus: [] },
  ])
  assert.equal(carregado.totalItems, 2)
  assert.equal(carregado.sync.runId, primeira.runId)
  assert.equal((await store.status('projetos')).activeTotal, 2)

  const igual = lote('projetos-20261005T180000Z', primeira.items, { runStartedAt: '2026-10-05T21:00:00.000Z' })
  const r2 = await store.upsertBatch(igual, igualdade)
  assert.deepEqual(contagens(r2), { inserted: 0, updated: 0, unchanged: 2 })
  await store.finalize(igual)

  const menor = lote('projetos-20261006T080000Z', [{ id: 1, etapa: 'Fechado' }], { runStartedAt: '2026-10-06T11:00:00.000Z' })
  const r3 = await store.upsertBatch(menor, igualdade)
  assert.deepEqual(contagens(r3), { inserted: 0, updated: 1, unchanged: 0 })
  const final3 = await store.finalize(menor)
  assert.equal(final3.softDeleted, 1)
  const itens = (await store.load('projetos')).items
  assert.deepEqual(itens.map(({ id, etapa }) => ({ id, etapa })), [{ id: 1, etapa: 'Fechado' }])
  assert.deepEqual(itens[0].historicoStatus, [{ id: 1, statusAnterior: 'Novo', statusNovo: 'Fechado', em: '2026-10-06T11:00:00.000Z' }])
  assert.equal(itens[0].dataEntradaMarco, '2026-10-06T11:00:00.000Z')
  assert.equal(itens[0].dataEntradaMarcoEstimada, false)
})

// ---------------------------------------------------------------------------
// 2. Recusas da finalização
// ---------------------------------------------------------------------------
test('supabase: finalização recusa lote faltando, IDs duplicados e carga mais antiga (409), e repetir devolve o mesmo final', async () => {
  const { falso, store } = novo()
  const faltando = lote('projetos-20261005T110000Z', [{ id: 1 }], { batchCount: 2 })
  await store.upsertBatch(faltando, igualdade)
  await assert.rejects(() => store.finalize(faltando), (err) => err.status === 409 && /Nem todos os lotes/.test(err.message))
  falso.avancar(5 * 60 * 1000) // a trava de atividade da carga que falhou vence

  const dup1 = lote('projetos-20261005T120000Z', [{ id: 7 }], { batchIndex: 1, batchCount: 2, expectedTotal: 2 })
  const dup2 = lote(dup1.runId, [{ id: 7 }], { batchIndex: 2, batchCount: 2, expectedTotal: 2 })
  await store.upsertBatch(dup1, igualdade)
  await store.upsertBatch(dup2, igualdade)
  await assert.rejects(() => store.finalize(dup1), (err) => err.status === 409 && /IDs duplicados entre lotes/.test(err.message))
  falso.avancar(5 * 60 * 1000)

  const nova = lote('projetos-20261006T080000Z', [{ id: 1 }], { runStartedAt: '2026-10-06T11:00:00.000Z' })
  await store.upsertBatch(nova, igualdade)
  const publicada = await store.finalize(nova)
  assert.deepEqual(await store.finalize(nova), publicada) // idempotente

  const antiga = lote('projetos-20261004T080000Z', [{ id: 2 }], { runStartedAt: '2026-10-04T11:00:00.000Z' })
  await store.upsertBatch(antiga, igualdade)
  await assert.rejects(() => store.finalize(antiga), (err) => err.status === 409 && /mais nova/.test(err.message))

  await assert.rejects(() => store.finalize({ ...nova, batchCount: 0 }), (err) => err.status === 400 && /batchCount/.test(err.message))
})

// ---------------------------------------------------------------------------
// 3. Incremental
// ---------------------------------------------------------------------------
test('supabase: incremental conta, grava histórico, só avança o cursor com sucesso, é idempotente e respeita trava full', async () => {
  const { falso, rest, store } = novo()
  const carga = lote('projetos-20261005T110000Z', [{ id: 1, etapa: 'Etapa A' }, { id: 2, etapa: 'Etapa B' }])
  await store.upsertBatch(carga, igualdade)
  await store.finalize(carga)

  const mudanca = {
    entity: 'projetos', runId: 'changes-20261005T111000Z', runStartedAt: '2026-10-05T11:10:00.000Z',
    nextCursor: '2026-10-05T11:10:00.000Z', items: [{ id: 1, etapa: 'Etapa C' }, { id: 2, etapa: 'Etapa B' }],
  }
  const primeira = await store.upsertChanges(mudanca, igualdade)
  assert.deepEqual(contagens(primeira), { inserted: 0, updated: 1, unchanged: 1 })
  assert.equal(primeira.skipped, false)
  assert.equal(await store.cursor('projetos'), mudanca.nextCursor)
  assert.equal((await store.status('projetos')).mode, 'changes')
  assert.equal(falso.linhas('trava').length, 0) // trava solta no finally
  assert.deepEqual(await store.upsertChanges(mudanca, igualdade), primeira) // repetição
  const carregado = await store.load('projetos')
  assert.equal(carregado.items.length, 2)
  assert.equal(carregado.items.find((i) => i.id === 1).etapa, 'Etapa C')
  assert.equal(carregado.items.find((i) => i.id === 1).historicoStatus.length, 1)
  assert.equal(carregado.items.find((i) => i.id === 2).historicoStatus.length, 0)

  // incremental sem cursor novo mantém o cursor guardado
  const semCursor = await store.upsertChanges({ ...mudanca, runId: 'changes-20261005T111500Z', nextCursor: undefined, items: [] }, igualdade)
  assert.equal(semCursor.nextCursor, mudanca.nextCursor)

  await rest.rpc('dashboard_crm_travar', { p_entidade: 'projetos', p_chave: 'atividade', p_dono: 'full:outro-run', p_segundos: 240 })
  const pulado = await store.upsertChanges({ ...mudanca, runId: 'changes-20261005T112000Z', nextCursor: '2026-10-05T11:20:00.000Z' }, igualdade)
  assert.equal(pulado.skipped, true)
  assert.equal(pulado.reason, 'sync_locked')
  assert.equal(await store.cursor('projetos'), mudanca.nextCursor)

  // trava vencida deixa de bloquear
  falso.avancar(5 * 60 * 1000)
  const depois = await store.upsertChanges({ ...mudanca, runId: 'changes-20261005T113000Z', nextCursor: '2026-10-05T11:30:00.000Z' }, igualdade)
  assert.equal(depois.skipped, false)
  assert.equal(await store.cursor('projetos'), '2026-10-05T11:30:00.000Z')
})

test('supabase: carga completa recusa começar durante incremental ou outra carga', async () => {
  const { rest, store } = novo()
  const entrada = lote('projetos-20261005T110000Z', [{ id: 1 }])
  await rest.rpc('dashboard_crm_travar', { p_entidade: 'projetos', p_chave: 'atividade', p_dono: 'changes:changes-20261005T105900Z', p_segundos: 240 })
  await assert.rejects(() => store.upsertBatch(entrada, igualdade), (err) => err.status === 409 && /incremental em andamento/.test(err.message))
  await rest.rpc('dashboard_crm_liberar', { p_entidade: 'projetos', p_chave: 'atividade', p_dono: 'changes:changes-20261005T105900Z' })
  await rest.rpc('dashboard_crm_travar', { p_entidade: 'projetos', p_chave: 'atividade', p_dono: 'full:projetos-20260101T000000Z', p_segundos: 240 })
  await assert.rejects(() => store.upsertBatch(entrada, igualdade), (err) => err.status === 409 && /Outra sincronização/.test(err.message))
})

// ---------------------------------------------------------------------------
// 4. Trava de lote
// ---------------------------------------------------------------------------
test('supabase: lote já em processamento dá 409 e a trava é solta mesmo quando a normalização lança erro', async () => {
  const { falso, rest, store } = novo()
  const entrada = lote('projetos-20261005T110000Z', [{ id: 1, etapa: 'A' }])
  await rest.rpc('dashboard_crm_travar', { p_entidade: 'projetos', p_chave: `lote:${entrada.runId}:1`, p_dono: 'outro-processo', p_segundos: 120 })
  await assert.rejects(() => store.upsertBatch(entrada, igualdade), (err) => err.status === 409 && err.message === 'Lote já está sendo processado')
  falso.avancar(121 * 1000) // a trava vence sozinha

  await assert.rejects(() => store.upsertBatch(entrada, () => { throw new Error('normalização quebrou') }), /normalização quebrou/)
  assert.equal(falso.linhas('trava').filter((l) => l.chave.startsWith('lote:')).length, 0)
  assert.equal(falso.linhas('lote').length, 0)
  const ok = await store.upsertBatch(entrada, igualdade)
  assert.equal(ok.inserted, 1)
  assert.equal(falso.linhas('trava').filter((l) => l.chave.startsWith('lote:')).length, 0)

  await assert.rejects(() => store.upsertBatch(lote('projetos-20261005T110000Z', [{ id: 1 }, { id: 1 }], { batchIndex: 2, batchCount: 2 }), igualdade), (err) => err.status === 400 && /duplicados/.test(err.message))
})

// ---------------------------------------------------------------------------
// 5. load pagina e junta histórico
// ---------------------------------------------------------------------------
test('supabase: load pagina por chave com limite pequeno, junta histórico e reaproveita a leitura quando nada mudou', async () => {
  const { falso, rest, store } = novo({ maxRows: 3 }, { tamanhoPagina: 3 })
  for (let id = 1; id <= 8; id += 1) falso.semear('registro', 'projetos', String(id), { dados: { id, etapa: id === 2 ? 'Nova' : 'X' }, hash: `h${id}`, ativo: true })
  falso.semear('registro', 'projetos', '9', { dados: { id: 9, etapa: 'Velha' }, hash: 'h9', ativo: false })
  falso.semear('historico', 'projetos', '2', { dados: [{ id: 2, statusAnterior: 'X', statusNovo: 'Nova', em: '2026-10-01T00:00:00.000Z' }] })
  falso.semear('estado', 'projetos', 'current', { dados: { entity: 'projetos', runId: 'projetos-20261001T000000Z', finishedAt: '2026-10-01T00:00:00.000Z' } })

  const carregado = await store.load('projetos')
  assert.deepEqual(carregado.items.map((i) => i.id), [1, 2, 3, 4, 5, 6, 7, 8]) // o inativo (9) fica de fora
  assert.equal(carregado.items[1].dataEntradaMarco, '2026-10-01T00:00:00.000Z')
  assert.equal(carregado.items[1].dataEntradaMarcoEstimada, false)
  assert.equal(carregado.items[0].dataEntradaMarcoEstimada, true)
  const paginas = () => falso.requisicoes.filter((r) => r.params.get('ativo') === 'is.true').length
  assert.equal(paginas(), 3) // 3 + 3 + 2 linhas

  assert.equal(await store.load('projetos'), carregado) // sem mudança: mesma carga, sem baixar de novo
  assert.equal(paginas(), 3)

  await rest.upsert([{ tipo: 'registro', entidade: 'projetos', chave: '3', dados: { id: 3, etapa: 'Mudou' }, hash: 'h3b', ativo: true }])
  const recarregado = await store.load('projetos')
  assert.equal(recarregado.items.find((i) => i.id === 3).etapa, 'Mudou')
  assert.equal(paginas(), 6)
  assert.equal(await createSupabaseSyncStore(rest).load('tarefas'), null)
})

test('supabase: load pagina mais de 1000 registros com o limite real do Supabase', async () => {
  const { falso, store } = novo({ maxRows: 1000 })
  for (let id = 1; id <= 2300; id += 1) falso.semear('registro', 'vendas', String(id), { dados: { id }, hash: `h${id}`, ativo: true })
  falso.semear('estado', 'vendas', 'current', { dados: { entity: 'vendas', runId: 'vendas-20261001T000000Z', finishedAt: '2026-10-01T00:00:00.000Z' } })
  const carregado = await store.load('vendas')
  assert.equal(carregado.totalItems, 2300)
  assert.equal(new Set(carregado.items.map((i) => i.id)).size, 2300)
  assert.equal(falso.requisicoes.filter((r) => r.params.get('ativo') === 'is.true').length, 3)
  assert.equal(falso.requisicoes.some((r) => r.params.get('tipo') === 'eq.historico'), false) // só projetos têm histórico
})

// ---------------------------------------------------------------------------
// 6. Mapeamento de erros
// ---------------------------------------------------------------------------
test('supabase: erros do PostgREST viram {status, message}, falhas viram 503 genérico e a chave nunca aparece', async () => {
  const logs = []
  const resposta = (status, corpo) => async () => new Response(JSON.stringify(corpo), { status })
  const criar = (fetch, extras = {}) => createSupabaseRest({ url: URL_BASE, chave: CHAVE, fetch, esperaRetentativaMs: 1, log: (...a) => logs.push(a.join(' ')), ...extras })

  const negocio = criar(resposta(409, { code: 'PT409', message: 'Nem todos os lotes foram recebidos', details: null }))
  await assert.rejects(() => negocio.rpc('dashboard_crm_finalizar', {}), (err) => err.status === 409 && err.message === 'Nem todos os lotes foram recebidos')
  const requisicao = criar(resposta(400, { code: 'PT400', message: 'Card inválido' }))
  await assert.rejects(() => requisicao.rpc('dashboard_crm_salvar_acao', {}), (err) => err.status === 400 && err.message === 'Card inválido')

  let chamadas = 0
  const quebrado = criar(async () => { chamadas += 1; return new Response(`erro interno com ${CHAVE}`, { status: 500 }) })
  await assert.rejects(() => quebrado.get({ tipo: 'eq.registro' }), (err) => {
    assert.equal(err.status, 503)
    assert.equal(err.message, 'Armazenamento de sincronização indisponível')
    assert.equal(JSON.stringify({ ...err, message: err.message }).includes(CHAVE), false)
    return true
  })
  assert.equal(chamadas, 3) // leitura idempotente: 3 tentativas
  chamadas = 0
  await assert.rejects(() => quebrado.rpc('dashboard_crm_salvar_acao', {}), (err) => err.status === 503)
  assert.equal(chamadas, 1) // função possivelmente não idempotente: sem retentativa

  let naoEncontrado = 0
  const semTabela = criar(async () => { naoEncontrado += 1; return new Response(JSON.stringify({ code: 'PGRST205', message: 'tabela não existe' }), { status: 404 }) })
  await assert.rejects(() => semTabela.get({}), (err) => err.status === 503 && !/PGRST/.test(err.message))
  assert.equal(naoEncontrado, 1) // erro de requisição não é repetido

  const rede = criar(async () => { throw new TypeError(`fetch failed ${CHAVE}`) })
  await assert.rejects(() => rede.del({ tipo: 'eq.trava' }), (err) => err.status === 503 && !err.message.includes(CHAVE))

  const lento = criar((_url, init) => new Promise((_, rejeitar) => init.signal.addEventListener('abort', () => rejeitar(init.signal.reason))), { timeoutMs: 20 })
  await assert.rejects(() => lento.get({}), (err) => err.status === 503 && err.causa === 'timeout')

  assert.ok(logs.length >= 1)
  assert.equal(logs.some((linha) => linha.includes(CHAVE)), false)
})

// ---------------------------------------------------------------------------
// 7. URL e cabeçalhos
// ---------------------------------------------------------------------------
test('supabase: a tabela é chamada como /rest/v1/DASHBOARD-GRONNER-CRM e todo pedido leva apikey e Authorization', async () => {
  const { falso, rest, store } = novo()
  const carga = lote('projetos-20261005T110000Z', [{ id: 1, etapa: 'A' }])
  await store.upsertBatch(carga, igualdade)
  await store.finalize(carga)
  await store.load('projetos')
  await rest.update({ tipo: 'eq.registro', chave: 'eq.1' }, { ativo: false })
  await rest.del({ tipo: 'eq.trava', entidade: 'eq.projetos' })

  assert.ok(falso.requisicoes.length > 8)
  for (const r of falso.requisicoes) {
    assert.equal(r.cabecalhos.apikey, CHAVE)
    assert.equal(r.cabecalhos.authorization, `Bearer ${CHAVE}`)
    assert.ok(r.url.startsWith(`${URL_BASE}/rest/v1/`))
  }
  const daTabela = falso.requisicoes.filter((r) => !r.caminho.includes('/rpc/'))
  assert.ok(daTabela.length > 0)
  for (const r of daTabela) assert.ok(r.url.startsWith(`${URL_BASE}/rest/v1/DASHBOARD-GRONNER-CRM`), r.url)
  assert.ok(falso.requisicoes.some((r) => r.caminho === '/rest/v1/rpc/dashboard_crm_finalizar'))
  assert.equal(falso.linhas('registro')[0].ativo, false) // PATCH aplicou
  const upsert = falso.requisicoes.find((r) => r.metodo === 'POST' && !r.caminho.includes('/rpc/'))
  assert.equal(upsert.params.get('on_conflict'), 'tipo,entidade,chave')
  assert.equal(upsert.params.get('columns'), 'tipo,entidade,chave,dados,hash,ativo,expira_em')
  assert.equal(upsert.cabecalhos.prefer, 'resolution=merge-duplicates,return=minimal')
  // só as colunas usadas: nenhuma leitura sem select nem com select=*
  for (const r of falso.requisicoes.filter((x) => x.metodo === 'GET')) {
    assert.ok(r.params.get('select') && r.params.get('select') !== '*', r.url)
  }
})

// ---------------------------------------------------------------------------
// 8. Engenharia
// ---------------------------------------------------------------------------
test('supabase: engenharia guarda ação ativa, histórico de 20 (mais nova primeiro) e prazos', async () => {
  const falso = criarPostgrestFalso()
  const store = createSupabaseEngenhariaStore(falso.rest())
  assert.deepEqual(await store.listarAcoes(), {})
  assert.equal(await store.obterAcao('1234'), null)
  assert.deepEqual(await store.historico('1234'), [])
  assert.equal(await store.obterConfig(), null)

  for (let n = 1; n <= 22; n += 1) {
    const registro = { acao: `ação ${n}`, dono: 'Ana', prazo: '2026-10-30', feita: false }
    assert.deepEqual(await store.salvarAcao('1234', registro), registro)
  }
  await store.salvarAcao('99', { acao: 'outra', dono: 'Bia', prazo: '2026-11-01', feita: true })

  const historico = await store.historico('1234')
  assert.equal(historico.length, 20)
  assert.equal(historico[0].acao, 'ação 22')
  assert.equal(historico[19].acao, 'ação 3')
  assert.equal((await store.obterAcao('1234')).acao, 'ação 22')
  const todas = await store.listarAcoes()
  assert.deepEqual(Object.keys(todas).sort(), ['1234', '99'])
  assert.equal(todas['99'].dono, 'Bia')

  const config = { sla: { 1: 5, 2: 7 }, metaEntrega: 90 }
  assert.deepEqual(await store.salvarConfig(config), config)
  assert.deepEqual(await store.obterConfig(), config)
  await store.salvarConfig({ ...config, metaEntrega: 120 })
  assert.equal((await store.obterConfig()).metaEntrega, 120)
  assert.equal(falso.linhas('config').length, 1)

  await assert.rejects(() => store.salvarAcao('abc', { acao: 'x' }), (err) => err.status === 400 && err.message === 'Card inválido')
})

// ---------------------------------------------------------------------------
// 9. Seleção do armazenamento
// ---------------------------------------------------------------------------
async function comAmbiente(vars, fn) {
  const chaves = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'VERCEL', 'DASHBOARD_STORAGE', 'GRONER_SYNC_TOKEN', 'ENGENHARIA_EQUIPE_TOKEN', 'ENGENHARIA_ADMIN_TOKEN']
  const salvo = Object.fromEntries(chaves.map((k) => [k, process.env[k]]))
  const fetchOriginal = globalThis.fetch
  for (const k of chaves) delete process.env[k]
  Object.assign(process.env, vars)
  try { return await fn() } finally {
    for (const k of chaves) { if (salvo[k] === undefined) delete process.env[k]; else process.env[k] = salvo[k] }
    globalThis.fetch = fetchOriginal
  }
}
const SUPABASE = { SUPABASE_URL: URL_BASE, SUPABASE_SECRET_KEY: CHAVE }
const UPSTASH = { UPSTASH_REDIS_REST_URL: 'https://exemplo.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'token' }

test('seleção: Supabase vence o Redis; só Upstash usa Redis; nada na Vercel fica sem armazenamento; nada fora dela usa memória', async () => {
  assert.equal(armazenamentoSync({ ...SUPABASE, ...UPSTASH }), 'supabase')
  assert.equal(armazenamentoSync(UPSTASH), 'redis')
  assert.equal(armazenamentoSync({ SUPABASE_URL: URL_BASE }), null)
  assert.equal(armazenamentoSync({}), null)
  assert.equal(armazenamentoSync({ ...SUPABASE, ...UPSTASH, DASHBOARD_STORAGE: 'redis' }), 'redis')
  assert.equal(armazenamentoSync({ ...SUPABASE, DASHBOARD_STORAGE: 'redis' }), null)
  assert.equal(armazenamentoSync({ ...SUPABASE, ...UPSTASH, DASHBOARD_STORAGE: 'memoria' }), null)

  await comAmbiente({ ...SUPABASE, ...UPSTASH }, async () => {
    const falso = criarPostgrestFalso()
    globalThis.fetch = falso.fetch
    assert.equal(syncStorageConfigured(), true)
    const eng = engenhariaStore()
    await eng.salvarAcao('5', { acao: 'x', dono: 'y', prazo: '2026-10-30', feita: false })
    assert.equal(falso.linhas('acao', 'engenharia').length, 1)
    const statuses = await getSyncStatuses()
    assert.equal(statuses.configured, true)
    assert.deepEqual(Object.keys(statuses.entities).sort(), ['projetos', 'propostas', 'tarefas', 'vendas'])
    assert.equal(await loadSyncedEntity('projetos'), null)
    assert.equal(await getSyncStore().cursor('projetos'), null)
    assert.equal(getSyncStore(), getSyncStore()) // instância única (preserva o cache de versão)
    assert.ok(falso.requisicoes.length >= 3)
  })

  await comAmbiente(UPSTASH, async () => {
    globalThis.fetch = async () => { throw new Error('não deveria chamar o Supabase') }
    assert.equal(syncStorageConfigured(), true)
    assert.equal(typeof engenhariaStore().salvarAcao, 'function')
  })

  await comAmbiente({ VERCEL: '1' }, async () => {
    assert.equal(syncStorageConfigured(), false)
    assert.equal(engenhariaStore(), null)
    assert.deepEqual(await getSyncStatuses(), { configured: false, entities: {} })
    assert.equal(await loadSyncedEntity('projetos'), null)
    await assert.rejects(() => getSyncStore().cursor('projetos'), (err) => err.status === 503)
  })

  await comAmbiente({}, async () => {
    const memoria = engenhariaStore()
    assert.ok(memoria)
    await memoria.salvarAcao('7', { acao: 'm' })
    assert.deepEqual(Object.keys(await memoria.listarAcoes()), ['7'])
    assert.equal(syncStorageConfigured(), false)
  })
})

// ---------------------------------------------------------------------------
// Mitigações de egress
// ---------------------------------------------------------------------------
test('egress: o tick só invalida o cache quando gravou alguma coisa', async () => {
  await comAmbiente({ ...SUPABASE, GRONER_SYNC_TOKEN: 'segredo-teste' }, async () => {
    let resultado
    const invalidacoes = []
    const loja = { async cursor() { return null }, async upsertChanges() { return resultado } }
    const app = express()
    app.use(express.json())
    app.use('/api/sync/groner', createSyncRouter({ store: loja, onChanged: (e) => invalidacoes.push(e), buscarGroner: async () => ({ list: [] }) }))
    const servidor = app.listen(0, '127.0.0.1')
    await new Promise((r) => servidor.once('listening', r))
    const base = `http://127.0.0.1:${servidor.address().port}/api/sync/groner`
    const tick = () => fetch(`${base}/projetos/tick?key=segredo-teste`)
    try {
      resultado = { ok: true, runId: 'tick-1', received: 3, inserted: 0, updated: 0, unchanged: 3, skipped: false }
      assert.equal((await tick()).status, 200)
      resultado = { ok: true, runId: 'tick-2', skipped: true, reason: 'sync_locked' }
      assert.equal((await tick()).status, 200)
      assert.deepEqual(invalidacoes, [])
      resultado = { ok: true, runId: 'tick-3', received: 3, inserted: 0, updated: 1, unchanged: 2, skipped: false }
      assert.equal((await tick()).status, 200)
      assert.deepEqual(invalidacoes, ['projetos'])
    } finally {
      servidor.close()
    }
  })
})
