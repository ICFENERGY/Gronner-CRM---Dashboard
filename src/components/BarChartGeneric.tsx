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
}: {
  title: string
  data: BarDatum[]
  color?: string
  layout?: 'horizontal' | 'vertical'
  maxBars?: number
  formatValue?: (v: number) => string
}) {
  const sorted = [...data].sort((a, b) => b.value - a.value).slice(0, maxBars)
  const isVertical = layout === 'vertical'
  const fmt = formatValue ?? number.format

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <h3 className="mb-2 text-sm font-medium text-slate-300">{title}</h3>
      {sorted.length === 0 ? (
        <p className="py-10 text-center text-xs text-slate-500">Sem dados para os filtros selecionados.</p>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(260, isVertical ? sorted.length * 28 : 260)}>
          <BarChart data={sorted} layout={isVertical ? 'vertical' : 'horizontal'} margin={{ left: isVertical ? 16 : 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={!isVertical} vertical={isVertical} />
            {isVertical ? (
              <>
                <XAxis type="number" stroke="#64748b" fontSize={11} tickFormatter={fmt} />
                <YAxis type="category" dataKey="name" stroke="#64748b" fontSize={11} width={150} />
              </>
            ) : (
              <>
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} angle={-30} textAnchor="end" height={70} interval={0} />
                <YAxis stroke="#64748b" fontSize={11} tickFormatter={fmt} />
              </>
            )}
            <Tooltip
              contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
              labelStyle={{ color: '#e2e8f0' }}
              formatter={(value: number) => fmt(value)}
            />
            <Bar dataKey="value" fill={color} radius={isVertical ? [0, 4, 4, 0] : [4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
