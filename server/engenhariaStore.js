/**
 * Armazenamento da Engenharia: ações combinadas na reunião (uma ativa por card,
 * com histórico curto) e prazos por marco. Fica no Postgres/Neon ou no Supabase (tabela
 * "DASHBOARD-GRONNER-CRM") ou, se só o Upstash estiver configurado, no Redis
 * da sincronização, com prefixo próprio.
 *
 * Sem nenhum dos dois configurado, usa memória só fora da Vercel (desenvolvimento
 * local); em produção as escritas respondem 503, para nunca fingir que salvou.
 */
import { MARCOS } from '../shared/engenharia.js'
import { armazenamentoSync, getRedis } from './syncStore.js'
import { getSupabaseRest } from './supabaseRest.js'
import { createSupabaseEngenhariaStore } from './supabaseEngenhariaStore.js'
import { getPgSql } from './pgSql.js'
import { createPgEngenhariaStore } from './pgEngenhariaStore.js'

const PREFIX = 'groner-dashboard:engenharia:v1'
const K = {
  acoes: `${PREFIX}:acoes`,
  log: (id) => `${PREFIX}:acoes-log:${id}`,
  config: `${PREFIX}:config`,
}
const LOG_MAX = 20
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/

const limpa = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

function erro(status, message) {
  return Object.assign(new Error(message), { status })
}

/** Valida e normaliza a ação vinda do formulário. */
export function validarAcao(body) {
  const acao = limpa(body?.acao, 280)
  const dono = limpa(body?.dono, 80)
  const prazo = limpa(body?.prazo, 10)
  if (!acao) throw erro(400, 'Informe o que será feito')
  if (!dono) throw erro(400, 'Informe o responsável')
  if (!DATA_ISO.test(prazo) || Number.isNaN(Date.parse(prazo))) throw erro(400, 'Informe o prazo (AAAA-MM-DD)')
  return { acao, dono, prazo }
}

/** Valida prazos por marco (1–120 dias) e meta de entrega (10–365). */
export function validarPrazos(body) {
  const sla = {}
  for (const m of MARCOS) {
    const v = Math.round(Number(body?.sla?.[m.k]))
    if (!Number.isFinite(v) || v < 1 || v > 120) throw erro(400, `Prazo inválido no marco ${m.k} (1 a 120 dias)`)
    sla[m.k] = v
  }
  const metaEntrega = Math.round(Number(body?.metaEntrega))
  if (!Number.isFinite(metaEntrega) || metaEntrega < 10 || metaEntrega > 365) throw erro(400, 'Meta de entrega inválida (10 a 365 dias)')
  return { sla, metaEntrega }
}

function memoria() {
  const acoes = new Map()
  const logs = new Map()
  let config = null
  return {
    async listarAcoes() { return Object.fromEntries(acoes) },
    async salvarAcao(id, registro) {
      acoes.set(id, registro)
      logs.set(id, [registro, ...(logs.get(id) ?? [])].slice(0, LOG_MAX))
      return registro
    },
    async obterAcao(id) { return acoes.get(id) ?? null },
    async historico(id) { return logs.get(id) ?? [] },
    async obterConfig() { return config },
    async salvarConfig(c) { config = c; return c },
  }
}

const parse = (v) => (v == null ? null : typeof v === 'string' ? JSON.parse(v) : v)

function redisStore(redis) {
  return {
    async listarAcoes() {
      const all = (await redis.hgetall(K.acoes)) ?? {}
      return Object.fromEntries(Object.entries(all).map(([id, v]) => [id, parse(v)]))
    },
    async salvarAcao(id, registro) {
      const json = JSON.stringify(registro)
      await redis.multi().hset(K.acoes, { [id]: json }).lpush(K.log(id), json).ltrim(K.log(id), 0, LOG_MAX - 1).exec()
      return registro
    },
    async obterAcao(id) { return parse(await redis.hget(K.acoes, id)) },
    async historico(id) { return ((await redis.lrange(K.log(id), 0, LOG_MAX - 1)) ?? []).map(parse) },
    async obterConfig() { return parse(await redis.get(K.config)) },
    async salvarConfig(c) { await redis.set(K.config, JSON.stringify(c)); return c },
  }
}

let memoriaLocal

/** Postgres/Neon (se DATABASE_URL) -> Supabase (se SUPABASE_URL + SUPABASE_SECRET_KEY) -> Redis (Upstash) -> memória (só fora da Vercel) -> null. */
export function engenhariaStore() {
  const armazenamento = armazenamentoSync()
  if (armazenamento === 'postgres') return createPgEngenhariaStore(getPgSql())
  if (armazenamento === 'supabase') return createSupabaseEngenhariaStore(getSupabaseRest())
  const redis = armazenamento === 'redis' ? getRedis() : null
  if (redis) return redisStore(redis)
  if (process.env.VERCEL) return null
  memoriaLocal ??= memoria()
  return memoriaLocal
}

/** Para testes: store em memória isolado. */
export function criarStoreMemoria() {
  return memoria()
}
