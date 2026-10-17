/**
 * Aplica neon/dashboard-gronner-crm.sql no Postgres do Neon e confere o resultado.
 *
 * Uso (a string de conexão vem do ambiente; nunca é impressa):
 *   DATABASE_URL="postgresql://..." node scripts/aplicar-sql-neon.mjs
 * (com `node --env-file=.env scripts/aplicar-sql-neon.mjs` também funciona)
 *
 * O SQL é idempotente: pode rodar de novo sem perder dados. Usa o driver
 * serverless do Neon em modo Pool (WebSocket), que aceita várias instruções
 * numa transação. Imprime só nomes e contagens.
 */
import fs from 'node:fs'
import { Pool, neonConfig } from '@neondatabase/serverless'

const url = String(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || '').trim()
if (!url) {
  console.error('Defina DATABASE_URL (string de conexão do Neon, com sslmode=require).')
  process.exit(1)
}

const arquivo = new URL('../neon/dashboard-gronner-crm.sql', import.meta.url)
const sql = fs.readFileSync(arquivo, 'utf8')
const FUNCOES = [
  'dashboard_crm_finalizar', 'dashboard_crm_liberar', 'dashboard_crm_limpar_expirados',
  'dashboard_crm_salvar_acao', 'dashboard_crm_tocar', 'dashboard_crm_travar',
]

// Node 22+ já tem WebSocket global; em versões antigas, instale `ws` e atribua-o aqui.
if (typeof WebSocket === 'function') neonConfig.webSocketConstructor = WebSocket
const pool = new Pool({ connectionString: url })
let codigoSaida = 0
try {
  // Várias instruções (begin ... commit) numa só chamada: protocolo simples, sem parâmetros.
  await pool.query(sql)
  console.log('SQL aplicado: neon/dashboard-gronner-crm.sql')

  const tabela = await pool.query(
    "select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name = 'DASHBOARD-GRONNER-CRM'",
  )
  const funcoes = await pool.query(
    "select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and proname like 'dashboard\\_crm\\_%' order by 1",
  )
  const linhas = await pool.query('select count(*)::int as n from public."DASHBOARD-GRONNER-CRM"')
  const nomes = funcoes.rows.map((r) => r.proname)
  const faltando = FUNCOES.filter((f) => !nomes.includes(f))

  console.log(`Tabela "DASHBOARD-GRONNER-CRM": ${tabela.rows[0].n === 1 ? 'existe' : 'AUSENTE'} (${linhas.rows[0].n} linhas)`)
  console.log(`Funções dashboard_crm_*: ${nomes.length} (${nomes.join(', ')})`)
  if (tabela.rows[0].n !== 1 || faltando.length) {
    console.error(`Conferência falhou. Funções ausentes: ${faltando.join(', ') || 'nenhuma'}`)
    codigoSaida = 1
  } else {
    console.log('Conferência ok.')
  }
} catch (err) {
  // Só código SQLSTATE e mensagem do banco; a string de conexão nunca é impressa.
  console.error(`Falha ao aplicar o SQL${err?.code ? ` (SQLSTATE ${err.code})` : ''}: ${String(err?.message ?? err).replaceAll(url, '[conexão]')}`)
  codigoSaida = 1
} finally {
  await pool.end().catch(() => {})
}
process.exit(codigoSaida)
