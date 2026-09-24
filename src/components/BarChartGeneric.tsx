import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { number } from '../lib/palette'

export interface BarDatum {
  name: string
  value: number
}

export function BarChartGeneric({
  title,
  data,
  color = '#22C55E',
  layout = 'horizontal',
  maxBars = 12,
  formatValue,
  ordenarPorValor = true,
}: {
  title: string
  data: BarDatum[]
  color?: string
  layout?: 'horizontal' | 'vertical'
  maxBars?: number
  formatValue?: (v: number) => string
  /** false para séries temporais (ex.: meses), onde a ordem original importa mais que o valor. */
  ordenarPorValor?: boolean
}) {
  const sorted = (ordenarPorValor ? [...data].sort((a, b) => b.value - a.value) : data).slice(0, maxBars)
  const isVertical = layout === 'vertical'
  const fmt = formatValue ?? number.format

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h3 className="mb-2 text-sm font-medium text-[var(--text-secondary)]">{title}</h3>
      {sorted.length === 0 ? (
        <p className="py-10 text-center text-xs text-[var(--text-muted)]">Sem dados para os filtros selecionados.</p>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(260, isVertical ? sorted.length * 28 : 260)}>
          <BarChart data={sorted} layout={isVertical ? 'vertical' : 'horizontal'} margin={{ left: isVertical ? 16 : 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={!isVertical} vertical={isVertical} />
            {isVertical ? (
              <>
                <XAxis type="number" stroke="var(--text-muted)" fontSize={11} tickFormatter={fmt} />
                <YAxis type="category" dataKey="name" stroke="var(--text-muted)" fontSize={11} width={150} />
              </>
            ) : (
              <>
                <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={11} angle={-30} textAnchor="end" height={70} interval={0} />
                <YAxis stroke="var(--text-muted)" fontSize={11} tickFormatter={fmt} />
              </>
            )}
            <Tooltip
              contentStyle={{ background: 'var(--surface-solid)', border: '1px solid var(--border)', borderRadius: 8 }}
              labelStyle={{ color: 'var(--text-primary)' }}
              formatter={(value: number) => fmt(value)}
            />
            <Bar dataKey="value" fill={color} radius={isVertical ? [0, 4, 4, 0] : [4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
