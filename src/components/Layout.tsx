import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ThemeToggle } from './ThemeToggle'

export interface ItemMenu { k: string; rotulo: string }

/**
 * Moldura do painel único: marca, ações (modo reunião, análises completas,
 * alerta de tarefas, tema) e o conteúdo. Não há mais abas: o detalhe abre em
 * gaveta, sem trocar de tela.
 */
export function Layout({
  analises,
  onAnalise,
  onModoReuniao,
  alertCount = 0,
  onAlerta,
  theme,
  onToggleTheme,
  children,
}: {
  analises: ItemMenu[]
  onAnalise: (k: string) => void
  onModoReuniao: () => void
  alertCount?: number
  onAlerta: () => void
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  children: ReactNode
}) {
  const [menu, setMenu] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menu) return
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node)) setMenu(false) }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false) }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', tecla)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', tecla) }
  }, [menu])

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)] px-6 py-3 md:px-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-icf-green/15 text-icf-green dark:text-icf-greenLight">⚡</span>
            <div>
              <p className="text-xs uppercase tracking-wide text-icf-green dark:text-icf-greenLight">ICF Energy</p>
              <h1 className="text-lg font-semibold leading-tight">Painel Groner CRM</h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {alertCount > 0 && (
              <button type="button" onClick={onAlerta} className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300 dark:hover:bg-red-950">
                <span aria-hidden="true">◆</span>
                {alertCount} {alertCount === 1 ? 'tarefa atrasada' : 'tarefas atrasadas'}
              </button>
            )}
            <div ref={caixa} className="relative">
              <button type="button" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)} className="rounded-lg border border-[var(--border-strong)] px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]">
                Análises completas ▾
              </button>
              {menu && (
                <div role="menu" className="absolute right-0 z-30 mt-1 w-60 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-solid)] py-1 shadow-lg">
                  {analises.map((a) => (
                    <button key={a.k} role="menuitem" type="button" onClick={() => { setMenu(false); onAnalise(a.k) }} className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--surface-hover)]">
                      {a.rotulo}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button type="button" onClick={onModoReuniao} className="rounded-lg bg-icf-green px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-green-800">
              Modo reunião
            </button>
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          </div>
        </div>
      </header>
      <main className="px-6 pb-8 md:px-10">{children}</main>
    </div>
  )
}
