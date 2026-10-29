/**
 * Gráficos das abas (recharts), pela skill de dataviz: um eixo só, grade
 * discreta, barras finas com a ponta arredondada, tooltip em toda marca e o
 * valor escrito em cada barra e em cada ponto (formato pt-BR curto), em cor
 * de texto, com halo da superfície para ficar legível nos dois temas.
 */
import type { ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { compacto, decimal1, inteiro, pctTxt, type PontoEtapa, type PontoGeracao, type PontoMensal } from './calculos'

const eixo = { stroke: 'var(--viz-axis)', fontSize: 11, tickLine: false }
const grade = <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
const gradeH = <CartesianGrid horizontal={false} stroke="var(--viz-grid)" />
/** Texto de valor: cor de texto e halo da superfície (lê sobre barra, grade ou linha). */
const halo = { stroke: 'var(--surface)', strokeWidth: 3, paintOrder: 'stroke' as const, strokeLinejoin: 'round' as const }

function Dica({ titulo, linhas }: { titulo: string; linhas: ReactNode[] }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-solid)] px-3 py-2 text-xs shadow-lg">
      <p className="mb-0.5 font-semibold text-[var(--text-primary)]">{titulo}</p>
      {linhas.filter(Boolean).map((l, i) => <p key={i} className="text-[var(--text-secondary)]">{l}</p>)}
    </div>
  )
}

function Legenda({ itens }: { itens: { rotulo: string; cor: string; linha?: boolean }[] }) {
  return (
    <ul className="mb-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]" aria-hidden="true">
      {itens.map((i) => (
        <li key={i.rotulo} className="flex items-center gap-1.5">
          {i.linha ? <span className="inline-block h-0.5 w-4 rounded" style={{ background: i.cor }} /> : <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: i.cor }} />}
          {i.rotulo}
        </li>
      ))}
    </ul>
  )
}

type PropsRotulo = { x?: number | string; y?: number | string; width?: number | string; height?: number | string; value?: number | string; index?: number }

/**
 * Barras por mês (12 meses), o período escolhido em verde e o resto em cinza.
 * Toda barra traz o valor (zero mostra "0"); em gráfico estreito a fonte diminui.
 */
export function BarrasMensais({ dados, formatar, rotuloQtd }: { dados: PontoMensal[]; formatar: (v: number) => string; rotuloQtd: [string, string] }) {
  const total = dados.reduce((a, d) => a + d.valor, 0)
  return (
    <div className="flex flex-col" role="img" aria-label={`Barras por mês de ${dados[0]?.nome} a ${dados.at(-1)?.nome}: ${dados.map((d) => `${d.nome} ${formatar(d.valor)}`).join('; ')}. Total ${formatar(total)}.`}>
      <Legenda itens={[{ rotulo: 'Período escolhido', cor: 'var(--viz-1)' }, { rotulo: 'Demais meses', cor: 'var(--viz-muted)' }]} />
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={dados} margin={{ top: 22, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
          {grade}
          <XAxis dataKey="nome" {...eixo} interval={0} tick={{ fontSize: 11, fill: 'var(--viz-axis)' }} />
          <YAxis {...eixo} axisLine={false} width={52} tickFormatter={(v: number) => compacto(v)} />
          <Tooltip
            cursor={{ fill: 'var(--surface-hover)' }}
            content={({ payload }) => {
              const p = payload?.[0]?.payload as PontoMensal | undefined
              return p ? <Dica titulo={`${p.nome}${p.parcial ? ' (mês em curso)' : ''}`} linhas={[formatar(p.valor), `${inteiro(p.qtd)} ${p.qtd === 1 ? rotuloQtd[0] : rotuloQtd[1]}`]} /> : null
            }}
          />
          <Bar isAnimationActive={false} dataKey="valor" radius={[4, 4, 0, 0]} maxBarSize={40}>
            {dados.map((d) => <Cell key={d.chave} fill={d.destaque ? 'var(--viz-1)' : 'var(--viz-muted)'} />)}
            <LabelList dataKey="valor" content={(p: PropsRotulo) => {
              const d = dados[p.index ?? -1]
              if (!d) return null
              const largura = Number(p.width)
              return (
                <text x={Number(p.x) + largura / 2} y={Number(p.y) - 6} textAnchor="middle" fontSize={largura < 34 ? 9 : 11} fontWeight={d.destaque ? 700 : 500} fill={d.destaque ? 'var(--text-primary)' : 'var(--text-secondary)'} {...halo}>
                  {d.valor ? formatar(d.valor) : '0'}
                </text>
              )
            }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Geração real (barras, valor dentro) contra o prognóstico (linha, valor no ponto), no mesmo eixo em MWh. */
export function GeracaoMensal({ dados }: { dados: PontoGeracao[] }) {
  const mwh = (kwh: number) => decimal1(kwh / 1000)
  return (
    <div className="flex flex-col" role="img" aria-label={`Geração real contra prognóstico por mês, em MWh: ${dados.map((d) => `${d.nome} ${mwh(d.geracao)} de ${mwh(d.prognostico)}`).join('; ')}`}>
      <Legenda itens={[{ rotulo: 'Geração real (MWh, dentro da barra)', cor: 'var(--viz-1)' }, { rotulo: 'Prognóstico (MWh, acima do ponto)', cor: 'var(--viz-ref)', linha: true }]} />
      <ResponsiveContainer width="100%" height={270}>
        <ComposedChart data={dados} margin={{ top: 22, right: 12, left: 0, bottom: 0 }} barCategoryGap="22%">
          {grade}
          <XAxis dataKey="nome" {...eixo} interval={0} tick={{ fontSize: 11, fill: 'var(--viz-axis)' }} />
          <YAxis {...eixo} axisLine={false} width={44} tickFormatter={(v: number) => compacto(v / 1000)} label={{ value: 'MWh', angle: -90, position: 'insideLeft', offset: 12, fontSize: 10, fill: 'var(--viz-axis)' }} />
          <Tooltip
            cursor={{ fill: 'var(--surface-hover)' }}
            content={({ payload }) => {
              const p = payload?.[0]?.payload as PontoGeracao | undefined
              return p ? <Dica titulo={p.nome} linhas={[`Geração: ${mwh(p.geracao)} MWh`, `Prognóstico: ${mwh(p.prognostico)} MWh`, p.pct != null ? `${pctTxt(p.pct)} do prognóstico` : '', `${inteiro(p.usinas)} usinas no mês`]} /> : null
            }}
          />
          <Bar isAnimationActive={false} dataKey="geracao" name="Geração real" fill="var(--viz-1)" radius={[4, 4, 0, 0]} maxBarSize={44}>
            <LabelList dataKey="geracao" content={(p: PropsRotulo) => {
              const v = Number(p.value) || 0
              const alto = Number(p.height) > 30
              return (
                <text x={Number(p.x) + Number(p.width) / 2} y={alto ? Number(p.y) + Number(p.height) - 8 : Number(p.y) - 6} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--text-primary)" {...halo}>
                  {v ? mwh(v) : '0'}
                </text>
              )
            }} />
          </Bar>
          <Line isAnimationActive={false} dataKey="prognostico" name="Prognóstico" stroke="var(--viz-ref)" strokeWidth={2} dot={{ r: 4, fill: 'var(--viz-ref)', stroke: 'var(--surface)', strokeWidth: 2 }} type="linear">
            <LabelList dataKey="prognostico" content={(p: PropsRotulo) => (
              <text x={Number(p.x)} y={Number(p.y) - 10} textAnchor="middle" fontSize={10} fontWeight={500} fill="var(--text-secondary)" {...halo}>
                {mwh(Number(p.value) || 0)}
              </text>
            )} />
          </Line>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Projetos em andamento por etapa da PIETA (maior fila em cima), com o número na ponta da barra. */
export function EtapasPieta({ dados }: { dados: PontoEtapa[] }) {
  const altura = Math.max(140, dados.length * 26 + 24)
  return (
    <div role="img" aria-label={`Barras horizontais: projetos em andamento por etapa. ${dados.map((d) => `${d.etapa}: ${d.projetos}`).join('; ')}`}>
      <ResponsiveContainer width="100%" height={altura}>
        <BarChart data={dados} layout="vertical" margin={{ top: 0, right: 36, left: 0, bottom: 0 }} barCategoryGap={4}>
          {gradeH}
          <XAxis type="number" {...eixo} axisLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey="etapa" {...eixo} width={190} interval={0} tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} />
          <Tooltip
            cursor={{ fill: 'var(--surface-hover)' }}
            content={({ payload }) => {
              const p = payload?.[0]?.payload as PontoEtapa | undefined
              return p ? <Dica titulo={p.etapa} linhas={[`${inteiro(p.projetos)} ${p.projetos === 1 ? 'projeto' : 'projetos'} agora`, p.mediaDias != null ? `Tempo médio na etapa: ${decimal1(p.mediaDias)} dias (base: ${p.amostra} ${p.amostra === 1 ? 'projeto' : 'projetos'} detalhados)` : 'Sem tempo medido ainda']} /> : null
            }}
          />
          <Bar isAnimationActive={false} dataKey="projetos" name="Projetos" fill="var(--viz-1)" radius={[0, 4, 4, 0]} maxBarSize={16}>
            <LabelList dataKey="projetos" position="right" fontSize={12} fontWeight={600} fill="var(--text-primary)" formatter={(v: number) => inteiro(v)} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
