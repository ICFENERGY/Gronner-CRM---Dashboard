// Carga dos detalhes da Pieta (equipamentos, estado) direto no Neon, sem esperar os ticks.
// Uso: node --env-file=.env scripts/carga-pieta.mjs
import { pietaConfigurada, pietaResumo, pietaDetalheProjeto } from '../server/pietaClient.js'
import { getPgSql } from '../server/pgSql.js'
import { sincronizarPieta } from '../server/pietaSync.js'

if (!pietaConfigurada()) { console.error('Sem credencial da Pieta'); process.exit(1) }
const pg = getPgSql()
if (!pg) { console.error('Sem Postgres'); process.exit(1) }

for (let rodada = 1; rodada <= 40; rodada++) {
  const r = await sincronizarPieta({
    pg,
    resumo: (o) => pietaResumo({ ...o, tentativas: 1 }),
    detalhe: (id, o) => pietaDetalheProjeto(id, { ...o, tentativas: 1 }),
    orcamentoMs: 120000, maxDetalhes: 8, pausaMs: 3000, reaproveitarResumoMs: 30 * 60e3,
  })
  console.log(`rodada ${rodada}: buscados ${r.buscados ?? 0}, falhas ${r.falhas ?? 0}, restantes ${r.restantes ?? 0}${r.parada ? ', parada ' + r.parada : ''}`)
  if (!r.restantes) break
  await new Promise((res) => setTimeout(res, r.parada ? 15000 : 4000))
}
