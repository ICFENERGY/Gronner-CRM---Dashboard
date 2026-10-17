import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { number } from '../lib/palette'

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
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h3 className="mb-2 text-sm font-medium text-[var(--text-secondary)]">{title}</h3>
      {items.length === 0 ? (
        <p className="py-10 text-center text-xs text-[var(--text-muted)]">Sem dados para os filtros selecionados.</p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={porMes}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="mes" stroke="var(--text-muted)" fontSize={11} />
            <YAxis stroke="var(--text-muted)" fontSize={11} tickFormatter={(v) => number.format(v)} />
            <Tooltip contentStyle={{ background: 'var(--surface-solid)', border: '1px solid var(--border)', borderRadius: 8 }} labelStyle={{ color: 'var(--text-primary)' }} />
            <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-secondary)' }} />
            {anos.map((ano, i) => (
              <Bar key={ano} dataKey={ano} fill={`var(--cat-${(i % 6) + 1})`} radius={[3, 3, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
