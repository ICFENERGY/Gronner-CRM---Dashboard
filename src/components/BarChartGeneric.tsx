import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { rotuloNaPonta } from '../features/painel/ui/graficos'
import { larguraRotulo, quantidadeCurta } from '../lib/formatoGrafico'

export interface BarDatum {
  name: string
  value: number
}

/**
 * Barras simples das telas de análise. O valor aparece na ponta de cada barra
 * (formato curto de lib/formatoGrafico); o tooltip mostra o mesmo número.
 */
export function BarChartGeneric({
  title,
  subtitle,
  data,
  color = 'var(--viz-1)',
  layout = 'horizontal',
  maxBars = 12,
  formatValue,
  ordenarPorValor = true,
}: {
  title: string
  subtitle?: string
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
  const fmt = formatValue ?? quantidadeCurta

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h3 className={`${subtitle ? '' : 'mb-2 '}text-sm font-medium text-[var(--text-secondary)]`}>{title}</h3>
      {subtitle && <p className="mb-2 mt-0.5 text-xs text-[var(--text-muted)]">{subtitle}</p>}
      {sorted.length === 0 ? (
        <p className="py-10 text-center text-xs text-[var(--text-muted)]">Sem dados para os filtros selecionados.</p>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(260, isVertical ? sorted.length * 28 : 260)}>
          <BarChart
            data={sorted}
            layout={isVertical ? 'vertical' : 'horizontal'}
            margin={isVertical ? { left: 16, right: larguraRotulo(sorted.map((d) => d.value), fmt), top: 4 } : { top: 20, right: 4, left: 0 }}
          >
            <CartesianGrid stroke="var(--viz-grid)" horizontal={!isVertical} vertical={isVertical} />
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
            <Bar isAnimationActive={false} dataKey="value" fill={color} radius={isVertical ? [0, 4, 4, 0] : [4, 4, 0, 0]}>
              <LabelList dataKey="value" content={rotuloNaPonta(fmt, isVertical ? 'direita' : 'topo') as never} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
