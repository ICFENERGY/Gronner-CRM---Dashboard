/**
 * Gráficos da Visão geral (recharts), pela skill de dataviz: um gráfico por
 * área, um eixo só, grade em linha contínua e discreta, barras finas com a
 * ponta arredondada, tooltip em toda marca, semáforo só para estado (sempre com
 * ícone na legenda) e ênfase (o período escolhido em verde, o resto em cinza).
 */
import type { ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { compacto, inteiro, pctTxt, reais, type PontoEtapa, type PontoGeracao, type PontoMarco, type PontoVendas } from './calculos'

const eixo = { stroke: 'var(--viz-axis)', fontSize: 11, tickLine: false }
const grade = <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
const gradeH = <CartesianGrid horizontal={false} stroke="var(--viz-grid)" />

function Dica({ titulo, linhas }: { titulo: string; linhas: ReactNode[] }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-solid)] px-3 py-2 text-xs shadow-lg">
      <p className="mb-0.5 font-semibold text-[var(--text-primary)]">{titulo}</p>
      {linhas.map((l, i) => <p key={i} className="text-[var(--text-secondary)]">{l}</p>)}
    </div>
  )
}

function Legenda({ itens }: { itens: { rotulo: string; cor: string; icone?: string; linha?: boolean }[] }) {
  return (
    <ul className="mb-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]" aria-hidden="true">
      {itens.map((i) => (
        <li key={i.rotulo} className="flex items-center gap-1.5">
          {i.icone ? <span style={{ color: i.cor }}>{i.icone}</span> : i.linha ? <span className="inline-block h-0.5 w-4 rounded" style={{ background: i.cor }} /> : <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: i.cor }} />}
          {i.rotulo}
        </li>
      ))}
    </ul>
  )
}

/** Vendas (R$) por mês nos últimos 12 meses; o período escolhido em destaque. */
export function VendasMensais({ dados }: { dados: PontoVendas[] }) {
  const total = dados.reduce((a, d) => a + d.valor, 0)
  return (
    <div className="flex min-h-[230px] flex-1 flex-col" role="img" aria-label={`Barras: valor vendido por mês de ${dados[0]?.nome} a ${dados.at(-1)?.nome}, total ${reais(total)}`}>
      <Legenda itens={[{ rotulo: 'Período escolhido', cor: 'var(--viz-1)' }, { rotulo: 'Demais meses', cor: 'var(--viz-muted)' }]} />
      <div className="min-h-[210px] flex-1">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados} margin={{ top: 18, right: 4, left: 0, bottom: 0 }} barCategoryGap="24%">
          {grade}
          <XAxis dataKey="nome" {...eixo} interval={0} tick={{ fontSize: 10, fill: 'var(--viz-axis)' }} />
          <YAxis {...eixo} axisLine={false} width={52} tickFormatter={(v: number) => compacto(v)} />
          <Tooltip
            cursor={{ fill: 'var(--surface-hover)' }}
            content={({ payload }) => {
              const p = payload?.[0]?.payload as PontoVendas | undefined
              return p ? <Dica titulo={`${p.nome}${p.parcial ? ' (mês em curso)' : ''}`} linhas={[`${reais(p.valor)} vendidos`, `${inteiro(p.vendas)} ${p.vendas === 1 ? 'venda' : 'vendas'}`]} /> : null
            }}
          />
          <Bar isAnimationActive={false} dataKey="valor" radius={[4, 4, 0, 0]} maxBarSize={24}>
            {dados.map((d) => <Cell key={d.chave} fill={d.destaque ? 'var(--viz-1)' : 'var(--viz-muted)'} />)}
            {/* Rótulo só no período escolhido (mesmo quando é zero e a barra não aparece). */}
            <LabelList dataKey="valor" content={(p: { x?: number | string; y?: number | string; width?: number | string; index?: number }) => {
              const d = dados[p.index ?? -1]
              if (!d?.destaque || dados.filter((x) => x.destaque).length > 1) return null
              return <text x={Number(p.x) + Number(p.width) / 2} y={Number(p.y) - 5} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--text-primary)">{reais(d.valor)}</text>
            }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      </div>
    </div>
  )
}

const ESTADOS = [
  { k: 'atrasado', rotulo: 'Atrasado', icone: '◆' },
  { k: 'risco', rotulo: 'Em risco', icone: '▲' },
  { k: 'ok', rotulo: 'No prazo', icone: '●' },
] as const

/** Cards por marco (ordem do fluxo), empilhados pelo semáforo. Clique abre os cards do marco. */
export function MarcosSemaforo({ dados, onClicar }: { dados: PontoMarco[]; onClicar: (marco: string) => void }) {
  const altura = Math.max(160, dados.length * 21 + 28)
  return (
    <div role="img" aria-label={`Barras horizontais: cards ativos por marco da Engenharia, divididos em atrasado, em risco e no prazo. ${dados.map((d) => `${d.rotulo}: ${d.atrasado} atrasados de ${d.total}`).join('; ')}`}>
      <Legenda itens={ESTADOS.map((e) => ({ rotulo: e.rotulo, cor: `var(--st-${e.k})`, icone: e.icone }))} />
      <ResponsiveContainer width="100%" height={altura}>
        <BarChart data={dados} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }} barCategoryGap={3}>
          {gradeH}
          <XAxis type="number" {...eixo} axisLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey="rotulo" {...eixo} width={178} interval={0} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
          <Tooltip
            cursor={{ fill: 'var(--surface-hover)' }}
            content={({ payload }) => {
              const p = payload?.[0]?.payload as PontoMarco | undefined
              return p ? (
                <Dica
                  titulo={`Marco ${p.rotulo}`}
                  linhas={[
                    `◆ ${p.atrasado} atrasados · ▲ ${p.risco} em risco · ● ${p.ok} no prazo`,
                    p.medianaDias != null ? `Mediana de ${inteiro(p.medianaDias)} dias no marco (prazo ${p.prazo})` : `Prazo do marco: ${p.prazo} dias`,
                    'Clique para ver os cards',
                  ]}
                />
              ) : null
            }}
          />
          {ESTADOS.map((e, i) => (
            <Bar
              key={e.k}
              isAnimationActive={false}
              dataKey={e.k}
              name={e.rotulo}
              stackId="s"
              fill={`var(--st-${e.k})`}
              stroke="var(--surface)"
              strokeWidth={1}
              radius={i === ESTADOS.length - 1 ? [0, 4, 4, 0] : 0}
              maxBarSize={14}
              cursor="pointer"
              onClick={(d: { marco?: string }) => d?.marco && onClicar(d.marco)}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Geração real (barras) contra o prognóstico (linha), no mesmo eixo em MWh. */
export function GeracaoMensal({ dados }: { dados: PontoGeracao[] }) {
  const mwh = (v: number) => `${compacto(v / 1000)}`
  return (
    <div className="flex min-h-[230px] flex-1 flex-col" role="img" aria-label={`Geração real contra prognóstico por mês, em MWh: ${dados.map((d) => `${d.nome} ${mwh(d.geracao)} de ${mwh(d.prognostico)}`).join('; ')}`}>
      <Legenda itens={[{ rotulo: 'Geração real', cor: 'var(--viz-1)' }, { rotulo: 'Prognóstico', cor: 'var(--viz-ref)', linha: true }]} />
      <div className="min-h-[210px] flex-1">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={dados} margin={{ top: 6, right: 4, left: 0, bottom: 0 }} barCategoryGap="24%">
          {grade}
          <XAxis dataKey="nome" {...eixo} interval={0} tick={{ fontSize: 10, fill: 'var(--viz-axis)' }} />
          <YAxis {...eixo} axisLine={false} width={44} tickFormatter={mwh} label={{ value: 'MWh', angle: -90, position: 'insideLeft', offset: 12, fontSize: 10, fill: 'var(--viz-axis)' }} />
          <Tooltip
            cursor={{ fill: 'var(--surface-hover)' }}
            content={({ payload }) => {
              const p = payload?.[0]?.payload as PontoGeracao | undefined
              return p ? <Dica titulo={p.nome} linhas={[`Geração: ${mwh(p.geracao)} MWh`, `Prognóstico: ${mwh(p.prognostico)} MWh`, p.pct != null ? `${pctTxt(p.pct)} do prognóstico` : '', `${inteiro(p.usinas)} usinas no mês`]} /> : null
            }}
          />
          <Bar isAnimationActive={false} dataKey="geracao" name="Geração real" fill="var(--viz-1)" radius={[4, 4, 0, 0]} maxBarSize={24} />
          <Line isAnimationActive={false} dataKey="prognostico" name="Prognóstico" stroke="var(--viz-ref)" strokeWidth={2} dot={{ r: 3, fill: 'var(--viz-ref)', stroke: 'var(--surface)', strokeWidth: 2 }} type="linear" />
        </ComposedChart>
      </ResponsiveContainer>
      </div>
    </div>
  )
}

/** Projetos em andamento por etapa da Pieta (maior fila em cima). */
export function EtapasPieta({ dados }: { dados: PontoEtapa[] }) {
  const altura = Math.max(140, dados.length * 23 + 24)
  return (
    <div role="img" aria-label={`Barras horizontais: projetos em andamento por etapa. ${dados.map((d) => `${d.etapa}: ${d.projetos}`).join('; ')}`}>
      <ResponsiveContainer width="100%" height={altura}>
        <BarChart data={dados} layout="vertical" margin={{ top: 0, right: 28, left: 0, bottom: 0 }} barCategoryGap={4}>
          {gradeH}
          <XAxis type="number" {...eixo} axisLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey="etapa" {...eixo} width={170} interval={0} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
          <Tooltip
            cursor={{ fill: 'var(--surface-hover)' }}
            content={({ payload }) => {
              const p = payload?.[0]?.payload as PontoEtapa | undefined
              return p ? <Dica titulo={p.etapa} linhas={[`${inteiro(p.projetos)} ${p.projetos === 1 ? 'projeto' : 'projetos'} agora`, p.mediaDias != null ? `Tempo médio na etapa: ${p.mediaDias.toLocaleString('pt-BR')} dias (base: ${p.amostra} ${p.amostra === 1 ? 'projeto' : 'projetos'} detalhados)` : 'Sem tempo medido ainda']} /> : null
            }}
          />
          <Bar isAnimationActive={false} dataKey="projetos" name="Projetos" fill="var(--viz-1)" radius={[0, 4, 4, 0]} maxBarSize={14} label={{ position: 'right', fontSize: 11, fill: 'var(--text-secondary)' }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
