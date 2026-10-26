/**
 * Pizza cheia para dados que são partes de um todo, seguindo a skill
 * de dataviz: no máximo 6 fatias (o resto vira "Outros", em cinza neutro), cor
 * fixa por ordem, percentuais (pt-BR) dentro das fatias >= 6%, legenda com nome, quantidade
 * e %, tooltip em toda fatia e versão em tabela (pelo Cartao).
 */
import { useMemo, useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { number } from '../../../lib/palette'
import type { Barra } from '../calculos'
import { Cartao, type LinhaTabela } from './base'

export const MAX_FATIAS = 6
const ICONE: Record<Estado, string> = { atrasado: '◆', risco: '▲', ok: '●' }
type Estado = 'atrasado' | 'risco' | 'ok'

export interface Fatia { nome: string; valor: number; cor: string; estado?: Estado; outros?: boolean }

export const pct = (v: number) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`

/** Ordena do maior para o menor, tira zeros e junta o excedente em "Outros" (máx. 6 fatias). */
export function prepararFatias(dados: { nome: string; valor: number }[], semaforo?: Record<string, Estado>): Fatia[] {
  const itens = dados.filter((d) => d.valor > 0)
  if (semaforo) {
    // Estado: a cor vem do semáforo (com ícone na legenda), não da ordem categórica.
    return itens.map((d) => {
      const estado = semaforo[d.nome]
      return estado ? { ...d, cor: `var(--st-${estado})`, estado } : { ...d, cor: 'var(--viz-outros)', outros: true }
    })
  }
  const ord = [...itens].sort((a, b) => b.valor - a.valor)
  const base = ord.length > MAX_FATIAS ? ord.slice(0, MAX_FATIAS - 1) : ord
  const fatias: Fatia[] = base.map((d, i) => ({ ...d, cor: `var(--cat-${i + 1})` }))
  if (ord.length > MAX_FATIAS) {
    fatias.push({ nome: 'Outros', valor: ord.slice(MAX_FATIAS - 1).reduce((a, d) => a + d.valor, 0), cor: 'var(--viz-outros)', outros: true })
  }
  return fatias
}

interface RotuloProps { cx: number; cy: number; midAngle: number; innerRadius: number; outerRadius: number; percent: number }
const RAD = Math.PI / 180

export function Rosca({
  dados,
  formatar = (v) => number.format(v),
  rotuloTotal = 'total',
  semaforo,
  onClicar,
}: {
  dados: { nome: string; valor: number }[]
  formatar?: (v: number) => string
  rotuloTotal?: string
  semaforo?: Record<string, Estado>
  onClicar?: (nome: string) => void
}) {
  const fatias = useMemo(() => prepararFatias(dados, semaforo), [dados, semaforo])
  const total = fatias.reduce((a, f) => a + f.valor, 0)
  const [ativa, setAtiva] = useState<string | null>(null)
  if (!total) return null

  const clicavel = (f: Fatia) => Boolean(onClicar) && !f.outros

  // Rótulo dentro da fatia só quando cabe (>= 6%); contorno escuro garante a leitura sobre qualquer cor.
  const rotulo = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: RotuloProps) => {
    if (percent < 0.06) return null
    const r = innerRadius + (outerRadius - innerRadius) * 0.62
    return (
      <text
        x={cx + r * Math.cos(-midAngle * RAD)}
        y={cy + r * Math.sin(-midAngle * RAD)}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={12}
        fontWeight={700}
        fill="#ffffff"
        stroke="rgba(11,31,51,0.75)"
        strokeWidth={3}
        strokeLinejoin="round"
        paintOrder="stroke"
        style={{ pointerEvents: 'none' }}
      >
        {pct(percent * 100)}
      </text>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="mx-auto h-[210px] w-full max-w-[260px]" role="img" aria-label={`Pizza com ${fatias.length} categorias, total ${formatar(total)} ${rotuloTotal}`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={fatias}
              dataKey="valor"
              nameKey="nome"
              innerRadius={0}
              outerRadius="96%"
              startAngle={90}
              endAngle={-270}
              paddingAngle={0}
              stroke="var(--viz-ring)"
              strokeWidth={1.5}
              isAnimationActive={false}
              label={rotulo as never}
              labelLine={false}
              onMouseEnter={(_, i) => setAtiva(fatias[i]?.nome ?? null)}
              onMouseLeave={() => setAtiva(null)}
              onClick={(_, i) => { const f = fatias[i]; if (f && clicavel(f)) onClicar!(f.nome) }}
            >
              {fatias.map((f) => (
                <Cell key={f.nome} fill={f.cor} fillOpacity={ativa && ativa !== f.nome ? 0.5 : 1} cursor={clicavel(f) ? 'pointer' : 'default'} />
              ))}
            </Pie>
            <Tooltip
              content={({ payload }) => {
                const f = payload?.[0]?.payload as Fatia | undefined
                if (!f) return null
                return (
                  <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-solid)] px-3 py-2 text-xs shadow-lg">
                    <p className="flex items-center gap-1.5 font-semibold text-[var(--text-primary)]"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: f.cor }} />{f.nome}</p>
                    <p className="font-mono text-[var(--text-secondary)]">{formatar(f.valor)} · {pct((100 * f.valor) / total)}</p>
                  </div>
                )
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <ul className="grid min-w-0 gap-0.5 text-sm" aria-label="Legenda">
        {fatias.map((f) => {
          const linha = (
            <>
              {f.estado ? (
                <span aria-hidden="true" className="w-3 text-center text-[11px] leading-none" style={{ color: f.cor }}>{ICONE[f.estado]}</span>
              ) : (
                <i aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: f.cor }} />
              )}
              <span className="min-w-0 flex-1 break-words text-left leading-tight text-[var(--text-primary)]" title={f.nome}>{f.nome}</span>
              <span className="shrink-0 whitespace-nowrap font-mono text-xs tabular-nums text-[var(--text-secondary)]">{formatar(f.valor)} · {pct((100 * f.valor) / total)}</span>
            </>
          )
          const cls = `flex items-center gap-2.5 rounded-md px-2 py-1 ${ativa === f.nome ? 'bg-[var(--surface-hover)]' : ''}`
          return (
            <li key={f.nome} className="min-w-0" onMouseEnter={() => setAtiva(f.nome)} onMouseLeave={() => setAtiva(null)}>
              {clicavel(f) ? (
                <button type="button" onClick={() => onClicar!(f.nome)} className={`${cls} w-full hover:bg-[var(--surface-hover)]`}>{linha}</button>
              ) : (
                <div className={cls}>{linha}</div>
              )}
            </li>
          )
        })}
        <li className="mt-1 flex items-center justify-between gap-2 border-t border-[var(--border)] px-2 pt-1.5 text-xs text-[var(--text-muted)]">
          <span className="uppercase tracking-wide">{rotuloTotal}</span>
          <span className="font-mono tabular-nums text-[var(--text-secondary)]">{formatar(total)}</span>
        </li>
      </ul>
    </div>
  )
}

/** Cartão com título, subtítulo, rosca e alternância para tabela. */
export function CartaoRosca({
  titulo,
  subtitulo,
  nota,
  dados,
  formatar,
  formatarTabela,
  colunaValor = 'Quantidade',
  rotuloTotal,
  semaforo,
  onClicar,
  onDetalhe,
  className,
}: {
  titulo: string
  subtitulo?: string
  nota?: string
  dados: Barra[] | { nome: string; valor: number }[]
  formatar?: (v: number) => string
  /** Formato do valor na tabela (padrão: o mesmo da legenda). */
  formatarTabela?: (v: number) => string
  colunaValor?: string
  rotuloTotal?: string
  semaforo?: Record<string, Estado>
  onClicar?: (nome: string) => void
  onDetalhe?: () => void
  className?: string
}) {
  const fatias = useMemo(() => prepararFatias(dados, semaforo), [dados, semaforo])
  const total = fatias.reduce((a, f) => a + f.valor, 0)
  const fmt = formatarTabela ?? formatar ?? ((v: number) => number.format(v))
  const linhas: LinhaTabela[] = fatias.map((f) => ({ nome: f.nome, valores: [fmt(f.valor), pct((100 * f.valor) / total)] }))
  return (
    <Cartao className={className} titulo={titulo} subtitulo={subtitulo} nota={nota} colunas={['Item', colunaValor, '%']} linhas={linhas} onDetalhe={onDetalhe}>
      <Rosca dados={dados} formatar={formatar} rotuloTotal={rotuloTotal} semaforo={semaforo} onClicar={onClicar} />
    </Cartao>
  )
}
