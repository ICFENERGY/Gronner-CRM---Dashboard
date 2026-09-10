import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { colorFor, number } from '../lib/palette'

export interface DonutDatum {
  name: string
  value: number
}

export function DonutChart({ title, data, maxSlices = 10 }: { title: string; data: DonutDatum[]; maxSlices?: number }) {
  const sorted = [...data].sort((a, b) => b.value - a.value)
  const top = sorted.slice(0, maxSlices)
  const outros = sorted.slice(maxSlices).reduce((sum, d) => sum + d.value, 0)
  const chartData = outros > 0 ? [...top, { name: 'Outros', value: outros }] : top

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <h3 className="mb-2 text-sm font-medium text-slate-300">{title}</h3>
      {chartData.length === 0 ? (
        <p className="py-10 text-center text-xs text-slate-500">Sem dados para os filtros selecionados.</p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={1}>
              {chartData.map((entry, i) => (
                <Cell key={entry.name} fill={colorFor(i)} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
              labelStyle={{ color: '#e2e8f0' }}
              formatter={(value: number) => number.format(value)}
            />
            <Legend
              layout="vertical"
              align="right"
              verticalAlign="middle"
              wrapperStyle={{ fontSize: 11, color: '#94a3b8', maxWidth: '45%' }}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
