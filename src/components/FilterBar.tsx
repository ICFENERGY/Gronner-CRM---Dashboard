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
    <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      {filters.map((f) => (
        <div key={f.key} className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">{f.label}</label>
          <select
            value={values[f.key] ?? ''}
            onChange={(e) => onChange(f.key, e.target.value)}
            className="min-w-[140px] rounded-lg border border-[var(--border-strong)] bg-[var(--input-bg)] px-2.5 py-1.5 text-sm text-[var(--text-primary)] focus:border-icf-green focus:outline-none"
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
        className="ml-auto rounded-lg border border-[var(--border-strong)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:border-icf-green hover:text-[var(--accent-text)] disabled:opacity-40"
      >
        Limpar filtros
      </button>
    </div>
  )
}
