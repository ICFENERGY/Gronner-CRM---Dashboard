import { Bar, BarChart, CartesianGrid, Legend, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { UsinasOrigemDados } from '../../api/types'
import { dica, estiloRotulo } from '../painel/ui/graficos'
import { quantidadeCurta } from '../../lib/formatoGrafico'

type Farol = UsinasOrigemDados['farolHistorico']

/** Série do farol: ordem de empilhamento (de baixo para cima) e cor de cada status de conectividade. */
export const SERIE_FAROL = [
  { chave: 'Normal', cor: 'var(--st-ok)' },
  { chave: 'Com alerta', cor: 'var(--st-risco)' },
  { chave: 'Crítico', cor: 'var(--st-atrasado)' },
  { chave: 'Desconhecido', cor: 'var(--viz-outros)' },
] as const

/** "2026-11-03" (ou ISO) vira "03/11". */
export const diaMes = (data: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(data)
  return m ? `${m[3]}/${m[2]}` : data
}

/** Linhas do gráfico: uma por dia, com a contagem de cada status e o total. */
export function linhasFarol(historico: Farol) {
  return [...historico]
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((h) => ({
      dia: diaMes(h.data),
      Normal: h.contagens.Normal ?? 0,
      'Com alerta': h.contagens['Com alerta'] ?? 0,
      Crítico: h.contagens['Crítico'] ?? 0,
      Desconhecido: h.contagens.Desconhecido ?? 0,
      total: h.total,
    }))
}

/** Barras empilhadas por dia; o total aparece no topo de cada barra. */
export function FarolDiario({ historico }: { historico: Farol }) {
  const dados = linhasFarol(historico)
  if (!dados.length) return <p className="py-10 text-center text-xs text-[var(--text-muted)]">Sem histórico do farol ainda.</p>
  const eixo = { stroke: 'var(--viz-axis)', fontSize: 11, tickLine: false }
  return (
    <div className="mx-auto w-full max-w-[760px]">
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={dados} margin={{ top: 24, right: 8, left: 0, bottom: 0 }} barCategoryGap="35%">
          <CartesianGrid vertical={false} stroke="var(--viz-grid)" strokeDasharray="3 3" />
          <XAxis dataKey="dia" {...eixo} />
          <YAxis {...eixo} axisLine={false} width={36} allowDecimals={false} />
          <Tooltip {...dica} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)' }} />
          {SERIE_FAROL.map((s, i) => (
            <Bar key={s.chave} dataKey={s.chave} stackId="farol" fill={s.cor} isAnimationActive={false} maxBarSize={14}>
              {i === SERIE_FAROL.length - 1 && (
                <LabelList dataKey="total" position="top" formatter={(v: number) => quantidadeCurta(v)} style={estiloRotulo} />
              )}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
