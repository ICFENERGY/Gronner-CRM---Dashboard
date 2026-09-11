import type { ReactNode } from 'react'

export type PageKey = 'geral' | 'vendas' | 'cadastro' | 'tarefas' | 'monitoramento'

const TABS: { key: PageKey; label: string }[] = [
  { key: 'geral', label: 'Visão geral' },
  { key: 'vendas', label: 'Vendas' },
  { key: 'cadastro', label: 'Validação de cadastro' },
  { key: 'tarefas', label: 'Indicador de tarefas' },
  { key: 'monitoramento', label: 'Monitoramento solar' },
]

export function Layout({
  page,
  onNavigate,
  alertCount = 0,
  children,
}: {
  page: PageKey
  onNavigate: (p: PageKey) => void
  alertCount?: number
  children: ReactNode
}) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/60 px-6 py-4 md:px-10">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-icf-green/15 text-icf-greenLight">⚡</span>
            <div>
              <p className="text-xs uppercase tracking-wide text-icf-greenLight">ICF Energy</p>
              <h1 className="text-xl font-semibold text-white">Dashboard Groner CRM</h1>
            </div>
          </div>

          {alertCount > 0 && (
            <button
              onClick={() => onNavigate('tarefas')}
              className="flex items-center gap-2 rounded-lg border border-red-800 bg-red-950/50 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-950"
            >
              <span className="h-2 w-2 rounded-full bg-red-500" />
              {alertCount} {alertCount === 1 ? 'tarefa atrasada' : 'tarefas atrasadas'}
            </button>
          )}
        </div>
        <nav className="flex flex-wrap gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => onNavigate(tab.key)}
              className={`relative rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
                page === tab.key ? 'bg-icf-green text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
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
