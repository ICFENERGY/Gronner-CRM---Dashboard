import { useState } from 'react'
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

/** Soma dias a uma data "AAAA-MM-DD" (conta em UTC, sem depender do fuso do navegador). */
export function somarDias(data: string, dias: number) {
  const d = new Date(`${data}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/**
 * Linhas do período [de, ate], uma por dia do calendário. O dia sem captura do farol
 * entra sem barra (semCaptura), para o buraco aparecer no gráfico em vez de sumir.
 */
export function janelaFarol(historico: Farol, de: string, ate: string) {
  const porDia = new Map(historico.map((h) => [h.data.slice(0, 10), h]))
  const linhas = []
  // Trava de segurança: no máximo 366 dias, mesmo com datas digitadas erradas.
  for (let dia = de, i = 0; dia <= ate && i < 366; dia = somarDias(dia, 1), i++) {
    const h = porDia.get(dia)
    linhas.push(h
      // O dia estimado (importado de print) leva um asterisco no rótulo do eixo.
      ? { ...linhasFarol([h])[0], dia: diaMes(dia) + (h.estimado ? '*' : ''), data: dia, semCaptura: false, estimado: Boolean(h.estimado) }
      : { dia: diaMes(dia), data: dia, semCaptura: true, estimado: false })
  }
  return linhas
}

const PERIODOS = [7, 15, 30] as const

/** Barras empilhadas por dia, com filtro de período; o total aparece no topo de cada barra. */
export function FarolDiario({ historico, hoje }: { historico: Farol; hoje: string }) {
  // Padrão: hoje e os 7 dias anteriores.
  const [de, setDe] = useState(() => somarDias(hoje, -7))
  const [ate, setAte] = useState(hoje)
  const dados = janelaFarol(historico, de, ate)
  const comCaptura = dados.filter((d) => !d.semCaptura).length
  const estimados = dados.filter((d) => d.estimado).length
  const eixo = { stroke: 'var(--viz-axis)', fontSize: 11, tickLine: false }
  const campo = 'h-9 rounded-[9px] border border-[var(--border-strong)] bg-[var(--input-bg)] px-2.5 text-sm text-[var(--text-primary)] focus:border-icf-green focus:outline-none'
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div role="group" aria-label="Período do farol" className="inline-flex overflow-hidden rounded-[9px] border border-[var(--border-strong)]">
          {PERIODOS.map((n) => {
            const ativo = ate === hoje && de === somarDias(hoje, -n)
            return (
              <button key={n} type="button" aria-pressed={ativo} onClick={() => { setDe(somarDias(hoje, -n)); setAte(hoje) }}
                className={`h-9 px-3 text-sm font-semibold transition-colors ${ativo ? 'bg-[var(--navy-chip)] text-[var(--navy-chip-text)]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'}`}>
                {n} dias
              </button>
            )
          })}
        </div>
        <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          De
          <input type="date" value={de} max={ate} onChange={(e) => e.target.value && setDe(e.target.value)} className={campo} />
        </label>
        <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Até
          <input type="date" value={ate} min={de} max={hoje} onChange={(e) => e.target.value && setAte(e.target.value)} className={campo} />
        </label>
        <p className="ml-auto text-xs text-[var(--text-muted)]">
          {comCaptura} de {dados.length} dia(s) com captura do farol{comCaptura < dados.length ? ' · dia sem barra = sem captura registrada' : ''}
        </p>
      </div>
      {comCaptura === 0 ? (
        <p className="py-10 text-center text-xs text-[var(--text-muted)]">Sem captura do farol neste período.</p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={dados} margin={{ top: 24, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
            <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
            <XAxis dataKey="dia" {...eixo} interval={dados.length > 16 ? 'preserveStartEnd' : 0} />
            <YAxis {...eixo} axisLine={false} width={36} allowDecimals={false} />
            <Tooltip {...dica} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} formatter={(v) => <span style={{ color: 'var(--text-secondary)' }}>{v}</span>} />
            {SERIE_FAROL.map((s, i) => (
              <Bar key={s.chave} dataKey={s.chave} stackId="farol" fill={s.cor} isAnimationActive={false} maxBarSize={44}>
                {i === SERIE_FAROL.length - 1 && (
                  <LabelList dataKey="total" position="top" formatter={(v: number) => (v == null ? '' : quantidadeCurta(v))} style={estiloRotulo} />
                )}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
      {estimados > 0 && (
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          * {estimados} dia(s) estimado(s): valores medidos num gráfico antigo (imagem), com margem de 1 a 2 usinas por faixa, e contando todas as usinas da conta. Os dias sem asterisco vêm da API SolarZ, que só informa o farol das usinas premium.
        </p>
      )}
    </div>
  )
}
