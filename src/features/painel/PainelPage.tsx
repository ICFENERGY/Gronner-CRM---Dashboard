import { useMemo } from 'react'
import { api } from '../../api/client'
import { useRawData } from '../../api/useRawData'
import { currency, number } from '../../lib/palette'
import type { ProjetoRaw } from '../../api/types'
import { Cartao, Kpi } from './ui/base'
import { BarrasHorizontais } from './ui/graficos'

const mil = (v: number) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi` : Math.abs(v) >= 1e3 ? `${Math.round(v / 1e3).toLocaleString('pt-BR')} mil` : number.format(Math.round(v)))
const reais = (v: number) => `R$ ${mil(v)}`

/** Valor do card: o da venda; sem ele, o da proposta aceita. */
const valorDoCard = (p: ProjetoRaw) => (Number(p.valorVenda) > 0 ? Number(p.valorVenda) : Number(p.valorPrePropostaAceita) > 0 ? Number(p.valorPrePropostaAceita) : 0)
/** Número do funil no começo do nome ("07. FINANCEIRO" → 7); sem número vai para o fim. */
const numeroDoFunil = (nome: string) => { const n = parseInt(nome, 10); return Number.isFinite(n) ? n : 999 }

/** Visão Geral: os cards cadastrados no Groner, em que funil estão e quanto cada funil tem em valor. */
export function PainelPage() {
  const projetos = useRawData('projetos', api.getProjetosRaw)

  const funis = useMemo(() => {
    const porFunil = new Map<string, { funil: string; cards: number; valor: number }>()
    for (const p of projetos.data ?? []) {
      const funil = (p.funil ?? '').trim() || 'Sem funil'
      const g = porFunil.get(funil) ?? { funil, cards: 0, valor: 0 }
      g.cards += 1
      g.valor += valorDoCard(p)
      porFunil.set(funil, g)
    }
    return [...porFunil.values()].sort((a, b) => numeroDoFunil(a.funil) - numeroDoFunil(b.funil) || a.funil.localeCompare(b.funil, 'pt-BR'))
  }, [projetos.data])

  const totalCards = funis.reduce((a, f) => a + f.cards, 0)
  const totalValor = funis.reduce((a, f) => a + f.valor, 0)

  if (projetos.error && !projetos.data) {
    return <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300">Não foi possível carregar os cards: {projetos.error}.</p>
  }
  if (!projetos.data) return <p role="status" className="py-10 text-center text-sm text-[var(--text-muted)]">Carregando os cards…</p>

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi area="Visão Geral" rotulo="Cards cadastrados" valor={number.format(totalCards)} contexto="todos os cards do Groner" />
        <Kpi area="Visão Geral" rotulo="Funis com cards" valor={number.format(funis.length)} contexto="funis que têm pelo menos um card" />
        <Kpi area="Visão Geral" rotulo="Valor total" valor={currency.format(totalValor)} contexto="soma do valor dos cards, de todos os funis" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Cartao
          titulo="Cards por funil"
          subtitulo="Quantidade de cards em cada funil"
          colunas={['Funil', 'Cards']}
          linhas={funis.map((f) => ({ nome: f.funil, valores: [number.format(f.cards)] }))}
        >
          <BarrasHorizontais dados={funis.map((f) => ({ nome: f.funil, valor: f.cards }))} formatar={(v) => number.format(v)} rotuloValor="Cards" />
        </Cartao>
        <Cartao
          titulo="Valor por funil (R$)"
          subtitulo="Valor da venda do card; sem ele, o da proposta aceita"
          colunas={['Funil', 'Valor']}
          linhas={funis.map((f) => ({ nome: f.funil, valores: [currency.format(f.valor)] }))}
        >
          <BarrasHorizontais dados={funis.map((f) => ({ nome: f.funil, valor: f.valor }))} formatar={reais} rotuloValor="Valor" />
        </Cartao>
      </div>

      <section className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full text-sm">
          <caption className="px-4 py-3 text-left text-sm font-semibold text-[var(--text-primary)]">Cards e valor por funil</caption>
          <thead>
            <tr className="border-y border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
              <th scope="col" className="px-4 py-2 font-medium">Funil</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Cards</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Valor (R$)</th>
            </tr>
          </thead>
          <tbody>
            {funis.map((f) => (
              <tr key={f.funil} className="border-t border-[var(--border)]">
                <td className="px-4 py-2 text-[var(--text-primary)]">{f.funil}</td>
                <td className="px-4 py-2 text-right tabular-nums">{number.format(f.cards)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{f.valor ? currency.format(f.valor) : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-[var(--border-strong)] font-semibold">
              <td className="px-4 py-2">Total</td>
              <td className="px-4 py-2 text-right tabular-nums">{number.format(totalCards)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{currency.format(totalValor)}</td>
            </tr>
          </tfoot>
        </table>
      </section>
    </div>
  )
}
