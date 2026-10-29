import { useState, type ReactNode } from 'react'
import { ErrorBoundary } from '../../../components/ErrorBoundary'

export interface LinhaTabela { nome: string; valores: (string | number)[] }

/**
 * Cartão de gráfico: título, nota de escopo, alternância gráfico/tabela (a tabela
 * é o equivalente acessível) e o botão que abre o detalhe na gaveta.
 */
export function Cartao({
  titulo,
  subtitulo,
  nota,
  colunas,
  linhas,
  onDetalhe,
  className = '',
  children,
}: {
  titulo: string
  subtitulo?: string
  nota?: string
  colunas: string[]
  linhas: LinhaTabela[]
  onDetalhe?: () => void
  className?: string
  children: ReactNode
}) {
  const [tabela, setTabela] = useState(false)
  return (
    <section className={`flex min-w-0 flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm ${className}`}>
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold leading-snug text-[var(--text-primary)]">{titulo}</h3>
          {subtitulo && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{subtitulo}</p>}
          {nota && <p className="text-xs italic text-[var(--text-muted)]">{nota}</p>}
        </div>
        <div className="flex gap-1">
          <button type="button" onClick={() => setTabela(!tabela)} aria-pressed={tabela} className="rounded-md px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]">
            {tabela ? 'Gráfico' : 'Tabela'}
          </button>
          {onDetalhe && (
            <button type="button" onClick={onDetalhe} className="rounded-md px-2 py-1 text-xs font-semibold text-[var(--accent-text)] hover:bg-[var(--surface-hover)] ">
              Detalhes ›
            </button>
          )}
        </div>
      </header>
      {/* Um gráfico quebrado mostra um aviso no próprio cartão e não derruba a página. */}
      <ErrorBoundary variante="cartao">
      {linhas.length === 0 ? (
        <p className="flex flex-1 items-center justify-center py-10 text-xs text-[var(--text-muted)]">Sem dados para os filtros escolhidos.</p>
      ) : tabela ? (
        <div className="max-h-[300px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--surface-solid)] text-left text-xs text-[var(--text-muted)]">
              <tr>{colunas.map((c, i) => <th key={c} className={`pb-1.5 pr-3 font-medium ${i ? 'text-right' : ''}`}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.nome} className="border-t border-[var(--border)]">
                  <td className="py-1 pr-3">{l.nome}</td>
                  {l.valores.map((v, i) => <td key={i} className="py-1 pr-3 text-right tabular-nums text-[var(--text-secondary)]">{v}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="min-w-0 flex-1">{children}</div>
      )}
      </ErrorBoundary>
    </section>
  )
}
