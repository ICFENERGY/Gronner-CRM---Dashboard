/**
 * Atualiza server/data/sla-etapas.json com a "Meta de permanência" de cada etapa, lida direto do Groner:
 * o detalhe do card (GET Projeto/{id}) traz, em statusAtuais[], a etapa (funil) e o status com `tempo` (minutos).
 * Basta um card por etapa; escolhe poucos cards que cubram todas as etapas em uso (lista de /api/indicadores/cards).
 *
 * Uso: node scripts/gerar-sla-etapas-groner.mjs [urlDoPainel]   (só leitura no Groner: ~1 chamada por card, com pausa)
 */
import fs from 'node:fs'
import path from 'node:path'
import { gronerGet } from '../server/gronerClient.js'
import { chaveEtapa } from '../server/indicadores.js'

const painel = process.argv[2] ?? 'https://groner-crm-dashboard-ten.vercel.app'
const destino = path.resolve('server/data/sla-etapas.json')
const pausa = (ms) => new Promise((r) => setTimeout(r, ms))

const cards = await (await fetch(`${painel}/api/indicadores/cards`)).json()
const porChave = new Map() // chave -> ids de cards nela
for (const c of cards) {
  const chave = chaveEtapa(c.funil, c.etapa)
  if (!chave) continue
  const id = Number(String(c.codigo).replace('#', ''))
  if (!porChave.has(chave)) porChave.set(chave, [])
  porChave.get(chave).push(id)
}
console.log('etapas em uso:', porChave.size)

const metas = new Map() // chave -> minutos (0 = sem meta)
for (const [chave, ids] of porChave) {
  // Tenta até 4 cards da etapa: o detalhe de alguns não traz a etapa em statusAtuais (ex.: card parado em funil arquivado).
  for (const id of ids.slice(0, 4)) {
    if (metas.has(chave)) break // já veio no detalhe de outro card
    try {
      const p = await gronerGet(`Projeto/${id}`, {}, { retries: 1, parar429: true })
      // statusAtuais vem vazio em cards parados; o status principal do card (com a etapa dele) cobre esse caso.
      const lista = [...(p.statusAtuais ?? []), ...(p.status ? [{ etapa: p.status.etapa, status: p.status }] : [])]
      for (const s of lista) {
        const k = chaveEtapa(s.etapa?.nome, s.status?.nome)
        if (k && typeof s.status?.tempo === 'number') metas.set(k, s.status.tempo)
      }
    } catch (e) {
      console.log('falhou', id, chave, String(e.message).slice(0, 60))
    }
    await pausa(250)
  }
}

const antigo = JSON.parse(fs.readFileSync(destino, 'utf8'))
const prazos = {}
let mudou = 0, iguais = 0, novos = 0, semMeta = 0
for (const [k, min] of [...metas].sort((a, b) => a[0].localeCompare(b[0]))) {
  if (!(min > 0)) { semMeta++; continue }
  const dias = Math.round((min / 1440) * 1000) / 1000
  prazos[k] = dias
  if (antigo.prazos[k] == null) novos++
  else if (Math.abs(antigo.prazos[k] - dias) < 0.01) iguais++
  else { mudou++; console.log('mudou', k, antigo.prazos[k], '->', dias) }
}
const faltando = [...porChave.keys()].filter((k) => !metas.has(k))
console.log({ lidas: metas.size, iguais, mudou, novos, semMeta, faltando: faltando.length })
if (faltando.length) console.log('sem leitura:', faltando.join(' ; '))
if (process.env.GRAVAR !== '1') { console.log('simulação (GRAVAR=1 grava)'); process.exit(0) }

fs.writeFileSync(destino, JSON.stringify({
  descricao: 'Meta de permanência (dias) de cada etapa, lida do Groner (campo tempo do status). Chave: <número do funil>|<etapa sem acento, maiúscula>. Etapa sem meta no Groner não entra.',
  geradoEm: new Date().toISOString(),
  origem: 'Groner Projeto/{id} statusAtuais[].status.tempo',
  etapas: Object.keys(prazos).length,
  prazos,
}, null, 2) + '\n')
console.log('gravado', destino)
