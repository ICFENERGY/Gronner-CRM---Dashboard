import type { ProjetoRaw } from '../../api/types'
import type { ResumoFunil } from './ui/CardsFunil'

/** Valor do card: o da venda; sem ele, o da proposta aceita; sem os dois, zero. */
export const valorDoCard = (p: ProjetoRaw) => (Number(p.valorVenda) > 0 ? Number(p.valorVenda) : Number(p.valorPrePropostaAceita) > 0 ? Number(p.valorPrePropostaAceita) : 0)

/** Número do funil no começo do nome ("07. FINANCEIRO" → 7); sem número vai para o fim. */
const numeroDoFunil = (nome: string) => { const n = parseInt(nome, 10); return Number.isFinite(n) ? n : 999 }

export interface FunilAgregado extends ResumoFunil { valor: number }

/** Cards agrupados por funil (na ordem numérica do Groner), com as etapas do maior para o menor e o valor somado. */
export function agruparPorFunil(projetos: ProjetoRaw[]): FunilAgregado[] {
  const porFunil = new Map<string, { funil: string; cards: number; valor: number; etapas: Map<string, number> }>()
  for (const p of projetos) {
    const funil = (p.funil ?? '').trim() || 'Sem funil'
    const etapa = (p.etapa ?? '').trim() || 'Sem etapa'
    const g = porFunil.get(funil) ?? { funil, cards: 0, valor: 0, etapas: new Map<string, number>() }
    g.cards += 1
    g.valor += valorDoCard(p)
    g.etapas.set(etapa, (g.etapas.get(etapa) ?? 0) + 1)
    porFunil.set(funil, g)
  }
  return [...porFunil.values()]
    .sort((a, b) => numeroDoFunil(a.funil) - numeroDoFunil(b.funil) || a.funil.localeCompare(b.funil, 'pt-BR'))
    .map((g) => ({
      funil: g.funil,
      cards: g.cards,
      valor: g.valor,
      etapas: [...g.etapas.entries()].map(([etapa, cards]) => ({ etapa, cards })).sort((a, b) => b.cards - a.cards || a.etapa.localeCompare(b.etapa, 'pt-BR')),
    }))
}
