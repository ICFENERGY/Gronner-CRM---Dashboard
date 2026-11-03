import { useMemo } from 'react'
import { api } from '../../api/client'
import { useRawData } from '../../api/useRawData'
import { percentualCurto } from '../../lib/formatoGrafico'
import { currency, number } from '../../lib/palette'
import { agruparPorFunil } from './funis'
import { Cartao, Kpi } from './ui/base'
import { CardsFunil } from './ui/CardsFunil'

/** Visão Geral: os cards cadastrados no Groner e em que funil e etapa estão. O valor por funil fica na aba Vendas. */
export function PainelPage() {
  const projetos = useRawData('projetos', api.getProjetosRaw)

  const funis = useMemo(() => agruparPorFunil(projetos.data ?? []), [projetos.data])

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

      <Cartao
        titulo="Cards por funil"
        subtitulo="Quantidade de cards em cada funil e como se dividem pelas etapas (a barra colorida); clique no cartão para ver todas as etapas"
        colunas={['Funil', 'Cards', '% do total', 'Etapas']}
        linhas={funis.map((f) => ({ nome: f.funil, valores: [number.format(f.cards), percentualCurto(totalCards ? (100 * f.cards) / totalCards : 0), f.etapas.length] }))}
      >
        <CardsFunil funis={funis} />
      </Cartao>

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
