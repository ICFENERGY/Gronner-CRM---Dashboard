/**
 * Carga da SolarZ (usinas) direto no banco do painel, sem esperar o cron da Vercel.
 * Uso: node --env-file=.env scripts/carga-solarz.mjs
 * Precisa de SOLARZ_USER, SOLARZ_PASSWORD e da conexão do banco (SUPABASE_DB_URL / NEON_DATABASE_URL / DATABASE_URL).
 * Imprime só contagens.
 */
import { getPgSql } from '../server/pgSql.js'
import * as c from '../server/solarzClient.js'
import { sincronizarSolarz } from '../server/solarzSync.js'

if (!process.env.SOLARZ_USER || !process.env.SOLARZ_PASSWORD) { console.error('Sem credencial da SolarZ'); process.exit(1) }
const pg = getPgSql()
if (!pg) { console.error('Sem conexão com o banco'); process.exit(1) }

const r = await sincronizarSolarz({
  pg,
  listarUsinas: () => c.solarzListarUsinasCompleto(),
  energia: (id, ano) => c.solarzEnergiaAno(id, ano),
  desempenho: (id) => c.solarzDesempenho(id),
  relatorio: (id, ini, fim) => c.solarzRelatorioPeriodo(id, ini, fim),
  unidades: (o) => c.solarzListarUnidades(o),
  tickets: (o) => c.solarzListarTicketsAbertos(o),
  simples: (o) => c.solarzListarSimples(o),
  orcamentoMs: 10 * 60 * 1000, // aqui não há o limite de 60 s da função da Vercel
})
console.log(JSON.stringify(r))
