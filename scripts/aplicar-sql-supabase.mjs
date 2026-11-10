/**
 * Cria (ou atualiza) no Postgres do Supabase o schema, a tabela "DASHBOARD-GRONNER-CRM" e as funções dashboard_crm_*,
 * e confere o resultado. É idempotente: pode rodar de novo sem perder dados.
 *
 * Uso (a conexão vem do ambiente e nunca é impressa):
 *   node --env-file=.env scripts/aplicar-sql-supabase.mjs
 * Variáveis: SUPABASE_DB_URL (conexão direta/pooler do Postgres), DB_SCHEMA (padrão groner_painel neste script),
 * DB_CA_CERT ou server/data/db-ca.pem (certificado PÚBLICO da CA, se o padrão do Node não reconhecer o servidor).
 * O certificado do servidor é sempre validado.
 */
import fs from 'node:fs'
import pg from 'pg'
import { sqlParaSchema } from '../server/sqlSchema.js'

const url = String(process.env.SUPABASE_DB_URL || '').trim()
const schema = String(process.env.DB_SCHEMA || 'groner_painel').trim()
if (!url) {
  console.error('Defina SUPABASE_DB_URL (conexão do Postgres do Supabase).')
  process.exit(1)
}

const FUNCOES = [
  'dashboard_crm_finalizar', 'dashboard_crm_liberar', 'dashboard_crm_limpar_expirados',
  'dashboard_crm_salvar_acao', 'dashboard_crm_tocar', 'dashboard_crm_travar',
]

function certificadoCa() {
  if (process.env.DB_CA_CERT) return String(process.env.DB_CA_CERT).replace(/\\n/g, '\n')
  try { return fs.readFileSync(new URL('../server/data/db-ca.pem', import.meta.url), 'utf8') } catch { return undefined }
}

const sqlBase = fs.readFileSync(new URL('../neon/dashboard-gronner-crm.sql', import.meta.url), 'utf8')
const sql = sqlParaSchema(sqlBase, schema)

const limpa = new URL(url)
limpa.searchParams.delete('sslmode')
const cliente = new pg.Client({ connectionString: limpa.toString(), ssl: { rejectUnauthorized: true, ca: certificadoCa() }, connectionTimeoutMillis: 15000 })
const censura = (t) => String(t).replaceAll(url, '[conexão]').replace(/:\/\/[^@\s]*@/g, '://[credenciais]@')

let saida = 0
try {
  await cliente.connect()
  await cliente.query(sql) // várias instruções (begin ... commit): protocolo simples, sem parâmetros
  console.log(`SQL aplicado no schema "${schema}".`)

  const tabela = await cliente.query(
    'select count(*)::int as n from information_schema.tables where table_schema = $1 and table_name = $2', [schema, 'DASHBOARD-GRONNER-CRM'],
  )
  const funcoes = await cliente.query(
    "select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = $1 and proname like 'dashboard\\_crm\\_%' order by 1", [schema],
  )
  const linhas = await cliente.query(`select count(*)::int as n from "${schema}"."DASHBOARD-GRONNER-CRM"`)
  const rls = await cliente.query(
    "select c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = $1 and c.relname = 'DASHBOARD-GRONNER-CRM'", [schema],
  )
  const nomes = funcoes.rows.map((r) => r.proname)
  const faltando = FUNCOES.filter((f) => !nomes.includes(f))
  console.log(`Tabela: ${tabela.rows[0].n === 1 ? 'existe' : 'AUSENTE'} (${linhas.rows[0].n} linhas) | RLS: ${rls.rows[0]?.rls ? 'ligada' : 'DESLIGADA'}`)
  console.log(`Funções dashboard_crm_*: ${nomes.length} (${nomes.join(', ')})`)
  if (tabela.rows[0].n !== 1 || faltando.length || !rls.rows[0]?.rls) {
    console.error(`Conferência falhou. Funções ausentes: ${faltando.join(', ') || 'nenhuma'}`)
    saida = 1
  } else {
    console.log('Conferência ok.')
  }
} catch (err) {
  console.error(`Falha${err?.code ? ` (${err.code})` : ''}: ${censura(err?.message ?? err)}`)
  saida = 1
} finally {
  await cliente.end().catch(() => {})
}
process.exit(saida)
