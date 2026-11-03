/**
 * Visão Geral: um cartão por funil, com o nome em destaque, o total de cards,
 * a parte do total e uma mini-barra com a proporção de cards por etapa.
 * Clicar (ou Enter/Espaço) abre a lista completa de etapas do funil.
 */
import { useState } from 'react'
import { number } from '../../../lib/palette'
import { percentualCurto } from '../../../lib/formatoGrafico'

export interface EtapaFunil { etapa: string; cards: number }
export interface ResumoFunil { funil: string; cards: number; etapas: EtapaFunil[] }

const MAX_SEGMENTOS = 5
const COR = (i: number, outros: boolean) => (outros ? 'var(--viz-outros)' : `var(--cat-${i + 1})`)

/** "04. FUNIL DE VENDAS SOLAR 🏆" → { numero: '04', nome: 'FUNIL DE VENDAS SOLAR 🏆' }. */
export function separarNumero(funil: string): { numero: string | null; nome: string } {
  const m = /^\s*(\d{1,3})\s*[.\-–)]\s*(.+)$/.exec(funil)
  return m ? { numero: m[1].padStart(2, '0'), nome: m[2].trim() } : { numero: null, nome: funil }
}

/** Até 5 segmentos: as 4 maiores etapas e o resto em "Outras etapas" (cinza). */
function segmentos(etapas: EtapaFunil[]) {
  if (etapas.length <= MAX_SEGMENTOS) return etapas.map((e, i) => ({ ...e, cor: COR(i, false) }))
  const base = etapas.slice(0, MAX_SEGMENTOS - 1).map((e, i) => ({ ...e, cor: COR(i, false) }))
  const resto = etapas.slice(MAX_SEGMENTOS - 1).reduce((a, e) => a + e.cards, 0)
  return [...base, { etapa: `Outras ${etapas.length - (MAX_SEGMENTOS - 1)} etapas`, cards: resto, cor: COR(0, true) }]
}

function CardFunil({ f, total }: { f: ResumoFunil; total: number }) {
  const [aberto, setAberto] = useState(false)
  const { numero, nome } = separarNumero(f.funil)
  const segs = segmentos(f.etapas)
  const parte = total ? (100 * f.cards) / total : 0
  const pctEtapa = (c: number) => percentualCurto(f.cards ? (100 * c) / f.cards : 0)
  const lista = aberto ? f.etapas.map((e, i) => ({ ...e, cor: segs[i]?.cor ?? COR(0, true) })) : segs.slice(0, 3)

  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={() => setAberto(!aberto)}
        aria-expanded={aberto}
        aria-label={`${f.funil}: ${number.format(f.cards)} cards, ${percentualCurto(parte)} do total, ${f.etapas.length} etapas. ${aberto ? 'Recolher' : 'Ver todas as'} etapas.`}
        className="group flex h-full w-full flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left shadow-[0_1px_2px_rgba(19,45,70,0.06),0_4px_12px_rgba(19,45,70,0.05)] transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-[0_6px_20px_rgba(19,45,70,0.12)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        <span className="flex items-start gap-2.5">
          <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--navy-chip)] text-xs font-bold tabular-nums text-[var(--navy-chip-text)]">
            {numero ?? '—'}
          </span>
          <span className="min-w-0 flex-1 text-[13px] font-bold uppercase leading-snug tracking-wide text-[var(--text-primary)] [overflow-wrap:anywhere]" title={f.funil}>{nome}</span>
        </span>

        <span className="flex items-baseline justify-between gap-2">
          <span className="flex items-baseline gap-1.5">
            <b className="text-[1.75rem] font-semibold leading-none tabular-nums text-[var(--text-primary)]">{number.format(f.cards)}</b>
            <span className="text-xs text-[var(--text-muted)]">{f.cards === 1 ? 'card' : 'cards'}</span>
          </span>
          <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--accent-text)]">{percentualCurto(parte)} do total</span>
        </span>

        <span aria-hidden="true" className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full bg-[var(--track-bg)]">
          {segs.map((s) => (
            <span key={s.etapa} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(100 * s.cards) / (f.cards || 1)}%`, background: s.cor }} title={`${s.etapa}: ${number.format(s.cards)}`} />
          ))}
        </span>

        <span className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1 text-xs">
          {lista.map((e) => (
            <span key={e.etapa} className="flex min-w-0 items-center gap-2">
              <i aria-hidden="true" className="h-2 w-2 shrink-0 rounded-[3px]" style={{ background: e.cor }} />
              <span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]" title={e.etapa}>{e.etapa}</span>
              <span className="shrink-0 tabular-nums font-semibold text-[var(--text-primary)]">{number.format(e.cards)}</span>
              <span className="w-10 shrink-0 text-right tabular-nums text-[var(--text-muted)]">{pctEtapa(e.cards)}</span>
            </span>
          ))}
        </span>

        <span className="mt-auto flex items-center justify-between border-t border-[var(--border)] pt-2 text-[11px] text-[var(--text-muted)]">
          <span>{f.etapas.length} {f.etapas.length === 1 ? 'etapa' : 'etapas'}</span>
          {f.etapas.length > 3 && <span className="font-semibold text-[var(--accent-text)] group-hover:underline">{aberto ? 'Recolher ▴' : 'Ver todas ▾'}</span>}
        </span>
      </button>
    </li>
  )
}

export function CardsFunil({ funis }: { funis: ResumoFunil[] }) {
  const total = funis.reduce((a, f) => a + f.cards, 0)
  return (
    <ul aria-label="Cards por funil" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {funis.map((f) => <CardFunil key={f.funil} f={f} total={total} />)}
    </ul>
  )
}
