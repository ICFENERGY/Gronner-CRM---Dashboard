import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { createPgSql, getPgSql, pgConfigured, TABELA_SQL } from '../server/pgSql.js'
import { createPgSyncStore } from '../server/pgSyncStore.js'
import { createPgEngenhariaStore } from '../server/pgEngenhariaStore.js'
import { armazenamentoSync, getSyncStatuses, getSyncStore, loadSyncedEntity, syncStorageConfigured } from '../server/syncStore.js'
import { engenhariaStore } from '../server/engenhariaStore.js'

const SQL = fs.readFileSync(new URL('../neon/dashboard-gronner-crm.sql', import.meta.url), 'utf8')
const URL_BD = 'postgresql://usuario:SENHA_DE_TESTE_123@ep-teste-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require'

// ---------------------------------------------------------------------------
// Banco: PGlite (Postgres em memória) com o SQL real do Neon, aplicado DUAS vezes.
// ---------------------------------------------------------------------------
async function criarBanco({ tamanhoPagina } = {}) {
  const db = new PGlite()
  await db.exec(SQL)
  await db.exec(SQL) // idempotência do arquivo
  const consultas = []
  const executar = async (texto, parametros = []) => {
    consultas.push({ texto, parametros })
    return (await db.query(texto, parametros)).rows
  }
  const pg = createPgSql({ executar, tamanhoPagina, esperaRetentativaMs: 1, log: () => {} })
  return {
    db, pg, consultas,
    store: createPgSyncStore(pg),
    linhas: async (tipo, entidade) => (await db.query(
      `select tipo, entidade, chave, dados, hash, ativo, expira_em from ${TABELA_SQL} where tipo = $1 and ($2::text is null or entidade = $2) order by chave`,
      [tipo, entidade ?? null],
    )).rows,
    // Avança o "relógio" do banco: faz todas as travas valerem como vencidas.
    vencerTravas: () => db.exec(`update ${TABELA_SQL} set expira_em = now() - interval '1 second' where tipo = 'trava'`),
    semear: (linhas) => pg.upsert(linhas),
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

// ---------------------------------------------------------------------------
// 0. SQL
// ---------------------------------------------------------------------------
test('pg: neon/dashboard-gronner-crm.sql roda duas vezes no PGlite e cria a tabela e as funções', async () => {
  const { db } = await criarBanco()
  const funcoes = (await db.query("select proname from pg_proc where proname like 'dashboard_crm_%' order by 1")).rows.map((r) => r.proname)
  assert.deepEqual(funcoes, [
    'dashboard_crm_finalizar', 'dashboard_crm_liberar', 'dashboard_crm_limpar_expirados',
    'dashboard_crm_salvar_acao', 'dashboard_crm_tocar', 'dashboard_crm_travar',
  ])
  const tabela = await db.query("select count(*)::int as n from information_schema.tables where table_name = 'DASHBOARD-GRONNER-CRM'")
  assert.equal(tabela.rows[0].n, 1)
  // restrições da tabela
  await assert.rejects(() => db.query(`insert into ${TABELA_SQL} (tipo, entidade, chave) values ('invalido', 'projetos', 'x')`))
  await assert.rejects(() => db.query(`insert into ${TABELA_SQL} (tipo, entidade, chave) values ('registro', 'outra', 'x')`))
})

// ---------------------------------------------------------------------------
// 1. Carga completa
// ---------------------------------------------------------------------------
test('pg: carga completa idempotente, publica na finalização, segunda carga igual e carga menor com soft delete', async () => {
  const { store, linhas } = await criarBanco()
  const primeira = lote('projetos-20261005T110000Z', [{ id: 1, etapa: 'Novo' }, { id: 2, etapa: 'Proposta' }])
  const r1 = await store.upsertBatch(primeira, igualdade)
  assert.deepEqual(contagens(r1), { inserted: 2, updated: 0, unchanged: 0 })
  assert.deepEqual(await store.upsertBatch(primeira, igualdade), r1)
  assert.equal(await store.load('projetos'), null) // nada publicado antes da finalização

  const final1 = await store.finalize(primeira)
  assert.equal(final1.activeTotal, 2)
  assert.equal(final1.softDeleted, 0)
  assert.deepEqual(contagens(final1), { inserted: 2, updated: 0, unchanged: 0 })
  assert.equal((await linhas('lote')).length, 0) // lotes apagados pela finalização
  assert.equal((await linhas('trava')).length, 0)
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
  // o registro removido continua na tabela, só inativo
  const todos = await linhas('registro', 'projetos')
  assert.deepEqual(todos.map((r) => [r.chave, r.ativo]), [['1', true], ['2', false]])
})

test('pg: registro com hash igual não é regravado (atualizado_em não muda)', async () => {
  const { store, db } = await criarBanco()
  const primeira = lote('projetos-20261005T110000Z', [{ id: 1, etapa: 'A' }, { id: 2, etapa: 'B' }])
  await store.upsertBatch(primeira, igualdade)
  await store.finalize(primeira)
  const carimbos = async () => (await db.query(`select chave, atualizado_em::text as t from ${TABELA_SQL} where tipo = 'registro' order by chave`)).rows

  const antes = await carimbos()
  const igual = lote('projetos-20261005T180000Z', [{ id: 1, etapa: 'A' }, { id: 2, etapa: 'B2' }], { runStartedAt: '2026-10-05T21:00:00.000Z' })
  await store.upsertBatch(igual, igualdade)
  await store.finalize(igual)
  const depois = await carimbos()
  assert.equal(depois[0].t, antes[0].t) // hash igual: intocado
  assert.notEqual(depois[1].t, antes[1].t) // mudou: regravado
})

// ---------------------------------------------------------------------------
// 2. Recusas da finalização
// ---------------------------------------------------------------------------
test('pg: finalização recusa lote faltando, IDs duplicados e carga mais antiga (409), e repetir devolve o mesmo final', async () => {
  const { store, vencerTravas } = await criarBanco()
  const faltando = lote('projetos-20261005T110000Z', [{ id: 1 }], { batchCount: 2 })
  await store.upsertBatch(faltando, igualdade)
  await assert.rejects(() => store.finalize(faltando), (err) => err.status === 409 && /Nem todos os lotes/.test(err.message))
  await vencerTravas() // a trava de atividade da carga que falhou vence

  const dup1 = lote('projetos-20261005T120000Z', [{ id: 7 }], { batchIndex: 1, batchCount: 2, expectedTotal: 2 })
  const dup2 = lote(dup1.runId, [{ id: 7 }], { batchIndex: 2, batchCount: 2, expectedTotal: 2 })
  await store.upsertBatch(dup1, igualdade)
  await store.upsertBatch(dup2, igualdade)
  await assert.rejects(() => store.finalize(dup1), (err) => err.status === 409 && /IDs duplicados entre lotes/.test(err.message))
  await vencerTravas()

  const nova = lote('projetos-20261006T080000Z', [{ id: 1 }], { runStartedAt: '2026-10-06T11:00:00.000Z' })
  await store.upsertBatch(nova, igualdade)
  const publicada = await store.finalize(nova)
  assert.deepEqual(await store.finalize(nova), publicada) // idempotente

  const antiga = lote('projetos-20261004T080000Z', [{ id: 2 }], { runStartedAt: '2026-10-04T11:00:00.000Z' })
  await store.upsertBatch(antiga, igualdade)
  await assert.rejects(() => store.finalize(antiga), (err) => err.status === 409 && /mais nova/.test(err.message))

  await assert.rejects(() => store.finalize({ ...nova, batchCount: 0 }), (err) => err.status === 400 && /batchCount/.test(err.message))
})

test('pg: total esperado divergente é recusado com 409', async () => {
  const { store } = await criarBanco()
  const divergente = lote('projetos-20261005T110000Z', [{ id: 1 }, { id: 2 }])
  await store.upsertBatch(divergente, igualdade)
  await assert.rejects(() => store.finalize({ ...divergente, expectedTotal: 3 }), (err) => err.status === 409 && /incompleta ou metadados inconsistentes/.test(err.message))
  assert.equal(await store.load('projetos'), null)
})

// ---------------------------------------------------------------------------
// 3. Incremental
// ---------------------------------------------------------------------------
test('pg: incremental conta, grava histórico, só avança o cursor com sucesso, é idempotente e respeita trava full', async () => {
  const { pg, store, linhas, vencerTravas } = await criarBanco()
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
  assert.equal((await linhas('trava')).length, 0) // trava solta no finally
  assert.deepEqual(await store.upsertChanges(mudanca, igualdade), primeira) // repetição
  const carregado = await store.load('projetos')
  assert.equal(carregado.items.length, 2)
  assert.equal(carregado.items.find((i) => i.id === 1).etapa, 'Etapa C')
  assert.equal(carregado.items.find((i) => i.id === 1).historicoStatus.length, 1)
  assert.equal(carregado.items.find((i) => i.id === 2).historicoStatus.length, 0)

  // incremental sem cursor novo mantém o cursor guardado
  const semCursor = await store.upsertChanges({ ...mudanca, runId: 'changes-20261005T111500Z', nextCursor: undefined, items: [] }, igualdade)
  assert.equal(semCursor.nextCursor, mudanca.nextCursor)

  await pg.funcao('dashboard_crm_travar', [['projetos', 'text'], ['atividade', 'text'], ['full:outro-run', 'text'], [240, 'integer']])
  const pulado = await store.upsertChanges({ ...mudanca, runId: 'changes-20261005T112000Z', nextCursor: '2026-10-05T11:20:00.000Z' }, igualdade)
  assert.equal(pulado.skipped, true)
  assert.equal(pulado.reason, 'sync_locked')
  assert.equal(await store.cursor('projetos'), mudanca.nextCursor)

  // trava vencida deixa de bloquear
  await vencerTravas()
  const depois = await store.upsertChanges({ ...mudanca, runId: 'changes-20261005T113000Z', nextCursor: '2026-10-05T11:30:00.000Z' }, igualdade)
  assert.equal(depois.skipped, false)
  assert.equal(await store.cursor('projetos'), '2026-10-05T11:30:00.000Z')
})

test('pg: incremental de projeto novo conta como inserido e não cria histórico', async () => {
  const { store, linhas } = await criarBanco()
  const r = await store.upsertChanges({
    entity: 'projetos', runId: 'changes-20261005T111000Z', runStartedAt: '2026-10-05T11:10:00.000Z',
    nextCursor: '2026-10-05T11:10:00.000Z', items: [{ id: 5, etapa: 'Nova' }],
  }, igualdade)
  assert.deepEqual(contagens(r), { inserted: 1, updated: 0, unchanged: 0 })
  assert.equal((await linhas('historico')).length, 0)
})

test('pg: carga completa recusa começar durante incremental ou outra carga', async () => {
  const { pg, store } = await criarBanco()
  const entrada = lote('projetos-20261005T110000Z', [{ id: 1 }])
  const args = (dono) => [['projetos', 'text'], ['atividade', 'text'], [dono, 'text'], [240, 'integer']]
  await pg.funcao('dashboard_crm_travar', args('changes:changes-20261005T105900Z'))
  await assert.rejects(() => store.upsertBatch(entrada, igualdade), (err) => err.status === 409 && /incremental em andamento/.test(err.message))
  await pg.funcao('dashboard_crm_liberar', [['projetos', 'text'], ['atividade', 'text'], ['changes:changes-20261005T105900Z', 'text']])
  await pg.funcao('dashboard_crm_travar', args('full:projetos-20260101T000000Z'))
  await assert.rejects(() => store.upsertBatch(entrada, igualdade), (err) => err.status === 409 && /Outra sincronização/.test(err.message))
})

// ---------------------------------------------------------------------------
// 4. Trava de lote
// ---------------------------------------------------------------------------
test('pg: lote já em processamento dá 409 e a trava é solta mesmo quando a normalização lança erro', async () => {
  const { pg, store, linhas, vencerTravas } = await criarBanco()
  const entrada = lote('projetos-20261005T110000Z', [{ id: 1, etapa: 'A' }])
  await pg.funcao('dashboard_crm_travar', [['projetos', 'text'], [`lote:${entrada.runId}:1`, 'text'], ['outro-processo', 'text'], [120, 'integer']])
  await assert.rejects(() => store.upsertBatch(entrada, igualdade), (err) => err.status === 409 && err.message === 'Lote já está sendo processado')
  await vencerTravas() // a trava vence sozinha

  const travasDeLote = async () => (await linhas('trava')).filter((l) => l.chave.startsWith('lote:')).length
  await assert.rejects(() => store.upsertBatch(entrada, () => { throw new Error('normalização quebrou') }), /normalização quebrou/)
  assert.equal(await travasDeLote(), 0)
  assert.equal((await linhas('lote')).length, 0)
  const ok = await store.upsertBatch(entrada, igualdade)
  assert.equal(ok.inserted, 1)
  assert.equal(await travasDeLote(), 0)

  await assert.rejects(() => store.upsertBatch(lote('projetos-20261005T110000Z', [{ id: 1 }, { id: 1 }], { batchIndex: 2, batchCount: 2 }), igualdade), (err) => err.status === 400 && /duplicados/.test(err.message))
})

// ---------------------------------------------------------------------------
// 5. load pagina e junta histórico
// ---------------------------------------------------------------------------
test('pg: load pagina por chave com limite pequeno, junta histórico e reaproveita a leitura quando nada mudou', async () => {
  const { pg, store, consultas, semear } = await criarBanco({ tamanhoPagina: 3 })
  const linhasSemente = []
  for (let id = 1; id <= 8; id += 1) linhasSemente.push({ tipo: 'registro', entidade: 'projetos', chave: String(id), dados: { id, etapa: id === 2 ? 'Nova' : 'X' }, hash: `h${id}` })
  linhasSemente.push({ tipo: 'registro', entidade: 'projetos', chave: '9', dados: { id: 9, etapa: 'Velha' }, hash: 'h9', ativo: false })
  linhasSemente.push({ tipo: 'historico', entidade: 'projetos', chave: '2', dados: [{ id: 2, statusAnterior: 'X', statusNovo: 'Nova', em: '2026-10-01T00:00:00.000Z' }] })
  linhasSemente.push({ tipo: 'estado', entidade: 'projetos', chave: 'current', dados: { entity: 'projetos', runId: 'projetos-20261001T000000Z', finishedAt: '2026-10-01T00:00:00.000Z' } })
  await semear(linhasSemente)

  const carregado = await store.load('projetos')
  assert.deepEqual(carregado.items.map((i) => i.id), [1, 2, 3, 4, 5, 6, 7, 8]) // o inativo (9) fica de fora
  assert.equal(carregado.items[1].dataEntradaMarco, '2026-10-01T00:00:00.000Z')
  assert.equal(carregado.items[1].dataEntradaMarcoEstimada, false)
  assert.equal(carregado.items[0].dataEntradaMarcoEstimada, true)
  const paginas = () => consultas.filter((c) => /and ativo/.test(c.texto)).length
  assert.equal(paginas(), 3) // 3 + 3 + 2 linhas

  assert.equal(await store.load('projetos'), carregado) // sem mudança: mesma carga, sem baixar de novo
  assert.equal(paginas(), 3)

  await pg.upsert([{ tipo: 'registro', entidade: 'projetos', chave: '3', dados: { id: 3, etapa: 'Mudou' }, hash: 'h3b', ativo: true }])
  const recarregado = await store.load('projetos')
  assert.equal(recarregado.items.find((i) => i.id === 3).etapa, 'Mudou')
  assert.equal(paginas(), 6)
  assert.equal(await createPgSyncStore(pg).load('tarefas'), null)
})

test('pg: load pagina mais de 1000 registros e só projetos leem histórico; nunca usa select *', async () => {
  const { db, store, consultas } = await criarBanco()
  await db.exec(`insert into ${TABELA_SQL} (tipo, entidade, chave, dados, hash)
    select 'registro', 'vendas', g::text, jsonb_build_object('id', g), 'h' || g from generate_series(1, 2300) as g`)
  await db.exec(`insert into ${TABELA_SQL} (tipo, entidade, chave, dados)
    values ('estado', 'vendas', 'current', '{"entity":"vendas","runId":"vendas-20261001T000000Z","finishedAt":"2026-10-01T00:00:00.000Z"}')`)
  const carregado = await store.load('vendas')
  assert.equal(carregado.totalItems, 2300)
  assert.equal(new Set(carregado.items.map((i) => i.id)).size, 2300)
  assert.equal(consultas.filter((c) => /and ativo/.test(c.texto)).length, 3) // 1000 + 1000 + 300
  assert.equal(consultas.some((c) => /tipo = \$1/.test(c.texto) && c.parametros[0] === 'historico'), false)
  assert.equal(consultas.some((c) => /select \*/i.test(c.texto)), false)
})

// ---------------------------------------------------------------------------
// 6. Mapeamento de erros e limpeza
// ---------------------------------------------------------------------------
test('pg: erros PT409/PT400 viram {status, message}, falhas viram 503 genérico e a conexão nunca aparece', async () => {
  const logs = []
  const criar = (executar, extras = {}) => createPgSql({ executar, esperaRetentativaMs: 1, log: (...a) => logs.push(a.join(' ')), ...extras })
  const erroSql = (code, message) => Object.assign(new Error(message), { code })

  const negocio = criar(async () => { throw erroSql('PT409', 'Nem todos os lotes foram recebidos') })
  await assert.rejects(() => negocio.funcao('dashboard_crm_finalizar', []), (err) => err.status === 409 && err.message === 'Nem todos os lotes foram recebidos')
  const requisicao = criar(async () => { throw erroSql('PT400', 'Card inválido') })
  await assert.rejects(() => requisicao.funcao('dashboard_crm_salvar_acao', []), (err) => err.status === 400 && err.message === 'Card inválido')

  let chamadas = 0
  const quebrado = criar(async () => { chamadas += 1; throw erroSql('08006', `falha de conexão com ${URL_BD}`) })
  await assert.rejects(() => quebrado.rows('select 1'), (err) => {
    assert.equal(err.status, 503)
    assert.equal(err.message, 'Armazenamento de sincronização indisponível')
    assert.equal(JSON.stringify({ ...err, message: err.message }).includes('SENHA_DE_TESTE'), false)
    return true
  })
  assert.equal(chamadas, 3) // leitura idempotente: 3 tentativas
  chamadas = 0
  await assert.rejects(() => quebrado.funcao('dashboard_crm_salvar_acao', [['1', 'text'], ['{}', 'jsonb']]), (err) => err.status === 503)
  assert.equal(chamadas, 1) // função possivelmente não idempotente: sem retentativa

  let semTabela = 0
  const erroDeSql = criar(async () => { semTabela += 1; throw erroSql('42P01', 'relation "DASHBOARD-GRONNER-CRM" does not exist') })
  await assert.rejects(() => erroDeSql.rows('select 1'), (err) => err.status === 503 && !/relation/.test(err.message))
  assert.equal(semTabela, 1) // erro de SQL/estrutura não é repetido

  const rede = criar(async () => { throw new TypeError(`fetch failed ${URL_BD}`) })
  await assert.rejects(() => rede.rows('select 1'), (err) => err.status === 503 && !err.message.includes('SENHA_DE_TESTE'))

  const lento = criar((_texto, _params, { signal }) => new Promise((_, rejeitar) => signal.addEventListener('abort', () => rejeitar(signal.reason))), { timeoutMs: 20 })
  await assert.rejects(() => lento.rows('select 1'), (err) => err.status === 503 && err.causa === 'timeout')

  await assert.rejects(() => negocio.funcao('drop_table', []), (err) => err.status === 503) // só dashboard_crm_*
  assert.ok(logs.length >= 1)
  assert.equal(logs.some((linha) => linha.includes('SENHA_DE_TESTE')), false)
})

test('pg: limpeza oportunista remove expirados e não mexe nos válidos', async () => {
  const { db, pg } = await criarBanco()
  await db.exec(`insert into ${TABELA_SQL} (tipo, entidade, chave, dados, expira_em) values
    ('resultado', 'projetos', 'velho', '{}', now() - interval '1 hour'),
    ('resultado', 'projetos', 'novo', '{}', now() + interval '1 hour'),
    ('estado', 'projetos', 'status', '{}', null)`)
  assert.equal(await pg.funcao('dashboard_crm_limpar_expirados'), 1)
  const restantes = (await db.query(`select chave from ${TABELA_SQL} order by chave`)).rows.map((r) => r.chave)
  assert.deepEqual(restantes, ['novo', 'status'])
})

test('pg: resultado expirado não vale como idempotência', async () => {
  const { db, store } = await criarBanco()
  const entrada = lote('projetos-20261005T110000Z', [{ id: 1, etapa: 'A' }])
  await store.upsertBatch(entrada, igualdade)
  await db.exec(`update ${TABELA_SQL} set expira_em = now() - interval '1 second' where tipo = 'resultado'`)
  const de_novo = await store.upsertBatch(entrada, igualdade) // reprocessa, não devolve o resultado vencido
  assert.equal(de_novo.received, 1)
})

// ---------------------------------------------------------------------------
// 7. Engenharia
// ---------------------------------------------------------------------------
test('pg: engenharia guarda ação ativa, histórico de 20 (mais nova primeiro) e prazos', async () => {
  const { pg, linhas } = await criarBanco()
  const store = createPgEngenhariaStore(pg)
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
  assert.equal((await linhas('config')).length, 1)

  await assert.rejects(() => store.salvarAcao('abc', { acao: 'x' }), (err) => err.status === 400 && err.message === 'Card inválido')
})

// ---------------------------------------------------------------------------
// 8. Seleção do armazenamento
// ---------------------------------------------------------------------------
async function comAmbiente(vars, fn) {
  const chaves = [
    'DATABASE_URL', 'NEON_DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN',
    'VERCEL', 'DASHBOARD_STORAGE', 'GRONER_SYNC_TOKEN', 'ENGENHARIA_EQUIPE_TOKEN', 'ENGENHARIA_ADMIN_TOKEN',
  ]
  const salvo = Object.fromEntries(chaves.map((k) => [k, process.env[k]]))
  const fetchOriginal = globalThis.fetch
  for (const k of chaves) delete process.env[k]
  Object.assign(process.env, vars)
  try { return await fn() } finally {
    for (const k of chaves) { if (salvo[k] === undefined) delete process.env[k]; else process.env[k] = salvo[k] }
    globalThis.fetch = fetchOriginal
  }
}
const POSTGRES = { DATABASE_URL: URL_BD }
const SUPABASE = { SUPABASE_URL: 'https://exemplo.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_CHAVE_DE_TESTE_123' }
const UPSTASH = { UPSTASH_REDIS_REST_URL: 'https://exemplo.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'token' }

test('seleção: Postgres vence Supabase e Redis; DASHBOARD_STORAGE força; sem nada fica nulo', async () => {
  assert.equal(pgConfigured({ DATABASE_URL: URL_BD }), true)
  assert.equal(pgConfigured({ NEON_DATABASE_URL: URL_BD }), true)
  assert.equal(pgConfigured({}), false)
  assert.equal(armazenamentoSync({ ...POSTGRES, ...SUPABASE, ...UPSTASH }), 'postgres')
  assert.equal(armazenamentoSync({ NEON_DATABASE_URL: URL_BD, ...UPSTASH }), 'postgres')
  assert.equal(armazenamentoSync({ ...SUPABASE, ...UPSTASH }), 'supabase')
  assert.equal(armazenamentoSync(UPSTASH), 'redis')
  assert.equal(armazenamentoSync({}), null)
  assert.equal(armazenamentoSync({ ...POSTGRES, ...SUPABASE, ...UPSTASH, DASHBOARD_STORAGE: 'supabase' }), 'supabase')
  assert.equal(armazenamentoSync({ ...POSTGRES, ...UPSTASH, DASHBOARD_STORAGE: 'redis' }), 'redis')
  assert.equal(armazenamentoSync({ ...POSTGRES, DASHBOARD_STORAGE: 'postgres' }), 'postgres')
  assert.equal(armazenamentoSync({ ...SUPABASE, DASHBOARD_STORAGE: 'postgres' }), null)
  assert.equal(armazenamentoSync({ ...POSTGRES, ...UPSTASH, DASHBOARD_STORAGE: 'memoria' }), null)
  assert.equal(getPgSql({}), null)
})

test('seleção: com DATABASE_URL o dashboard usa o adaptador Postgres (via driver do Neon) em sync e Engenharia', async () => {
  await comAmbiente(POSTGRES, async () => {
    const pedidos = []
    // Resposta no formato do endpoint HTTP do Neon: { command, rowCount, rows, fields }
    globalThis.fetch = async (url, init) => {
      pedidos.push({ url: String(url), cabecalhos: init?.headers, corpo: String(init?.body ?? '') })
      return new Response(JSON.stringify({ command: 'SELECT', rowCount: 0, rows: [], fields: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    assert.equal(syncStorageConfigured(), true)
    assert.equal(getSyncStore(), getSyncStore()) // instância única (preserva o cache de versão)
    assert.equal(await loadSyncedEntity('projetos'), null)
    assert.equal(await getSyncStore().cursor('projetos'), null)
    const statuses = await getSyncStatuses()
    assert.equal(statuses.configured, true)
    assert.deepEqual(Object.keys(statuses.entities).sort(), ['projetos', 'propostas', 'tarefas', 'vendas'])
    assert.equal(await engenhariaStore().obterAcao('5'), null)
    assert.ok(pedidos.length >= 3)
    for (const p of pedidos) assert.match(p.url, /^https:\/\/[^/]*neon\.tech\/sql$/)
  })
})

test('seleção: sem armazenamento na Vercel nada é gravado; fora dela a Engenharia usa memória; DASHBOARD_STORAGE=memoria ignora o banco', async () => {
  await comAmbiente({ VERCEL: '1' }, async () => {
    assert.equal(syncStorageConfigured(), false)
    assert.equal(engenhariaStore(), null)
    assert.deepEqual(await getSyncStatuses(), { configured: false, entities: {} })
    await assert.rejects(() => getSyncStore().cursor('projetos'), (err) => err.status === 503)
  })
  await comAmbiente({ ...POSTGRES, DASHBOARD_STORAGE: 'memoria' }, async () => {
    globalThis.fetch = async () => { throw new Error('não deveria chamar o banco') }
    assert.equal(syncStorageConfigured(), false)
    const memoria = engenhariaStore()
    await memoria.salvarAcao('7', { acao: 'm' })
    assert.deepEqual(Object.keys(await memoria.listarAcoes()), ['7'])
  })
})
