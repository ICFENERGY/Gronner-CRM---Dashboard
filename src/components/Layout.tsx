import type { ReactNode } from 'react'
import { IcfLogo } from './IcfLogo'
import { ThemeToggle } from './ThemeToggle'

export interface AbaItem { k: string; rotulo: string; badge?: number }

/**
 * Moldura do painel: faixa azul-marinho da marca (fixa no topo) com a logo,
 * as abas por área em pílula e o botão de tema.
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
      {/* Dentro da faixa o texto é sempre claro: a logo e os botões leem --text-primary. */}
      <header className="sticky top-0 z-30 bg-[var(--header-bg)] shadow-md [--text-primary:#ffffff] [--text-secondary:#c9d6e2] [--border:rgba(255,255,255,0.18)] [--surface-hover:rgba(255,255,255,0.1)]">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 md:px-8">
          <div className="flex items-center gap-3">
            <IcfLogo height={34} />
            <h1 className="hidden border-l border-white/25 pl-3 text-sm font-medium leading-tight text-white/80 lg:block">Painel Groner CRM</h1>
          </div>

          <nav aria-label="Áreas do painel" className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto px-1 pb-0.5 sm:order-none sm:w-auto sm:flex-1">
            {abas.map((a) => {
              const ativa = a.k === aba
              return (
                <button
                  key={a.k}
                  type="button"
                  aria-current={ativa ? 'page' : undefined}
                  onClick={() => onAba(a.k)}
                  className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${ativa ? 'bg-icf-green text-[#0b2233]' : 'text-white/75 hover:bg-white/10 hover:text-white'}`}
                >
                  {a.rotulo}
                  {!!a.badge && (
                    <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white" title={`${a.badge} atrasadas`}>◆ {a.badge}</span>
                  )}
                </button>
              )
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-4 pb-10 pt-5 md:px-8">{children}</main>
    </div>
  )
}
