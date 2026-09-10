import type { CategoriaResumo } from '../api/types'

export function CategoriaLegend({ data }: { data: CategoriaResumo[] }) {
  const total = data.reduce((sum, c) => sum + c.quantidade, 0) || 1

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <h3 className="mb-4 text-sm font-medium text-slate-300">Distribuição por categoria (legenda do fluxograma)</h3>
      <div className="mb-4 flex h-3 w-full overflow-hidden rounded-full">
        {data.map((c) => (
          <div
            key={c.categoria}
            style={{ width: `${(c.quantidade / total) * 100}%`, backgroundColor: c.cor }}
            title={`${c.label}: ${c.quantidade}`}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-5">
        {data.map((c) => (
          <div key={c.categoria} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: c.cor }} />
            <span className="text-slate-400">{c.label}</span>
            <span className="ml-auto font-medium text-slate-200">{c.quantidade}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
