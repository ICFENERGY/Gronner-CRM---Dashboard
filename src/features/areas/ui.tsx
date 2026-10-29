import { useId, type ReactNode } from 'react'
import { CHAVE_FILTROS_PAINEL, ErrorBoundary } from '../../components/ErrorBoundary'
import { NOMES_MESES, hojeSP } from '../painel/periodo'
import { AREAS, type Alerta, type Area, type Filtros } from './calculos'
import type { Linha, Situacao, Tabela } from './indicadores'

/** Ícone "i" com a definição; abre no hover e no foco do teclado. */
export function Info({ rotulo, texto }: { rotulo: string; texto: string }) {
  const id = useId()
  return (
    <span className="group relative inline-flex align-middle">
      <button
        type="button"
        aria-label={`Definição de ${rotulo}`}
        aria-describedby={id}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-[var(--border-strong)] text-[10px] font-semibold leading-none text-[var(--text-muted)] hover:border-icf-green hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-icf-green"
      >
        i
      </button>
      <span
        role="tooltip"
        id={id}
        className="pointer-events-none absolute left-0 top-6 z-30 hidden w-72 rounded-lg border border-[var(--border)] bg-[var(--surface-solid)] px-3 py-2 text-left text-xs font-normal normal-case leading-snug tracking-normal text-[var(--text-secondary)] shadow-lg group-focus-within:block group-hover:block"
      >
        {texto}
      </span>
    </span>
  )
}

// ---------- Cabeçalho ----------
export interface FonteAtualizacao { fonte: string; quando: string | null; extra?: string }

/** A data mais antiga entre as fontes da aba (a aba vale até ela). */
function maisAntiga(fontes: FonteAtualizacao[]): FonteAtualizacao | null {
  const com = fontes.filter((f) => f.quando)
  if (!com.length) return null
  // dd/mm/aaaa hh:mm → aaaa-mm-dd hh:mm para comparar.
  const chave = (s: string) => `${s.slice(6, 10)}-${s.slice(3, 5)}-${s.slice(0, 2)} ${s.slice(11)}`
  return com.reduce((a, f) => (chave(f.quando!) < chave(a.quando!) ? f : a))
}

export function CabecalhoArea({ area, fontes, filtros, escopo, carregando }: { area: Area; fontes: FonteAtualizacao[]; filtros?: ReactNode; escopo: string; carregando?: boolean }) {
  const a = AREAS[area]
  const antiga = maisAntiga(fontes)
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h2 className="text-2xl font-bold leading-tight text-[var(--text-primary)]">{a.nome}</h2>
        <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
          Fonte: {a.fonte}
          <span aria-hidden="true"> · </span>
          <span title={fontes.map((f) => `${f.fonte}: ${f.quando ?? 'sem data'}`).join('\n')}>
            {antiga ? `atualizado em ${antiga.quando} (Brasília)` : carregando ? 'carregando…' : 'sem data de atualização'}
          </span>
        </p>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">{escopo}</p>
      </div>
      {filtros}
    </header>
  )
}

// ---------- Filtros (Vendas e Financeiro) ----------
const CHAVE_FILTROS = CHAVE_FILTROS_PAINEL
export const filtrosPadrao = (hoje = hojeSP()): Filtros => ({ ano: hoje.slice(0, 4), mes: hoje.slice(5, 7), vendedor: '' })

export function lerFiltros(): Filtros {
  const p = filtrosPadrao()
  try {
    const o = JSON.parse(window.localStorage.getItem(CHAVE_FILTROS) ?? '{}')
    return {
      ano: typeof o.ano === 'string' && /^\d{4}$/.test(o.ano) ? o.ano : p.ano,
      mes: typeof o.mes === 'string' && /^(|0[1-9]|1[0-2])$/.test(o.mes) ? o.mes : p.mes,
      vendedor: typeof o.vendedor === 'string' ? o.vendedor : '',
    }
  } catch {
    return p
  }
}
export function gravarFiltros(f: Filtros) {
  try { window.localStorage.setItem(CHAVE_FILTROS, JSON.stringify(f)) } catch { /* sem armazenamento local */ }
}

const select = 'rounded-lg border border-[var(--border-strong)] bg-[var(--input-bg)] px-2.5 py-1.5 text-sm text-[var(--text-primary)] focus:border-icf-green focus:outline-none focus-visible:ring-2 focus-visible:ring-icf-green'
const rotuloCampo = 'grid gap-1 text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]'

export function BarraFiltros({ filtros, onMudar, anos, vendedores }: { filtros: Filtros; onMudar: (f: Filtros) => void; anos: string[]; vendedores: string[] }) {
  const hoje = hojeSP()
  const lista = anos.includes(filtros.ano) ? anos : [...anos, filtros.ano].sort().reverse()
  const padrao = filtrosPadrao(hoje)
  const mudou = filtros.vendedor || filtros.ano !== padrao.ano || filtros.mes !== padrao.mes
  return (
    <div className="flex flex-wrap items-end gap-3" role="group" aria-label="Filtros da aba">
      <label className={rotuloCampo}>
        Ano
        <select className={select} value={filtros.ano} onChange={(e) => onMudar({ ...filtros, ano: e.target.value, mes: `${e.target.value}-${filtros.mes}` <= hoje.slice(0, 7) ? filtros.mes : '' })}>
          {lista.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </label>
      <label className={rotuloCampo}>
        Mês
        <select className={select} value={filtros.mes} onChange={(e) => onMudar({ ...filtros, mes: e.target.value })}>
          <option value="">Ano inteiro</option>
          {NOMES_MESES.map((m, i) => { const v = String(i + 1).padStart(2, '0'); return <option key={m} value={v} disabled={`${filtros.ano}-${v}` > hoje.slice(0, 7)}>{m}</option> })}
        </select>
      </label>
      <label className={rotuloCampo}>
        Vendedor
        <select className={`${select} min-w-[190px]`} value={filtros.vendedor} onChange={(e) => onMudar({ ...filtros, vendedor: e.target.value })}>
          <option value="">Todos</option>
          {vendedores.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </label>
      {mudou && (
        <button type="button" onClick={() => onMudar(padrao)} className="rounded-lg border border-[var(--border-strong)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:border-icf-green focus:outline-none focus-visible:ring-2 focus-visible:ring-icf-green">
          Voltar ao mês atual
        </button>
      )}
    </div>
  )
}

// ---------- Alertas ----------
const GRAVIDADE: Record<1 | 2 | 3, { rotulo: string; icone: string; cor: string }> = {
  1: { rotulo: 'Crítico', icone: '◆', cor: 'var(--st-atrasado)' },
  2: { rotulo: 'Atenção', icone: '▲', cor: 'var(--st-risco)' },
  3: { rotulo: 'Acompanhar', icone: '●', cor: 'var(--viz-axis)' },
}

/** De 0 a 3 alertas curtos da área; sem alerta, não aparece nada. */
export function AlertasArea({ area, itens, alvoDetalhe }: { area: Area; itens: Alerta[]; alvoDetalhe?: string }) {
  if (!itens.length) return null
  return (
    <section aria-label={`Alertas de ${AREAS[area].nome}`}>
      <ul className="grid gap-2 md:grid-cols-3">
        {itens.map((i) => {
          const g = GRAVIDADE[i.gravidade]
          return (
            <li key={i.id} className="flex min-w-0 flex-col gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] py-2 pl-3 pr-3" style={{ borderLeft: `4px solid ${g.cor}` }}>
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                <span aria-hidden="true" style={{ color: g.cor }}>{g.icone}</span>
                {g.rotulo}
              </span>
              <p className="text-sm leading-snug text-[var(--text-primary)]">
                <b className="mr-1 text-lg font-semibold tabular-nums">{i.numero}</b>
                {i.frase}
              </p>
              {alvoDetalhe && (
                <a href={`#${alvoDetalhe}`} onClick={(e) => { e.preventDefault(); document.getElementById(alvoDetalhe)?.scrollIntoView({ behavior: 'smooth' }) }} className="self-start text-xs font-semibold text-[var(--accent-text)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-icf-green">
                  Ver detalhe ›
                </a>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// ---------- Tabela de indicadores ----------
const SELO: Record<Exclude<Situacao, null>, { rotulo: string; icone: string; cor: string; texto: string }> = {
  ok: { rotulo: 'OK', icone: '●', cor: 'var(--st-ok)', texto: 'var(--txt-bom)' },
  atencao: { rotulo: 'Atenção', icone: '▲', cor: 'var(--st-risco)', texto: 'var(--txt-risco)' },
  critico: { rotulo: 'Crítico', icone: '◆', cor: 'var(--st-atrasado)', texto: 'var(--txt-ruim)' },
}

function Selo({ s }: { s: Situacao }) {
  if (!s) return <span className="text-[var(--text-muted)]" aria-label="Sem situação definida">—</span>
  const x = SELO[s]
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold" style={{ borderColor: x.cor, color: x.texto }}>
      <span aria-hidden="true" style={{ color: x.cor }}>{x.icone}</span>
      {x.rotulo}
    </span>
  )
}

function CelulaVariacao({ l }: { l: Linha }) {
  if (l.posicaoAtual) return <span className="text-[var(--text-muted)]">—</span>
  const v = l.variacao
  if (!v) return <span className="text-[var(--text-muted)]" title="Sem base de comparação (período anterior zerado ou sem dado)">—</span>
  const cor = v.tom === 'bom' ? 'var(--txt-bom)' : v.tom === 'ruim' ? 'var(--txt-ruim)' : 'var(--text-secondary)'
  const leitura = v.tom === 'bom' ? 'melhora' : v.tom === 'ruim' ? 'piora' : v.sentido === 'neutro' ? 'contexto' : 'estável'
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span className="font-semibold tabular-nums" style={{ color: cor }}>
        <span aria-hidden="true">{v.seta} </span>{v.texto}
      </span>
      <span className="text-[11px] text-[var(--text-muted)]">{leitura}</span>
    </span>
  )
}

/**
 * Tabela de indicadores da área: grupos com subtítulo, uma linha por
 * indicador, números à direita em fonte tabular, cabeçalho fixo ao rolar.
 */
export function TabelaIndicadores({ titulo, tabela }: { titulo: string; tabela: Tabela }) {
  const idTitulo = useId()
  const base = tabela.base
  return (
    <section aria-labelledby={idTitulo} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
      <ErrorBoundary variante="cartao">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <caption id={idTitulo} className="px-4 pb-2 pt-3 text-left">
            <span className="block text-base font-bold text-[var(--text-primary)]">{titulo}</span>
            <span className="block text-xs text-[var(--text-muted)]">
              {base ? `Período anterior: ${base} (mesmo trecho do período escolhido). ` : ''}Passe o mouse no “i” para ver a fórmula. Linhas marcadas “posição atual” mostram o dado de hoje, sem comparação.
            </span>
          </caption>
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
              {['Indicador', 'Atual', 'Período anterior', 'Variação', 'Situação'].map((c, i) => (
                <th key={c} scope="col" className={`sticky top-0 z-10 border-b border-[var(--border-strong)] bg-[var(--surface-solid)] px-4 py-2 font-semibold ${i === 0 ? 'text-left' : i === 4 ? 'text-center' : 'text-right'}`}>{c}</th>
              ))}
            </tr>
          </thead>
          {tabela.grupos.map((g) => (
            <tbody key={g.titulo}>
              <tr>
                <th scope="colgroup" colSpan={5} className="border-b border-[var(--border)] bg-[var(--bg)] px-4 pb-1.5 pt-3 text-left text-xs font-bold uppercase tracking-wide text-[var(--accent-text)]">{g.titulo}</th>
              </tr>
              {g.linhas.map((l, i) => (
                <tr key={l.id} className={i % 2 ? 'bg-[var(--surface-2)]' : ''}>
                  <th scope="row" className="border-b border-[var(--border)] px-4 py-2 text-left font-normal">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-medium text-[var(--text-primary)]">{l.nome}</span>
                      <span className="rounded bg-[var(--surface-hover)] px-1.5 py-px text-[11px] font-medium text-[var(--text-secondary)]">{l.unidade}</span>
                      <Info rotulo={l.nome} texto={l.definicao} />
                      {l.posicaoAtual && <span className="text-[11px] italic text-[var(--text-muted)]">posição atual</span>}
                    </span>
                    {l.nota && <span className="block text-xs text-[var(--text-muted)]">{l.nota}</span>}
                  </th>
                  <td className="whitespace-nowrap border-b border-[var(--border)] px-4 py-2 text-right text-[15px] font-semibold tabular-nums text-[var(--text-primary)]">{l.atual}</td>
                  <td className="whitespace-nowrap border-b border-[var(--border)] px-4 py-2 text-right tabular-nums text-[var(--text-secondary)]">
                    {l.posicaoAtual ? <span className="text-[var(--text-muted)]">—</span> : (l.anterior ?? <span className="text-[var(--text-muted)]">—</span>)}
                    {!l.posicaoAtual && l.base && l.base !== base && <span className="block text-[11px] text-[var(--text-muted)]">{l.base}</span>}
                  </td>
                  <td className="whitespace-nowrap border-b border-[var(--border)] px-4 py-2 text-right"><CelulaVariacao l={l} /></td>
                  <td className="border-b border-[var(--border)] px-4 py-2 text-center"><Selo s={l.situacao} /></td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </ErrorBoundary>
    </section>
  )
}

// ---------- Blocos abaixo da tabela ----------
export function CartaoGrafico({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">{titulo}</h3>
      {subtitulo && <p className="mb-2 text-xs text-[var(--text-muted)]">{subtitulo}</p>}
      <ErrorBoundary variante="cartao">{children}</ErrorBoundary>
    </section>
  )
}

export function SecaoDetalhe({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section id={id} aria-label={titulo} className="scroll-mt-4 grid grid-cols-[minmax(0,1fr)] gap-3">
      <h3 className="border-b border-[var(--border)] pb-1.5 text-base font-bold text-[var(--text-primary)]">{titulo}</h3>
      <ErrorBoundary variante="cartao">{children}</ErrorBoundary>
    </section>
  )
}

export function RodapeArea({ area, fontes }: { area: Area; fontes: FonteAtualizacao[] }) {
  return (
    <footer className="flex flex-wrap gap-x-4 gap-y-0.5 border-t border-[var(--border)] pt-2 text-xs text-[var(--text-muted)]">
      <span className="font-semibold text-[var(--text-secondary)]">{AREAS[area].nome} · Fonte: {AREAS[area].fonte}</span>
      {fontes.map((f) => (
        <span key={f.fonte}>{f.fonte}: {f.quando ? `atualizado em ${f.quando} (Brasília)` : 'sem data'}{f.extra ? ` · ${f.extra}` : ''}</span>
      ))}
    </footer>
  )
}

/** Estado da aba quando a fonte principal ainda não chegou ou falhou. */
export function EstadoFonte({ carregando, erro, vazio }: { carregando: boolean; erro: string | null; vazio: string }) {
  if (carregando) return <div className="h-64 animate-pulse rounded-xl bg-[var(--surface)]" aria-busy="true" aria-label="Carregando" />
  return <p role="status" className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--text-secondary)]">{erro ? `Não foi possível carregar: ${erro}.` : vazio}</p>
}
