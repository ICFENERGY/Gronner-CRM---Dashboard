import { MARCOS, MOMENTOS } from '../../../../shared/engenharia.js'
import { corDoGrupo, ESTILO_COR } from '../formato'
import type { CardEngenharia, Momento } from '../tipos'

/** Régua dos 16 marcos: quantos cards em cada um e quantos atrasados. Clique filtra a pauta. */
export function ReguaMarcos({
  cards,
  prazos,
  filtro,
  onFiltrar,
}: {
  cards: CardEngenharia[]
  prazos: Record<string, number>
  filtro: string | null
  onFiltrar: (marco: string | null) => void
}) {
  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-[760px] gap-3.5">
        {(Object.keys(MOMENTOS) as Momento[]).map((mom) => {
          const marcos = MARCOS.filter((m) => m.mom === mom)
          return (
            <div key={mom} className="grid gap-1.5" style={{ flex: marcos.length }}>
              <span className="font-mono text-[11px] uppercase tracking-wide text-[var(--text-muted)]">{MOMENTOS[mom]}</span>
              <div className="flex gap-1">
                {marcos.map((m) => {
                  const g = cards.filter((c) => c.marco === m.k)
                  const l = g.filter((c) => c.cor === 'atrasado').length
                  const r = g.filter((c) => c.cor === 'risco').length
                  const ativo = filtro === m.k
                  return (
                    <button
                      key={m.k}
                      type="button"
                      disabled={!g.length}
                      aria-pressed={ativo}
                      onClick={() => onFiltrar(ativo ? null : m.k)}
                      title={`${m.k} · ${m.nome}\n${g.length} cards · ${l} atrasados · ${r} em risco\nPrazo: ${prazos[m.k]} dias`}
                      aria-label={`Marco ${m.k} ${m.nome}: ${g.length} cards, ${l} atrasados`}
                      className={`relative grid min-w-0 flex-1 justify-items-center gap-0.5 overflow-hidden rounded-md border bg-[var(--bg)] px-1 pb-1 pt-2 disabled:opacity-40 ${ativo ? 'border-icf-green ring-1 ring-icf-green' : 'border-[var(--border)] hover:border-[var(--border-strong)]'}`}
                    >
                      {g.length > 0 && <span className={`absolute inset-x-0 top-0 h-1 ${ESTILO_COR[corDoGrupo(l, r)].barra}`} />}
                      <span className="font-mono text-[11px] text-[var(--text-muted)]">{m.k}</span>
                      <span className="font-mono text-base font-medium tabular-nums">{g.length || '·'}</span>
                      <span className={`min-h-[0.75rem] font-mono text-[10px] ${ESTILO_COR.atrasado.texto}`}>{l ? `${l} atr.` : ''}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
