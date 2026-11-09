/**
 * Gera server/data/sla-etapas.json (prazo de cada etapa, em dias) a partir de uma
 * exportação de cards no formato de docs/data_cards.json.
 *
 * Uso: node scripts/gerar-sla-etapas.mjs [docs/data_cards.json]
 *
 * Por quê: no card exportado, `atraso = diasFluxo - prazo da etapa` quando passa do
 * prazo (e 0 quando não passa). O prazo é configuração do Groner por etapa, que a
 * sincronização não grava; aqui ele é deduzido dos cards atrasados (valor mais
 * frequente de diasFluxo - atraso em cada etapa). Só configuração: o arquivo gerado
 * não tem nome, cidade nem código de card.
 */
import fs from 'node:fs'
import path from 'node:path'
import { chaveEtapa } from '../server/indicadores.js'

const origem = process.argv[2] ?? 'docs/data_cards.json'
const destino = path.resolve('server/data/sla-etapas.json')
const cards = JSON.parse(fs.readFileSync(origem, 'utf8'))

const contagens = new Map() // chave -> Map(prazo -> n)
for (const c of cards) {
  if (!(Number(c.atraso) > 0) || !Number.isFinite(Number(c.diasFluxo))) continue
  const chave = chaveEtapa(c.funil, c.etapa)
  if (!chave) continue
  const prazo = Math.round((Number(c.diasFluxo) - Number(c.atraso)) * 1000) / 1000
  if (!contagens.has(chave)) contagens.set(chave, new Map())
  const m = contagens.get(chave)
  m.set(prazo, (m.get(prazo) ?? 0) + 1)
}

const prazos = {}
for (const [chave, m] of [...contagens.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const [prazo] = [...m.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]
  prazos[chave] = prazo
}

// Conferência: com a tabela, quantos cards reproduzem o atraso exportado.
let conferidos = 0
let batem = 0
for (const c of cards) {
  const prazo = prazos[chaveEtapa(c.funil, c.etapa)]
  if (prazo == null || !Number.isFinite(Number(c.diasFluxo))) continue
  conferidos += 1
  const calculado = Math.max(0, Number(c.diasFluxo) - prazo)
  if (Math.abs(calculado - Number(c.atraso)) < 0.01) batem += 1
}

const saida = {
  descricao: 'Prazo (dias) de cada etapa do Groner, deduzido de uma exportação de cards (diasFluxo - atraso). Chave: <número do funil>|<etapa sem acento, maiúscula>.',
  geradoEm: new Date().toISOString(),
  origem: path.basename(origem),
  etapas: Object.keys(prazos).length,
  conferencia: { cardsComPrazo: conferidos, atrasoReproduzido: batem, totalCards: cards.length },
  prazos,
}
fs.writeFileSync(destino, `${JSON.stringify(saida, null, 2)}\n`)
console.log(JSON.stringify({ destino, etapas: saida.etapas, ...saida.conferencia }))
