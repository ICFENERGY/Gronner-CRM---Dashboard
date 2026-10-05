import { LIMITES_PARADO, MOMENTOS } from '../../../../shared/engenharia.js'
import { num } from '../formato'
import type { Momento, Painel } from '../tipos'

/** Onde os cards estão hoje: uma barra por marco, colorida pelos dias sem atualização. */
export function FluxoMarcos({ painel }: { painel: Painel }) {
  const max = Math.max(1, ...painel.fluxo.map((f) => f.verde + f.amarelo + f.vermelho))
  return (
    <div className="grid gap-1">
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-green-500 align-[-1px]" />Verde · até {LIMITES_PARADO.verde} dias</span>
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-amber-400 align-[-1px]" />Amarelo · {LIMITES_PARADO.verde + 1} a {LIMITES_PARADO.amarelo} dias</span>
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-red-500 align-[-1px]" />Vermelho · mais de {LIMITES_PARADO.amarelo} dias</span>
        <span className="ml-auto font-mono">kWp à direita</span>
      </div>
      {(Object.keys(MOMENTOS) as Momento[]).map((mom) => (
        <div key={mom} className="grid gap-1">
          <div className="mt-3 flex items-baseline justify-between border-b border-[var(--border)] pb-1 first:mt-0">
            <h3 className="text-sm font-semibold">{MOMENTOS[mom]}</h3>
            <span className="font-mono text-xs text-[var(--text-secondary)]">{painel.porMomento[mom].n} cards · {num(painel.porMomento[mom].kwp)} kWp</span>
          </div>
          {painel.fluxo.filter((f) => f.momento === mom).map((f) => {
            const tot = f.verde + f.amarelo + f.vermelho
            const largura = (100 * tot) / max
            const titulo = [`${f.marco} · ${f.nome}`, `${f.verde} verde · ${f.amarelo} amarelo · ${f.vermelho} vermelho`, `Mediana de ${f.diasMediana ?? '—'} dias sem atualização`, ...Object.entries(f.status).map(([s, n]) => `${s}: ${n}`)].join('\n')
            return (
              <div key={f.marco} title={titulo} className="grid grid-cols-[minmax(120px,230px)_minmax(0,1fr)_72px] items-center gap-3 rounded py-0.5 hover:bg-[var(--surface-hover)]">
                <span className="truncate text-sm">{f.marco} · {f.nome}</span>
                <span className="flex h-4 items-stretch gap-0.5">
                  {tot > 0 && (
                    <span className="flex overflow-hidden rounded" style={{ width: `${largura}%` }}>
                      {f.verde > 0 && <span className="bg-green-500" style={{ flex: f.verde }} />}
                      {f.amarelo > 0 && <span className="bg-amber-400" style={{ flex: f.amarelo }} />}
                      {f.vermelho > 0 && <span className="bg-red-500" style={{ flex: f.vermelho }} />}
                    </span>
                  )}
                  <span className="pl-1.5 font-mono text-xs leading-4 text-[var(--text-secondary)]">{tot}</span>
                </span>
                <span className="text-right font-mono text-xs text-[var(--text-muted)]">{num(f.kwp, 1)}</span>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
