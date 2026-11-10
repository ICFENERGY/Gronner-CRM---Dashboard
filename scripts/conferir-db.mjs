/**
 * Conferência da carga: quantos registros ativos cada entidade tem no banco do painel. Só leitura; imprime só contagens.
 * Uso: node --env-file=.env scripts/conferir-db.mjs
 */
import { getPgSql, schemaDoAmbiente, TABELA_SQL } from '../server/pgSql.js'

const pg = getPgSql()
if (!pg) { console.error('Sem conexão com o banco'); process.exit(1) }
const linhas = await pg.rows(
  `select entidade, count(*) filter (where tipo = 'registro' and ativo)::int as registros_ativos, count(*)::int as linhas_totais
     from ${TABELA_SQL} group by entidade order by entidade`,
)
console.log(`Schema: ${schemaDoAmbiente()}`)
for (const l of linhas) console.log(`${String(l.entidade).padEnd(16)} registros ativos: ${String(l.registros_ativos).padStart(5)}   linhas: ${l.linhas_totais}`)
if (!linhas.length) { console.error('Tabela vazia.'); process.exit(1) }
