import type { ReactNode } from 'react'
import { ThemeToggle } from './ThemeToggle'

export interface AbaItem { k: string; rotulo: string; badge?: number; secundaria?: boolean }

/**
 * Moldura do painel: marca, abas por área (as de apoio à direita, menores, com
 * badge de tarefas atrasadas) e tema. Os alertas ficam dentro de cada área.
 */
export function Layout({
  abas,
  aba,
  onAba,
  theme,
  onToggleTheme,
  children,
}: {
  abas: AbaItem[]
  aba: string
  onAba: (k: string) => void
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  children: ReactNode
}) {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)] px-6 pt-3 md:px-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-icf-green text-lg text-icf-navy" aria-hidden="true">⚡</span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent-text)]">ICF Energy</p>
              <h1 className="text-lg font-semibold leading-tight">Painel de gestão</h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          </div>
        </div>

        <nav aria-label="Áreas do painel" className="-mx-1 mt-3 flex gap-1 overflow-x-auto">
          {abas.map((a, i) => {
            const ativa = a.k === aba
            const primeiraSecundaria = a.secundaria && !abas[i - 1]?.secundaria
            return (
              <button
                key={a.k}
                type="button"
                aria-current={ativa ? 'page' : undefined}
                onClick={() => onAba(a.k)}
                className={`relative flex shrink-0 items-center gap-2 whitespace-nowrap px-3.5 py-2.5 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-icf-green ${a.secundaria ? 'text-xs' : 'text-sm'} ${primeiraSecundaria ? 'ml-auto' : ''} ${ativa ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
              >
                {a.rotulo}
                {!!a.badge && (
                  <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white" title={`${a.badge} atrasadas`}>◆ {a.badge}</span>
                )}
                <span className={`absolute inset-x-2 bottom-0 h-[3px] rounded-t ${ativa ? 'bg-icf-green' : 'bg-transparent'}`} />
              </button>
            )
          })}
        </nav>
      </header>
      <main className="px-6 pb-8 pt-4 md:px-10">{children}</main>
    </div>
  )
}
