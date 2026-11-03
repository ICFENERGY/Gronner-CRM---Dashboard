/**
 * Gráficos do painel (recharts), seguindo a skill de dataviz: série única em
 * --viz-1, semáforo em --st-*, grade contínua e discreta, barras finas com a
 * ponta arredondada, tooltip em toda marca e um só eixo por gráfico.
 * Todo gráfico mostra o valor na própria marca (sem precisar do mouse), no
 * formato curto de src/lib/formatoGrafico.ts.
 */
import { Bar, BarChart, CartesianGrid, ComposedChart, LabelList, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { larguraRotulo, pontosComRotulo } from '../../../lib/formatoGrafico'
import type { Barra } from '../calculos'

const eixo = { stroke: 'var(--viz-axis)', fontSize: 11, tickLine: false }
export const dica = {
  contentStyle: { background: 'var(--surface-solid)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, boxShadow: '0 4px 14px rgba(0,0,0,0.18)' },
  labelStyle: { color: 'var(--text-primary)', fontWeight: 600 },
  itemStyle: { color: 'var(--text-secondary)' },
  cursor: { fill: 'var(--surface-hover)' },
}

/** Estilo único do rótulo de valor fora da marca (ponta da barra, ponto da linha). */
export const estiloRotulo = { fill: 'var(--text-secondary)', fontSize: 11, fontWeight: 600 } as const

interface PropsRotulo { x?: number | string; y?: number | string; width?: number | string; height?: number | string; value?: number | string; index?: number }
const n = (v: number | string | undefined) => Number(v ?? 0)

/**
 * Rótulo na ponta da barra, em uma linha só (o LabelList padrão quebra o texto
 * na largura da barra): à direita nas horizontais, acima nas verticais.
 */
export function rotuloNaPonta(formatar: (v: number) => string, lado: 'direita' | 'topo') {
  return function Rotulo(p: PropsRotulo) {
    const x = n(p.x), y = n(p.y), w = n(p.width), h = n(p.height), v = Number(p.value)
    if (p.value == null || !Number.isFinite(v)) return null
    return lado === 'direita' ? (
      <text x={x + w + 6} y={y + h / 2} dominantBaseline="central" {...estiloRotulo} style={{ pointerEvents: 'none' }}>{formatar(v)}</text>
    ) : (
      <text x={x + w / 2} y={y - 6} textAnchor="middle" {...estiloRotulo} style={{ pointerEvents: 'none' }}>{formatar(v)}</text>
    )
  }
}

/**
 * Rótulo de barra vertical estreita: o valor sobe dentro da barra, a partir da
 * base (deixa o topo livre para a linha de referência); se a barra é baixa
 * demais, vai acima dela.
 */
export function rotuloDentroDaBarra(formatar: (v: number) => string, cor = '#0b1f33') {
  return function Rotulo(p: PropsRotulo) {
    const x = n(p.x), y = n(p.y), w = n(p.width), h = n(p.height), v = n(p.value)
    if (!v) return null
    const texto = formatar(v)
    const cabe = h >= texto.length * 6.2 + 12
    const cx = x + w / 2
    return cabe ? (
      <text x={cx} y={y + h - 6} transform={`rotate(-90 ${cx} ${y + h - 6})`} dominantBaseline="central" fontSize={11} fontWeight={700} fill={cor} style={{ pointerEvents: 'none' }}>{texto}</text>
    ) : (
      <text x={cx} y={y - 4} transform={`rotate(-90 ${cx} ${y - 4})`} dominantBaseline="central" {...estiloRotulo} style={{ pointerEvents: 'none' }}>{texto}</text>
    )
  }
}

/** Série temporal ou categorias em ordem própria: barras verticais, valor no topo de cada uma. */
export function BarrasVerticais({ dados, formatar, altura = 240, rotuloValor = 'Valor' }: { dados: Barra[]; formatar: (v: number) => string; altura?: number; rotuloValor?: string }) {
  const muitas = dados.length > 16
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart data={dados} margin={{ top: muitas ? 40 : 20, right: 4, left: 4, bottom: 0 }} barCategoryGap={muitas ? 1 : '22%'}>
        <CartesianGrid vertical={false} stroke="var(--viz-grid)" strokeDasharray="3 3" />
        <XAxis dataKey="nome" {...eixo} interval={muitas ? 'preserveStartEnd' : 0} minTickGap={8} />
        <YAxis {...eixo} axisLine={false} width={64} tickFormatter={formatar} />
        <Tooltip {...dica} formatter={(v: number) => [formatar(v), rotuloValor]} />
        <Bar isAnimationActive={false} dataKey="valor" name={rotuloValor} fill="var(--viz-1)" radius={[4, 4, 0, 0]} maxBarSize={36}>
          {muitas ? (
            <LabelList dataKey="valor" content={rotuloDentroDaBarra(formatar) as never} />
          ) : (
            <LabelList dataKey="valor" content={rotuloNaPonta(formatar, 'topo') as never} />
          )}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Nome da categoria no eixo em uma linha só, cortado com "…" se passar da largura (o nome inteiro fica no tooltip e na tabela). */
function nomeEmUmaLinha(largura: number) {
  const max = Math.max(8, Math.floor((largura - 12) / 6.3))
  return function Tick(p: { x?: number; y?: number; payload?: { value?: string } }) {
    const nome = String(p.payload?.value ?? '')
    const texto = nome.length > max ? `${nome.slice(0, max - 1)}…` : nome
    return (
      <text x={n(p.x) - 4} y={n(p.y)} textAnchor="end" dominantBaseline="central" fontSize={11} fill="var(--text-secondary)">
        <title>{nome}</title>
        {texto}
      </text>
    )
  }
}

/** Ranking (categorias sem ordem natural): barras horizontais, maior em cima, valor na ponta. */
export function BarrasHorizontais({ dados, formatar, rotuloValor = 'Valor', onClicar, larguraNomes = 150 }: { dados: Barra[]; formatar: (v: number) => string; rotuloValor?: string; onClicar?: (nome: string) => void; larguraNomes?: number }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, dados.length * 30 + 24)}>
      <BarChart data={dados} layout="vertical" margin={{ top: 0, right: larguraRotulo(dados.map((d) => d.valor), formatar), left: 0, bottom: 0 }} barCategoryGap={4}>
        <CartesianGrid horizontal={false} stroke="var(--viz-grid)" strokeDasharray="3 3" />
        <XAxis type="number" {...eixo} axisLine={false} tickFormatter={formatar} />
        <YAxis type="category" dataKey="nome" {...eixo} width={larguraNomes} tick={nomeEmUmaLinha(larguraNomes) as never} />
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
          <LabelList dataKey="valor" content={rotuloNaPonta(formatar, 'direita') as never} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export interface PontoStatus { nome: string; titulo: string; atrasado: number; risco: number; ok: number }

/** Cards por marco, empilhados pelo semáforo (estado, não identidade): valor em cada segmento que couber e o total no topo. */
export function EmpilhadoStatus({ dados, onClicar, altura = 330, formatar = (v) => v.toLocaleString('pt-BR') }: { dados: PontoStatus[]; onClicar?: (marco: string) => void; altura?: number; formatar?: (v: number) => string }) {
  const segmento = (p: PropsRotulo) => {
    const v = n(p.value), h = n(p.height)
    if (!v || h < 14) return null
    return <text x={n(p.x) + n(p.width) / 2} y={n(p.y) + h / 2} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700} fill="#0b1f33" style={{ pointerEvents: 'none' }}>{formatar(v)}</text>
  }
  const total = (p: PropsRotulo) => {
    const d = dados[p.index ?? -1]
    if (!d) return null
    const t = d.ok + d.risco + d.atrasado
    return <text x={n(p.x) + n(p.width) / 2} y={n(p.y) - 6} textAnchor="middle" {...estiloRotulo} fill="var(--text-primary)" style={{ pointerEvents: 'none' }}>{formatar(t)}</text>
  }
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart data={dados} margin={{ top: 22, right: 4, left: 4, bottom: 0 }} barCategoryGap="18%">
        <CartesianGrid vertical={false} stroke="var(--viz-grid)" strokeDasharray="3 3" />
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
          >
            <LabelList dataKey={k} content={segmento as never} />
            {i === 2 && <LabelList dataKey={k} content={total as never} />}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

/**
 * Geração real (barras) contra o prognóstico (linha de referência), mesmo eixo.
 * Cada barra traz o valor dentro (de baixo para cima); a linha traz o valor no
 * primeiro, no último, no máximo e no mínimo, acima do ponto.
 */
export function GeracaoPrognostico({ dados, formatar }: { dados: Barra[]; formatar: (v: number) => string }) {
  const marcados = pontosComRotulo(dados.map((d) => d.extra))
  const rotuloLinha = (p: PropsRotulo) => {
    if (!marcados.has(p.index ?? -1) || !n(p.value)) return null
    return (
      <text x={n(p.x)} y={n(p.y) - 9} textAnchor="middle" {...estiloRotulo} fill="var(--viz-ref)" stroke="var(--surface)" strokeWidth={3} strokeLinejoin="round" paintOrder="stroke" style={{ pointerEvents: 'none' }}>
        {formatar(n(p.value))}
      </text>
    )
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={dados} margin={{ top: 18, right: 8, left: 4, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke="var(--viz-grid)" strokeDasharray="3 3" />
        <XAxis dataKey="nome" {...eixo} interval={0} tickFormatter={(s: string) => s.replace(' (parcial)', '*')} />
        <YAxis {...eixo} axisLine={false} width={64} tickFormatter={formatar} />
        <Tooltip {...dica} formatter={(v: number, nome: string) => [formatar(v), nome]} />
        <Legend verticalAlign="top" height={28} iconSize={10} wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)' }} />
        <Bar isAnimationActive={false} dataKey="valor" name="Geração real" fill="var(--viz-1)" radius={[4, 4, 0, 0]} maxBarSize={36}>
          <LabelList dataKey="valor" content={rotuloDentroDaBarra(formatar) as never} />
        </Bar>
        <Line isAnimationActive={false} dataKey="extra" name="Prognóstico" stroke="var(--viz-ref)" strokeWidth={2} dot={{ r: 3, fill: 'var(--viz-ref)', strokeWidth: 0 }} type="monotone">
          <LabelList dataKey="extra" content={rotuloLinha as never} />
        </Line>
      </ComposedChart>
    </ResponsiveContainer>
  )
}
