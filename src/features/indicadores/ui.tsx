import type { ReactNode } from 'react'

/** Cores do semáforo de SLA e dos grupos, usadas só nos Indicadores. */
export const COR_OK = '#3d9a55'
export const COR_ATRASO = '#e8505b'
export const COR_GRUPO: Record<string, string> = { Vendas: '#4169e1', Financeiro: '#e8963a', Engenharia: '#0f9d94', Outros: '#9aa0aa' }
export const COR_SERIE = ['#4169e1', '#0f9d94', '#e8963a', '#8a5cd6', '#3d9a55', '#e8505b', '#9aa0aa']

/** Cartão escuro com título e uma nota à direita. */
export function Painel({ titulo, nota, children, className = '' }: { titulo: string; nota?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-xl border border-[var(--ind-borda)] bg-[var(--ind-card)] p-4 ${className}`}>
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="ind-titulo text-[15px] font-bold text-[var(--ind-texto)]">{titulo}</h3>
        {nota && <span className="text-[11px] text-[var(--ind-mudo)]">{nota}</span>}
      </header>
      {children}
    </section>
  )
}

export const Vazio = () => <p className="py-8 text-center text-xs text-[var(--ind-mudo)]">Sem dados para os filtros escolhidos.</p>

/** Lista com barra proporcional e rolagem (etapas, UF, cidades). */
export function ListaBarras({ itens, cor, altura = 190 }: { itens: { nome: string; valor: number }[]; cor: string; altura?: number }) {
  if (!itens.length) return <Vazio />
  const max = Math.max(...itens.map((i) => i.valor), 1)
  return (
    <ul className="ind-scroll space-y-2 overflow-y-auto pr-2" style={{ maxHeight: altura }}>
      {itens.map((i) => (
        <li key={i.nome}>
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate text-[var(--ind-texto)]" title={i.nome}>{i.nome}</span>
            <b className="tabular-nums text-[var(--ind-texto)]">{i.valor.toLocaleString('pt-BR')}</b>
          </div>
          <div className="mt-1 h-[3px] rounded bg-[var(--ind-trilho)]"><div className="h-full rounded" style={{ width: `${(100 * i.valor) / max}%`, background: cor }} /></div>
        </li>
      ))}
    </ul>
  )
}

export interface Parte { nome: string; valor: number; cor: string }
export interface Coluna { rotulo: string; partes: Parte[] }

/** Colunas empilhadas (ou simples, com uma parte só), com o total em cima de cada uma. */
export function Colunas({ colunas, altura = 190, larguraMin = 28, rotuloInclinado = false }: { colunas: Coluna[]; altura?: number; larguraMin?: number; rotuloInclinado?: boolean }) {
  if (!colunas.length) return <Vazio />
  const totais = colunas.map((c) => c.partes.reduce((a, p) => a + p.valor, 0))
  const max = Math.max(...totais, 1)
  return (
    <div className="ind-scroll overflow-x-auto pb-1">
      <div className="flex items-end gap-1" style={{ height: altura + 34, minWidth: colunas.length * larguraMin }}>
        {colunas.map((c, i) => (
          <div key={c.rotulo} className="flex min-w-0 flex-1 flex-col items-center justify-end" style={{ height: '100%' }} title={`${c.rotulo}: ${c.partes.map((p) => `${p.nome} ${p.valor}`).join(' · ')}`}>
            <span className="mb-0.5 text-[10px] font-bold tabular-nums text-[var(--ind-texto)]">{totais[i].toLocaleString('pt-BR')}</span>
            <div className="flex w-full max-w-[80px] flex-col-reverse overflow-hidden rounded-t-sm" style={{ height: `${Math.max((100 * totais[i]) / max, totais[i] ? 1.5 : 0) * (altura / 100)}px` }}>
              {c.partes.map((p) => p.valor > 0 && <div key={p.nome} style={{ flexGrow: p.valor, background: p.cor }} />)}
            </div>
            <span className={`mt-1 h-6 w-full overflow-hidden text-center text-[9px] leading-tight text-[var(--ind-mudo)] ${rotuloInclinado ? 'whitespace-nowrap' : ''}`}>{c.rotulo}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function Legenda({ itens }: { itens: { nome: string; cor: string }[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--ind-texto)]">
      {itens.map((i) => <span key={i.nome} className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-[2px]" style={{ background: i.cor }} />{i.nome}</span>)}
    </div>
  )
}

/** Rosca em SVG: fatias com o total (ou texto) no centro. */
export function Rosca({ partes, centro, legenda = 'cards', tamanho = 150, espessura = 22 }: { partes: Parte[]; centro?: ReactNode; legenda?: string; tamanho?: number; espessura?: number }) {
  const total = partes.reduce((a, p) => a + p.valor, 0)
  const r = (tamanho - espessura) / 2
  const c = 2 * Math.PI * r
  let acumulado = 0
  return (
    <div className="relative shrink-0" style={{ width: tamanho, height: tamanho }}>
      <svg viewBox={`0 0 ${tamanho} ${tamanho}`} width={tamanho} height={tamanho} role="img" aria-label={partes.map((p) => `${p.nome} ${p.valor}`).join(', ')}>
        <circle cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none" stroke="var(--ind-trilho)" strokeWidth={espessura} />
        {total > 0 && partes.map((p) => {
          if (p.valor <= 0) return null
          const len = (p.valor / total) * c
          const el = (
            <circle key={p.nome} cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none" stroke={p.cor} strokeWidth={espessura} strokeDasharray={`${Math.max(len - (partes.length > 1 ? 1 : 0), 0.5)} ${c}`} strokeDashoffset={-acumulado} transform={`rotate(-90 ${tamanho / 2} ${tamanho / 2})`}>
              <title>{`${p.nome}: ${p.valor.toLocaleString('pt-BR')} (${((100 * p.valor) / total).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%)`}</title>
            </circle>
          )
          acumulado += len
          return el
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        {centro ?? <><b className="ind-titulo text-2xl text-[var(--ind-texto)]">{total.toLocaleString('pt-BR')}</b><span className="text-[10px] text-[var(--ind-mudo)]">{legenda}</span></>}
      </div>
    </div>
  )
}

export function Kpi({ rotulo, valor, sub, cor }: { rotulo: string; valor: string; sub: string; cor: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-[var(--ind-borda)] bg-[var(--ind-card)] p-4" style={{ borderLeft: `3px solid ${cor}` }}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--ind-mudo)]">{rotulo}</p>
      <p className="ind-titulo mt-1 truncate text-[28px] leading-tight text-[var(--ind-texto)]">{valor}</p>
      <p className="text-[11px] text-[var(--ind-mudo)]">{sub}</p>
    </div>
  )
}
