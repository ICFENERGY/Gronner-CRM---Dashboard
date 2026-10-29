/**
 * Barras horizontais do painel (recharts), seguindo a skill de dataviz: série
 * única em --viz-1, grade discreta, ponta arredondada, tooltip em toda barra e o
 * valor escrito na ponta de cada barra.
 */
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Barra } from '../calculos'

const eixo = { stroke: 'var(--viz-axis)', fontSize: 11, tickLine: false }
const dica = {
  contentStyle: { background: 'var(--surface-solid)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, boxShadow: '0 4px 14px rgba(0,0,0,0.18)' },
  labelStyle: { color: 'var(--text-primary)', fontWeight: 600 },
  itemStyle: { color: 'var(--text-secondary)' },
  cursor: { fill: 'var(--surface-hover)' },
}

/** Ranking (categorias sem ordem natural): barras horizontais, maior em cima. `rotulo` é o formato do número na ponta (padrão: o do eixo). */
export function BarrasHorizontais({ dados, formatar, rotulo, rotuloValor = 'Valor', larguraNome = 150, onClicar }: { dados: Barra[]; formatar: (v: number) => string; rotulo?: (v: number) => string; rotuloValor?: string; larguraNome?: number; onClicar?: (nome: string) => void }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, dados.length * 30 + 24)}>
      <BarChart data={dados} layout="vertical" margin={{ top: 0, right: 64, left: 0, bottom: 0 }} barCategoryGap={4}>
        <CartesianGrid horizontal={false} stroke="var(--viz-grid)" strokeDasharray="3 3" />
        <XAxis type="number" {...eixo} axisLine={false} tickFormatter={formatar} />
        <YAxis type="category" dataKey="nome" {...eixo} width={larguraNome} interval={0} tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
        <Tooltip {...dica} formatter={(v: number) => [formatar(v), rotuloValor]} />
        <Bar isAnimationActive={false}
          dataKey="valor"
          name={rotuloValor}
          fill="var(--viz-1)"
          radius={[0, 4, 4, 0]}
          maxBarSize={20}
          cursor={onClicar ? 'pointer' : undefined}
          onClick={onClicar ? (d: { nome?: string }) => d?.nome && onClicar(d.nome) : undefined}
        >
          <LabelList dataKey="valor" position="right" fontSize={12} fontWeight={600} fill="var(--text-primary)" formatter={(v: number) => (v ? (rotulo ?? formatar)(v) : '0')} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
