/**
 * Importa para o banco do painel os dias antigos do farol diário que só existiam num print
 * (server/data/farol-historico-print.json). Cada dia entra marcado como `estimado: true`.
 * Nunca sobrescreve um dia que já tem captura real da API. Seguro repetir.
 * Uso: node scripts/importar-farol-historico.mjs   (precisa da conexão do banco: SUPABASE_DB_URL / DB_SCHEMA)
 * Imprime só as datas e contagens.
 */
import { readFileSync } from 'node:fs'
import { getPgSql } from '../server/pgSql.js'
import { ENTIDADE_SOLARZ } from '../server/solarzMetricas.js'
import { lerSolarzArmazenada } from '../server/solarzSync.js'

const pg = getPgSql()
if (!pg) { console.error('Sem conexão com o banco'); process.exit(1) }

const { dias } = JSON.parse(readFileSync(new URL('../server/data/farol-historico-print.json', import.meta.url), 'utf8'))
for (const d of dias) {
  const soma = Object.values(d.contagens).reduce((s, n) => s + n, 0)
  if (soma !== d.total) { console.error(`Dia ${d.data}: as faixas somam ${soma}, mas o total é ${d.total}`); process.exit(1) }
}

const { farolHistorico } = await lerSolarzArmazenada(pg)
const reais = new Set(farolHistorico.filter((h) => !h.estimado).map((h) => String(h.data).slice(0, 10)))
const novos = dias.filter((d) => !reais.has(d.data))
if (novos.length) {
  await pg.upsert(novos.map((d) => ({ tipo: 'estado', entidade: ENTIDADE_SOLARZ, chave: `farol-${d.data}`, dados: { ...d, estimado: true, fonte: 'print' }, ativo: true })))
}
console.log(JSON.stringify({ importados: novos.map((d) => d.data), puladosPorTerCapturaReal: dias.filter((d) => reais.has(d.data)).map((d) => d.data) }))

const depois = await lerSolarzArmazenada(pg)
console.log(depois.farolHistorico.map((h) => `${h.data} total=${h.total}${h.estimado ? ' (estimado)' : ''}`).join('\n'))
process.exit(0)
