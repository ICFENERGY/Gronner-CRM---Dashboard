/**
 * Gráficos do painel (recharts), seguindo a skill de dataviz: série única em
 * --viz-1, semáforo em --st-*, grade contínua e discreta, barras finas com a
 * ponta arredondada, tooltip em toda marca e um só eixo por gráfico.
 */
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Barra } from '../calculos'

const eixo = { stroke: 'var(--viz-axis)', fontSize: 11, tickLine: false }
const dica = {
  contentStyle: { background: 'var(--surface-solid)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 },
  labelStyle: { color: 'var(--text-primary)', fontWeight: 600 },
  itemStyle: { color: 'var(--text-secondary)' },
  cursor: { fill: 'var(--surface-hover)' },
}

/** Série temporal ou categorias em ordem própria: barras verticais. */
export function BarrasVerticais({ dados, formatar, altura = 240, rotuloValor = 'Valor' }: { dados: Barra[]; formatar: (v: number) => string; altura?: number; rotuloValor?: string }) {
  const muitas = dados.length > 16
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart data={dados} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barCategoryGap={muitas ? 1 : '22%'}>
        <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
        <XAxis dataKey="nome" {...eixo} interval={muitas ? 'preserveStartEnd' : 0} minTickGap={8} />
        <YAxis {...eixo} axisLine={false} width={64} tickFormatter={formatar} />
        <Tooltip {...dica} formatter={(v: number) => [formatar(v), rotuloValor]} />
        <Bar isAnimationActive={false} dataKey="valor" name={rotuloValor} fill="var(--viz-1)" radius={[4, 4, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Ranking (categorias sem ordem natural): barras horizontais, maior em cima. */
export function BarrasHorizontais({ dados, formatar, rotuloValor = 'Valor', onClicar }: { dados: Barra[]; formatar: (v: number) => string; rotuloValor?: string; onClicar?: (nome: string) => void }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, dados.length * 30 + 24)}>
      <BarChart data={dados} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }} barCategoryGap={4}>
        <CartesianGrid horizontal={false} stroke="var(--viz-grid)" />
        <XAxis type="number" {...eixo} axisLine={false} tickFormatter={formatar} />
        <YAxis type="category" dataKey="nome" {...eixo} width={150} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
        <Tooltip {...dica} formatter={(v: number) => [formatar(v), rotuloValor]} />
        <Bar isAnimationActive={false}
          dataKey="valor"
          name={rotuloValor}
          fill="var(--viz-1)"
          radius={[0, 4, 4, 0]}
          maxBarSize={20}
          cursor={onClicar ? 'pointer' : undefined}
          onClick={onClicar ? (d: { nome?: string }) => d?.nome && onClicar(d.nome) : undefined}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

export interface PontoStatus { nome: string; titulo: string; atrasado: number; risco: number; ok: number }

/** Cards por marco, empilhados pelo semáforo (estado, não identidade). */
export function EmpilhadoStatus({ dados, onClicar, altura = 330 }: { dados: PontoStatus[]; onClicar?: (marco: string) => void; altura?: number }) {
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart data={dados} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barCategoryGap="18%">
        <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
        <XAxis dataKey="nome" {...eixo} interval={0} />
        <YAxis {...eixo} axisLine={false} width={32} allowDecimals={false} />
        <Tooltip {...dica} labelFormatter={(_, p) => (p?.[0]?.payload as PontoStatus | undefined)?.titulo ?? ''} />
        <Legend
          verticalAlign="top"
          height={28}
          iconSize={10}
          wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)' }}
          payload={[
            { value: '◆ Atrasado', type: 'square', color: 'var(--st-atrasado)', id: 'a' },
            { value: '▲ Em risco', type: 'square', color: 'var(--st-risco)', id: 'r' },
            { value: '● No prazo', type: 'square', color: 'var(--st-ok)', id: 'o' },
          ]}
        />
        {(['ok', 'risco', 'atrasado'] as const).map((k, i) => (
          <Bar isAnimationActive={false}
            key={k}
            dataKey={k}
            name={k === 'ok' ? 'No prazo' : k === 'risco' ? 'Em risco' : 'Atrasado'}
            stackId="s"
            fill={`var(--st-${k})`}
            stroke="var(--surface-solid)"
            strokeWidth={1}
            radius={i === 2 ? [4, 4, 0, 0] : 0}
            maxBarSize={34}
            cursor={onClicar ? 'pointer' : undefined}
            onClick={onClicar ? (d: { nome?: string }) => d?.nome && onClicar(d.nome) : undefined}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Geração real (barras) contra o prognóstico (linha de referência), mesmo eixo em kWh. */
export function GeracaoPrognostico({ dados, formatar }: { dados: Barra[]; formatar: (v: number) => string }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={dados} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
        <XAxis dataKey="nome" {...eixo} interval={0} />
        <YAxis {...eixo} axisLine={false} width={64} tickFormatter={formatar} />
        <Tooltip {...dica} formatter={(v: number, n: string) => [formatar(v), n]} />
        <Legend verticalAlign="top" height={28} iconSize={10} wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)' }} />
        <Bar isAnimationActive={false} dataKey="valor" name="Geração real" fill="var(--viz-1)" radius={[4, 4, 0, 0]} maxBarSize={36} />
        <Line isAnimationActive={false} dataKey="extra" name="Prognóstico" stroke="var(--viz-ref)" strokeWidth={2} dot={{ r: 3, fill: 'var(--viz-ref)', strokeWidth: 0 }} type="monotone" />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
