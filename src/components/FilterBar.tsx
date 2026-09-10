export interface FilterDef {
  key: string
  label: string
  options: string[]
}

interface Props {
  filters: FilterDef[]
  values: Record<string, string>
  onChange: (key: string, value: string) => void
  onClear: () => void
}

export function FilterBar({ filters, values, onChange, onClear }: Props) {
  const algumFiltroAtivo = Object.values(values).some((v) => v)

  return (
    <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      {filters.map((f) => (
        <div key={f.key} className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-wide text-slate-500">{f.label}</label>
          <select
            value={values[f.key] ?? ''}
            onChange={(e) => onChange(f.key, e.target.value)}
            className="min-w-[140px] rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-200 focus:border-icf-green focus:outline-none"
          >
            <option value="">Todos</option>
            {f.options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      ))}
      <button
        onClick={onClear}
        disabled={!algumFiltroAtivo}
        className="ml-auto rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:border-icf-green hover:text-icf-greenLight disabled:opacity-40"
      >
        Limpar filtros
      </button>
    </div>
  )
}
