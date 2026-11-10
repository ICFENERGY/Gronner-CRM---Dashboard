import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { createPgSql, ehNeon, pgUrl, schemaDoAmbiente, TABELA_SQL } from '../server/pgSql.js'
import { createPgSyncStore } from '../server/pgSyncStore.js'
import { sqlParaSchema, validarSchema } from '../server/sqlSchema.js'

const SQL_BASE = fs.readFileSync(new URL('../neon/dashboard-gronner-crm.sql', import.meta.url), 'utf8')

/** Executa o corpo com DB_SCHEMA definido e restaura o ambiente depois. */
async function comSchema(schema, corpo) {
  const anterior = process.env.DB_SCHEMA
  if (schema === undefined) delete process.env.DB_SCHEMA
  else process.env.DB_SCHEMA = schema
  try { return await corpo() } finally {
    if (anterior === undefined) delete process.env.DB_SCHEMA
    else process.env.DB_SCHEMA = anterior
  }
}

test('schema: padrão public; DB_SCHEMA troca a tabela; nome inválido é recusado', async () => {
  await comSchema(undefined, () => assert.equal(`${TABELA_SQL}`, '"public"."DASHBOARD-GRONNER-CRM"'))
  await comSchema('groner_painel', () => assert.equal(`${TABELA_SQL}`, '"groner_painel"."DASHBOARD-GRONNER-CRM"'))
  for (const ruim of ['Public', 'a-b', 'x; drop table y', '1abc', 'a'.repeat(64), 'com espaço']) {
    await comSchema(ruim, () => assert.throws(() => schemaDoAmbiente(), /DB_SCHEMA inválido/))
  }
  assert.throws(() => validarSchema('x"; drop'), /inválido/)
})

test('conexão: SUPABASE_DB_URL tem prioridade; Neon usa o driver da Neon e o resto usa o driver padrão', () => {
  assert.equal(pgUrl({ SUPABASE_DB_URL: 'a', NEON_DATABASE_URL: 'b', DATABASE_URL: 'c' }), 'a')
  assert.equal(pgUrl({ NEON_DATABASE_URL: 'b', DATABASE_URL: 'c' }), 'b')
  assert.equal(pgUrl({ DATABASE_URL: 'c' }), 'c')
  assert.equal(ehNeon('postgresql://u:p@ep-x-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require'), true)
  assert.equal(ehNeon('postgresql://u:p@aws-0-sa-east-1.pooler.supabase.com:5432/postgres'), false)
})

test('SQL por schema: troca todo public., cria o schema e liga a RLS; nada sobra no public', async () => {
  const sql = sqlParaSchema(SQL_BASE, 'groner_painel')
  assert.match(sql, /create schema if not exists "groner_painel"/)
  assert.doesNotMatch(sql, /\bpublic\./)
  assert.match(sql, /enable row level security/)
  assert.throws(() => sqlParaSchema(SQL_BASE, 'Ruim'), /inválido/)
})

test('schema próprio no PGlite: tabela, funções e o armazenamento funcionam e o public fica vazio', async () => {
  const db = new PGlite()
  const sql = sqlParaSchema(SQL_BASE, 'groner_painel')
  await db.exec(sql)
  await db.exec(sql) // idempotência

  const naoPublic = await db.query("select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name = 'DASHBOARD-GRONNER-CRM'")
  assert.equal(naoPublic.rows[0].n, 0)
  const funcoesPublic = await db.query("select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and proname like 'dashboard_crm_%'")
  assert.equal(funcoesPublic.rows[0].n, 0)
  const rls = await db.query("select c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'groner_painel' and c.relname = 'DASHBOARD-GRONNER-CRM'")
  assert.equal(rls.rows[0].rls, true)

  await comSchema('groner_painel', async () => {
    const executar = async (texto, parametros = []) => (await db.query(texto, parametros)).rows
    const pg = createPgSql({ executar, esperaRetentativaMs: 1, log: () => {} })
    const store = createPgSyncStore(pg)

    await pg.upsert([{ tipo: 'config', entidade: 'vendas', chave: 'meta:teste', dados: { ok: 1 } }])
    const linhas = await pg.todas('config', 'vendas')
    assert.deepEqual(linhas.map((l) => l.chave), ['meta:teste'])

    // função dashboard_crm_* no schema próprio (carga completa: lote + finalização)
    const lote = { runId: 'projetos-20261110T100000Z', runStartedAt: '2026-11-10T10:00:00.000Z', entity: 'projetos', batchIndex: 1, batchCount: 1, expectedTotal: 2, items: [{ id: 1, nome: 'A' }, { id: 2, nome: 'B' }] }
    const r = await store.upsertBatch(lote, (i) => i)
    assert.equal(r.inserted, 2)
    const fim = await store.finalize({ entity: 'projetos', runId: 'projetos-20261110T100000Z', runStartedAt: lote.runStartedAt, batchCount: 1, expectedTotal: 2 })
    assert.equal(fim.ok, true)
    const lidos = await store.load('projetos')
    assert.equal(lidos.items.length, 2)
  })

  const emPublic = await db.query("select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name = 'DASHBOARD-GRONNER-CRM'")
  assert.equal(emPublic.rows[0].n, 0) // continua sem nada no public
})
