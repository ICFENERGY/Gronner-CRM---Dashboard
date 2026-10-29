import type { ReactNode } from 'react'
import { ESTILO_COR, ROTULO_COR } from '../formato'
import type { Cor } from '../tipos'

/** Forma além da cor (losango, triângulo, círculo), para quem não distingue cores. */
function Forma({ cor }: { cor: Cor }) {
  if (cor === 'atrasado') return <i className={`inline-block h-2 w-2 rotate-45 ${ESTILO_COR.atrasado.barra}`} />
  if (cor === 'risco') return <i className={`inline-block h-2 w-2 ${ESTILO_COR.risco.barra}`} style={{ clipPath: 'polygon(50% 0,100% 100%,0 100%)' }} />
  return <i className={`inline-block h-2 w-2 rounded-full ${ESTILO_COR.ok.barra}`} />
}

export function Selo({ cor, children }: { cor: Cor; children?: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${ESTILO_COR[cor].pill}`}>
      <Forma cor={cor} />
      {children ?? ROTULO_COR[cor]}
    </span>
  )
}

export function SeloNeutro({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center whitespace-nowrap rounded-full bg-[var(--surface-hover)] px-2 py-0.5 text-xs font-semibold text-[var(--text-secondary)]">{children}</span>
}

export function Secao({ titulo, subtitulo, acoes, children }: { titulo: string; subtitulo?: ReactNode; acoes?: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">{titulo}</h2>
          {subtitulo && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{subtitulo}</p>}
        </div>
        {acoes}
      </div>
      {children}
    </section>
  )
}

/** Barra empilhada atrasado / risco / ok. */
export function BarraCores({ atrasado, risco, ok }: { atrasado: number; risco: number; ok: number }) {
  return (
    <div className="flex h-1.5 gap-0.5 overflow-hidden rounded" aria-hidden="true">
      {atrasado > 0 && <span className={ESTILO_COR.atrasado.barra} style={{ flex: atrasado }} />}
      {risco > 0 && <span className={ESTILO_COR.risco.barra} style={{ flex: risco }} />}
      {ok > 0 && <span className={ESTILO_COR.ok.barra} style={{ flex: ok }} />}
    </div>
  )
}
