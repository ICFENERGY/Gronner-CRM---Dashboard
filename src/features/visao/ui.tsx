import { useId, useState, type ReactNode } from 'react'
import { ErrorBoundary } from '../../components/ErrorBoundary'
import type { Delta, Estado, ItemAtencao, KpiVisao } from './calculos'

const ICONE: Record<Estado, string> = { atrasado: '◆', risco: '▲', ok: '●' }

/** Ícone "i" com a definição do número; abre no hover e no foco do teclado. */
export function Info({ rotulo, texto }: { rotulo: string; texto: string }) {
  const id = useId()
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={`O que é ${rotulo}`}
        aria-describedby={id}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-[var(--border-strong)] text-[10px] font-semibold leading-none text-[var(--text-muted)] hover:border-icf-green hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-icf-green"
      >
        i
      </button>
      <span
        role="tooltip"
        id={id}
        className="pointer-events-none absolute left-1/2 top-6 z-30 hidden w-60 -translate-x-1/2 rounded-lg border border-[var(--border)] bg-[var(--surface-solid)] px-3 py-2 text-left text-xs font-normal normal-case leading-snug tracking-normal text-[var(--text-secondary)] shadow-lg group-focus-within:block group-hover:block"
      >
        {texto}
      </span>
    </span>
  )
}

function Variacao({ d }: { d: Delta }) {
  const cor = d.tom === 'bom' ? 'text-[var(--txt-bom)]' : d.tom === 'ruim' ? 'text-[var(--txt-ruim)]' : 'text-[var(--text-secondary)]'
  return (
    <span className="flex flex-wrap items-baseline gap-x-1.5 text-xs">
      <b className={`font-semibold ${cor}`}>{d.texto}</b>
      <span className="sr-only">{d.tom === 'bom' ? '(melhora)' : d.tom === 'ruim' ? '(piora)' : '(estável)'}</span>
      <span className="text-[var(--text-muted)]">{d.base}</span>
    </span>
  )
}

/** Um número grande com rótulo, definição, variação e contexto. */
export function Kpi({ k }: { k: KpiVisao }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg bg-[var(--surface-2)] px-3 py-2.5">
      <span className="flex items-start justify-between gap-1.5 text-xs font-medium leading-tight text-[var(--text-secondary)]">
        <span className="min-w-0">{k.rotulo}</span>
        <Info rotulo={k.rotulo.toLowerCase()} texto={k.definicao} />
      </span>
      <span className="flex items-baseline gap-1.5" title={k.valorExato}>
        {k.estado && k.estado !== 'ok' && (
          <span aria-hidden="true" className="text-xs" style={{ color: `var(--st-${k.estado})` }}>{ICONE[k.estado]}</span>
        )}
        <b className="whitespace-nowrap text-[1.625rem] font-semibold leading-none text-[var(--text-primary)]">{k.valor}</b>
      </span>
      {k.delta && <Variacao d={k.delta} />}
      {k.contexto && <span className="text-xs leading-snug text-[var(--text-muted)]">{k.contexto}</span>}
    </div>
  )
}

export interface RodapeFonte { fonte: string; quando: string | null; extra?: string }

/**
 * Bloco de uma área: cabeçalho (área, escopo, link para o detalhe), KPIs, uma
 * frase de leitura, um gráfico e o rodapé com a fonte e a hora da atualização.
 * Sem dado, mostra só uma linha com o motivo.
 */
export function Bloco({
  area,
  escopo,
  aviso,
  onAbrir,
  rotuloAbrir,
  extra,
  estado,
  motivo,
  kpis,
  frase,
  tituloGrafico,
  grafico,
  tabela,
  rodape,
}: {
  area: string
  escopo: string
  aviso?: string
  onAbrir: () => void
  rotuloAbrir: string
  /** Segundo link do cabeçalho (ex.: funil por etapa). */
  extra?: { rotulo: string; onClick: () => void }
  estado: 'ok' | 'carregando' | 'sem-dados'
  motivo?: string
  kpis?: KpiVisao[]
  frase?: string
  tituloGrafico?: string
  grafico?: ReactNode
  tabela?: { colunas: string[]; linhas: (string | number)[][] }
  rodape: RodapeFonte[]
}) {
  const [verTabela, setVerTabela] = useState(false)
  const idTitulo = useId()
  return (
    <section aria-labelledby={idTitulo} className="flex min-w-0 flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--border)] px-4 pb-2.5 pt-3">
        <div className="min-w-0">
          <h2 id={idTitulo} className="text-base font-bold text-[var(--text-primary)]">{area}</h2>
          <p className="text-xs text-[var(--text-muted)]">{escopo}</p>
        </div>
        <div className="flex gap-1">
          {extra && (
            <button type="button" onClick={extra.onClick} className="rounded-md px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-icf-green">
              {extra.rotulo}
            </button>
          )}
          <button type="button" onClick={onAbrir} className="rounded-md px-2 py-1 text-xs font-semibold text-[var(--accent-text)] hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-icf-green">
            {rotuloAbrir} ›
          </button>
        </div>
      </header>

      <ErrorBoundary variante="cartao">
        {estado === 'carregando' && (
          <div className="grid gap-3 p-4" aria-busy="true">
            <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-[92px] animate-pulse rounded-lg bg-[var(--surface-2)]" />)}</div>
            <p className="text-sm text-[var(--text-muted)]">Carregando…</p>
          </div>
        )}
        {estado === 'sem-dados' && <p className="px-4 py-4 text-sm text-[var(--text-secondary)]">{motivo}</p>}
        {estado === 'ok' && (
          <div className="flex flex-1 flex-col gap-3 px-4 pb-3 pt-3">
            <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">{kpis?.map((k) => <Kpi key={k.id} k={k} />)}</div>
            {frase && <p className="border-l-[3px] border-icf-green pl-3 text-sm font-medium leading-snug text-[var(--text-primary)]">{frase}</p>}
            {aviso && <p className="text-xs text-[var(--text-muted)]">{aviso}</p>}
            {grafico && (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">{tituloGrafico}</h3>
                  {tabela && (
                    <button type="button" onClick={() => setVerTabela(!verTabela)} aria-pressed={verTabela} className="rounded px-1.5 py-0.5 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-icf-green">
                      {verTabela ? 'Ver gráfico' : 'Ver tabela'}
                    </button>
                  )}
                </div>
                <ErrorBoundary variante="cartao">
                  {verTabela && tabela ? (
                    <div className="max-h-[260px] overflow-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-[var(--surface-solid)] text-left text-[var(--text-muted)]">
                          <tr>{tabela.colunas.map((c, i) => <th key={c} className={`pb-1 pr-2 font-medium ${i ? 'text-right' : ''}`}>{c}</th>)}</tr>
                        </thead>
                        <tbody>
                          {tabela.linhas.map((l, i) => (
                            <tr key={i} className="border-t border-[var(--border)]">
                              {l.map((v, j) => <td key={j} className={`py-1 pr-2 ${j ? 'text-right tabular-nums text-[var(--text-secondary)]' : ''}`}>{v}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="flex min-h-0 flex-1 flex-col">{grafico}</div>
                  )}
                </ErrorBoundary>
              </div>
            )}
          </div>
        )}
      </ErrorBoundary>

      <footer className="mt-auto flex flex-wrap gap-x-3 gap-y-0.5 border-t border-[var(--border)] px-4 py-2 text-[11px] text-[var(--text-muted)]">
        {rodape.map((r) => (
          <span key={r.fonte}>
            Fonte: {r.fonte}{r.quando ? ` · atualizado em ${r.quando}` : ''}{r.extra ? ` · ${r.extra}` : ''}
          </span>
        ))}
      </footer>
    </section>
  )
}

const GRAVIDADE: Record<1 | 2 | 3, { rotulo: string; icone: string; cor: string }> = {
  1: { rotulo: 'Crítico', icone: '◆', cor: 'var(--st-atrasado)' },
  2: { rotulo: 'Atenção', icone: '▲', cor: 'var(--st-risco)' },
  3: { rotulo: 'Acompanhar', icone: '●', cor: 'var(--viz-axis)' },
}

/** Faixa "O que precisa de atenção agora": itens já ordenados pela gravidade. */
export function FaixaAtencao({ itens, carregando, onAcao }: { itens: ItemAtencao[]; carregando: boolean; onAcao: (i: ItemAtencao) => void }) {
  return (
    <section aria-labelledby="titulo-atencao" className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="titulo-atencao" className="text-base font-bold text-[var(--text-primary)]">O que precisa de atenção agora</h2>
        <p className="text-xs text-[var(--text-muted)]">Posição de hoje na empresa inteira · não segue os filtros · do mais grave para o menos grave</p>
      </div>
      {itens.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">{carregando ? 'Carregando as fontes…' : 'Nada pede ação imediata nas fontes carregadas.'}</p>
      ) : (
        <ol className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {itens.map((i) => {
            const g = GRAVIDADE[i.gravidade]
            return (
              <li key={i.id} className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] py-2.5 pl-3 pr-3" style={{ borderLeft: `4px solid ${g.cor}` }}>
                <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                  <span aria-hidden="true" style={{ color: g.cor }}>{g.icone}</span>
                  {g.rotulo} · {i.area}
                </span>
                <p className="text-sm leading-snug text-[var(--text-primary)]">
                  <b className="mr-1 text-xl font-semibold">{i.numero}</b>
                  {i.frase}
                </p>
                <button type="button" onClick={() => onAcao(i)} className="self-start rounded px-1 py-0.5 text-xs font-semibold text-[var(--accent-text)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-icf-green">
                  {i.acao.rotulo} ›
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
