import { useEffect, useRef, useState, type ReactNode } from 'react'

/** KPI clicável: número grande, contexto e variação contra o período anterior. */
export function Kpi({
  area,
  rotulo,
  valor,
  contexto,
  variacao,
  tom,
  onAbrir,
}: {
  area: string
  rotulo: string
  valor: string
  contexto?: string
  variacao?: number | null
  /** Destaque de estado (status), com ícone — nunca só a cor. */
  tom?: 'atrasado' | 'risco' | 'ok'
  onAbrir?: () => void
}) {
  const icone = tom === 'atrasado' ? '◆' : tom === 'risco' ? '▲' : tom === 'ok' ? '●' : null
  return (
    <button
      type="button"
      onClick={onAbrir}
      disabled={!onAbrir}
      className="group grid min-w-0 content-start gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition-colors enabled:hover:border-[var(--border-strong)] enabled:hover:bg-[var(--surface-hover)] disabled:cursor-default"
    >
      <span className="flex items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
        <span className="truncate">{area}</span>
        {onAbrir && <span aria-hidden="true" className="opacity-0 transition-opacity group-hover:opacity-100">›</span>}
      </span>
      <span className="text-sm text-[var(--text-secondary)]">{rotulo}</span>
      <span className="flex items-baseline gap-2">
        {icone && <span aria-hidden="true" className="text-sm" style={{ color: `var(--st-${tom})` }}>{icone}</span>}
        <b className="text-[1.75rem] font-semibold leading-tight text-[var(--text-primary)]">{valor}</b>
        {variacao != null && (
          <span className={`text-xs font-semibold ${variacao >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
            {variacao >= 0 ? '↑' : '↓'} {Math.abs(variacao)}%
          </span>
        )}
      </span>
      {contexto && <span className="text-xs text-[var(--text-muted)]">{contexto}</span>}
    </button>
  )
}

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
    <section className={`flex min-w-0 flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 ${className}`}>
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">{titulo}</h3>
          {subtitulo && <p className="text-xs text-[var(--text-muted)]">{subtitulo}</p>}
          {nota && <p className="text-xs italic text-[var(--text-muted)]">{nota}</p>}
        </div>
        <div className="flex gap-1">
          <button type="button" onClick={() => setTabela(!tabela)} aria-pressed={tabela} className="rounded-md px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]">
            {tabela ? 'Gráfico' : 'Tabela'}
          </button>
          {onDetalhe && (
            <button type="button" onClick={onDetalhe} className="rounded-md px-2 py-1 text-xs font-semibold text-icf-green hover:bg-[var(--surface-hover)] dark:text-icf-greenLight">
              Detalhes ›
            </button>
          )}
        </div>
      </header>
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
    </section>
  )
}

/** Gaveta lateral: detalhe sem trocar de tela. Fecha com Esc, clique fora ou botão. */
export function Gaveta({ titulo, largura = 'normal', onFechar, children }: { titulo: string; largura?: 'normal' | 'larga'; onFechar: () => void; children: ReactNode }) {
  const painel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null
    painel.current?.focus()
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    document.addEventListener('keydown', tecla)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', tecla)
      document.body.style.overflow = ''
      anterior?.focus?.()
    }
  }, [onFechar])
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button type="button" aria-label="Fechar detalhe" onClick={onFechar} className="absolute inset-0 bg-black/30" />
      <div
        ref={painel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={`relative flex h-full w-full flex-col border-l border-[var(--border)] bg-[var(--bg)] shadow-2xl outline-none ${largura === 'larga' ? 'max-w-[1200px]' : 'max-w-[760px]'}`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-solid)] px-5 py-3">
          <h2 className="truncate text-base font-semibold">{titulo}</h2>
          <button type="button" onClick={onFechar} className="rounded-md px-2.5 py-1 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]">Fechar ✕</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  )
}
