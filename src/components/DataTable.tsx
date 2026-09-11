import type { ReactNode } from 'react'

export interface ColumnDef<T> {
  key: string
  label: string
  align?: 'left' | 'right'
  render: (row: T) => ReactNode
}

export function DataTable<T>({
  title,
  columns,
  rows,
  maxHeight = 320,
  footer,
  onRowClick,
}: {
  title: string
  columns: ColumnDef<T>[]
  rows: T[]
  maxHeight?: number
  footer?: ReactNode
  /** Quando informado, cada linha vira clicável e abre o detalhe (ex.: um modal). */
  onRowClick?: (row: T) => void
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h3 className="mb-3 text-sm font-medium text-[var(--text-secondary)]">{title}</h3>
      <div className="overflow-auto" style={{ maxHeight }}>
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[var(--surface-solid)]">
            <tr className="text-left text-[var(--text-muted)]">
              {columns.map((c) => (
                <th key={c.key} className={`pb-2 pr-3 font-normal ${c.align === 'right' ? 'text-right' : ''}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-6 text-center text-xs text-[var(--text-muted)]">
                  Sem dados para os filtros selecionados.
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr
                  key={i}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`border-t border-[var(--border)] ${onRowClick ? 'cursor-pointer hover:bg-[var(--surface-hover)]' : ''}`}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={`py-1.5 pr-3 text-[var(--text-secondary)] ${c.align === 'right' ? 'text-right' : ''}`}>
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {footer}
    </div>
  )
}
