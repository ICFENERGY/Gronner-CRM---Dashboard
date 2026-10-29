import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { MesResumo } from '../api/types'

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

export function SalesTrendChart({ data }: { data: MesResumo[] }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h3 className="mb-4 text-sm font-medium text-[var(--text-secondary)]">Vendas por mês</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data}>
          <CartesianGrid stroke="var(--viz-grid)" />
          <XAxis dataKey="mes" stroke="var(--text-muted)" fontSize={12} />
          <YAxis stroke="var(--text-muted)" fontSize={12} tickFormatter={(v) => currency.format(v)} width={90} />
          <Tooltip
            contentStyle={{ background: 'var(--surface-solid)', border: '1px solid var(--border)', borderRadius: 8 }}
            labelStyle={{ color: 'var(--text-primary)' }}
            formatter={(value: number) => currency.format(value)}
          />
          <Line type="monotone" dataKey="valorTotal" stroke="var(--viz-1)" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
