import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { colorFor, number } from '../lib/palette'

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export function MultiYearBarChart({ title, items }: { title: string; items: { dataInclusao: string }[] }) {
  const anos = [...new Set(items.map((i) => i.dataInclusao.slice(0, 4)))].sort()
  const porMes = MESES.map((mes, idx) => {
    const row: Record<string, number | string> = { mes }
    for (const ano of anos) {
      row[ano] = items.filter((i) => i.dataInclusao.slice(0, 4) === ano && Number(i.dataInclusao.slice(5, 7)) - 1 === idx).length
    }
    return row
  })

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <h3 className="mb-2 text-sm font-medium text-slate-300">{title}</h3>
      {items.length === 0 ? (
        <p className="py-10 text-center text-xs text-slate-500">Sem dados para os filtros selecionados.</p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={porMes}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="mes" stroke="#64748b" fontSize={11} />
            <YAxis stroke="#64748b" fontSize={11} tickFormatter={(v) => number.format(v)} />
            <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }} labelStyle={{ color: '#e2e8f0' }} />
            <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
            {anos.map((ano, i) => (
              <Bar key={ano} dataKey={ano} fill={colorFor(i)} radius={[3, 3, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
