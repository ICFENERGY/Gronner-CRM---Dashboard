import { MOMENTOS } from '../../../../shared/engenharia.js'
import { BarraCores, Selo } from '../componentes/Selo'
import { corDoGrupo, ESTILO_COR } from '../formato'
import type { CardEngenharia, Momento } from '../tipos'

const PALAVRA = { atrasado: 'Fora do prazo', risco: 'Em risco', ok: 'No prazo' } as const

/** Três blocos de veredito (um por momento) e o resumo "Para a reunião". */
export function Veredito({
  cards,
  meta,
  filtro,
  onFiltrar,
}: {
  cards: CardEngenharia[]
  meta: number
  filtro: Momento | null
  onFiltrar: (m: Momento | null) => void
}) {
  const atrasados = cards.filter((c) => c.cor === 'atrasado')
  const semPlano = atrasados.filter((c) => !c.acao).length
  const vencidas = cards.filter((c) => c.acaoVencida).length
  const abertas = cards.filter((c) => c.acao).length
  const comVenda = cards.filter((c) => c.diasDesdeVenda != null)
  const alemDaMeta = comVenda.filter((c) => (c.diasDesdeVenda ?? 0) > meta).length
  const semDono = cards.filter((c) => c.semDono).length

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {(Object.keys(MOMENTOS) as Momento[]).map((k) => {
        const g = cards.filter((c) => c.momento === k)
        const l = g.filter((c) => c.cor === 'atrasado').length
        const r = g.filter((c) => c.cor === 'risco').length
        const cor = corDoGrupo(l, r)
        const ativo = filtro === k
        return (
          <button
            key={k}
            type="button"
            aria-pressed={ativo}
            onClick={() => onFiltrar(ativo ? null : k)}
            className={`relative grid gap-2 overflow-hidden rounded-xl border bg-[var(--surface)] p-4 pl-5 text-left transition-colors hover:bg-[var(--surface-hover)] ${ativo ? 'border-icf-green ring-1 ring-icf-green' : 'border-[var(--border)]'}`}
          >
            <span className={`absolute inset-y-0 left-0 w-1.5 ${ESTILO_COR[cor].barra}`} />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">{MOMENTOS[k]}</span>
              <Selo cor={cor}>{PALAVRA[cor]}</Selo>
            </div>
            <div className="flex items-baseline gap-2">
              <b className="font-mono text-3xl font-medium tabular-nums">{l}</b>
              <span className="text-sm text-[var(--text-secondary)]">atrasados de {g.length}</span>
            </div>
            <BarraCores atrasado={l} risco={r} ok={g.length - l - r} />
            <span className="font-mono text-xs text-[var(--text-secondary)]">{l} atrasados · {r} em risco · {g.length - l - r} no prazo</span>
          </button>
        )
      })}
      <div className="relative grid gap-1.5 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 pl-5">
        <span className="absolute inset-y-0 left-0 w-1.5 bg-icf-green" />
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Para a reunião</span>
        <Linha rotulo="Atrasados sem plano" valor={semPlano} destaque={semPlano > 0} />
        <Linha rotulo="Ações combinadas vencidas" valor={vencidas} destaque={vencidas > 0} />
        <Linha rotulo="Ações abertas" valor={abertas} />
        <Linha rotulo={`Obras além de ${meta} dias da venda`} valor={`${alemDaMeta} de ${comVenda.length}`} />
        <Linha rotulo="Sem dono nominal no Groner" valor={semDono} suave />
      </div>
    </div>
  )
}

function Linha({ rotulo, valor, destaque, suave }: { rotulo: string; valor: number | string; destaque?: boolean; suave?: boolean }) {
  return (
    <div className="flex justify-between gap-2 text-sm">
      <span className="text-[var(--text-secondary)]">{rotulo}</span>
      <b className={`font-mono tabular-nums ${destaque ? ESTILO_COR.atrasado.texto : suave ? 'text-[var(--text-muted)]' : ''}`}>{valor}</b>
    </div>
  )
}
