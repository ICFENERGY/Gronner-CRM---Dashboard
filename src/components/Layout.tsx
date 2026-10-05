import type { ReactNode } from 'react'
import { ThemeToggle } from './ThemeToggle'

export type PageKey = 'geral' | 'engenharia' | 'vendas' | 'cadastro' | 'tarefas' | 'monitoramento' | 'pieta'

const TABS: { key: PageKey; label: string }[] = [
  { key: 'geral', label: 'Visão geral' },
  { key: 'engenharia', label: 'Engenharia' },
  { key: 'vendas', label: 'Vendas' },
  { key: 'cadastro', label: 'Validação de cadastro' },
  { key: 'tarefas', label: 'Indicador de tarefas' },
  { key: 'monitoramento', label: 'Monitoramento solar' },
  { key: 'pieta', label: 'Pieta (PIEP)' },
]

export function Layout({
  page,
  onNavigate,
  alertCount = 0,
  theme,
  onToggleTheme,
  children,
}: {
  page: PageKey
  onNavigate: (p: PageKey) => void
  alertCount?: number
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  children: ReactNode
}) {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)] px-6 py-4 md:px-10">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-icf-green/15 text-icf-green dark:text-icf-greenLight">⚡</span>
            <div>
              <p className="text-xs uppercase tracking-wide text-icf-green dark:text-icf-greenLight">ICF Energy</p>
              <h1 className="text-xl font-semibold text-[var(--text-primary)]">Dashboard Groner CRM</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {alertCount > 0 && (
              <button
                onClick={() => onNavigate('tarefas')}
                className="flex items-center gap-2 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/50 px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950"
              >
                <span className="h-2 w-2 rounded-full bg-red-500" />
                {alertCount} {alertCount === 1 ? 'tarefa atrasada' : 'tarefas atrasadas'}
              </button>
            )}
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          </div>
        </div>
        <nav className="flex flex-wrap gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => onNavigate(tab.key)}
              className={`relative rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
                page === tab.key ? 'bg-icf-green text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
              }`}
            >
              {tab.label}
              {tab.key === 'tarefas' && alertCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {alertCount}
                </span>
              )}
            </button>
          ))}
        </nav>
      </header>
      <main className="px-6 py-6 md:px-10">{children}</main>
    </div>
  )
}
