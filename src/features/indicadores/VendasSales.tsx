import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api/client'
import { useRawData } from '../../api/useRawData'
import type { VendaRaw } from '../../api/types'
import { dataCurtaBr } from '../../lib/datas'
import { currency, number } from '../../lib/palette'
import { MESES_NOME } from './calculos'
import { COR_SERIE, Colunas, Kpi, ListaBarras, Painel, Rosca } from './ui'

const PCT = (v: number) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
const CAMPO = 'rounded-md border border-[var(--ind-borda)] bg-[var(--ind-fundo)] px-2.5 py-1.5 text-[13px] text-[var(--ind-texto)] focus:border-[var(--ind-acento)] focus:outline-none'
const ano = (v: VendaRaw) => v.dataVenda?.slice(0, 4) ?? ''
const mesIdx = (v: VendaRaw) => Number(v.dataVenda?.slice(5, 7)) - 1

function contar(vendas: VendaRaw[], chave: (v: VendaRaw) => string) {
  const m = new Map<string, number>()
  for (const v of vendas) m.set(chave(v), (m.get(chave(v)) ?? 0) + 1)
  return [...m.entries()].map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome, 'pt-BR'))
}

/** Rosca com legenda ao lado: nome, quantidade e %. */
function RoscaPainel({ titulo, vendas, itens, sub }: { titulo: string; vendas: number; itens: { nome: string; valor: number }[]; sub: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-[var(--ind-fundo)] p-3">
      <h4 className="ind-titulo text-[15px] font-bold text-[var(--ind-texto)]">{titulo}</h4>
      <p className="mb-2 text-[11px] text-[var(--ind-mudo)]">{number.format(vendas)} card(s) · {sub}</p>
      <div className="flex flex-col items-center gap-3">
        <Rosca partes={itens.map((i, k) => ({ nome: i.nome, valor: i.valor, cor: COR_SERIE[k % COR_SERIE.length] }))} tamanho={150} espessura={22} legenda="cards" />
        <ul className="ind-scroll max-h-[260px] w-full space-y-1.5 overflow-y-auto pr-1 text-[11px]">
          {itens.map((i, k) => (
            <li key={i.nome} className="flex gap-1.5"><i className="mt-1 h-2 w-2 shrink-0 rounded-[2px]" style={{ background: COR_SERIE[k % COR_SERIE.length] }} /><span className="min-w-0 text-[var(--ind-texto)]">{i.nome}<br /><span className="text-[var(--ind-mudo)]">{number.format(i.valor)} ({PCT((100 * i.valor) / (vendas || 1))})</span></span></li>
          ))}
        </ul>
      </div>
    </div>
  )
}

type Metas = Record<string, { min: number[]; previsto: number[] }>
const CHAVE_METAS = 'groner-metas-vendedor'
const lerMetas = (): Metas => { try { return JSON.parse(localStorage.getItem(CHAVE_METAS) ?? '{}') } catch { return {} } }

/** Meta por vendedor e ano. Fica guardada neste navegador (ainda não há onde gravar no servidor). */
function MetaPorVendedor({ vendedores, anos, vendas }: { vendedores: string[]; anos: string[]; vendas: VendaRaw[] }) {
  const [vend, setVend] = useState('')
  const [anoSel, setAnoSel] = useState('')
  const [metas, setMetas] = useState<Metas>(lerMetas)
  const chave = `${vend}|${anoSel}`
  const vazio = () => Array<number>(12).fill(0)
  const atual = metas[chave] ?? { min: vazio(), previsto: vazio() }
  const [rascunho, setRascunho] = useState(atual)
  useEffect(() => setRascunho(metas[chave] ?? { min: vazio(), previsto: vazio() }), [chave, metas])
  const vendido = vazio()
  if (vend && anoSel) for (const v of vendas) if (v.vendedor === vend && ano(v) === anoSel) vendido[mesIdx(v)] += v.valorTotal
  const edita = (campo: 'min' | 'previsto', i: number, valor: string) => setRascunho((r) => ({ ...r, [campo]: r[campo].map((x, k) => (k === i ? Number(valor.replace(',', '.')) || 0 : x)) }))
  const salvar = () => {
    const novo = { ...metas, [chave]: rascunho }
    setMetas(novo)
    try { localStorage.setItem(CHAVE_METAS, JSON.stringify(novo)) } catch { /* sem armazenamento: a meta vale só nesta sessão */ }
  }
  const pronto = Boolean(vend && anoSel)
  const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
  const linha = (rot: string, campo: 'min' | 'previsto') => (
    <tr className="border-t border-[var(--ind-borda)]">
      <th scope="row" className="py-2 pr-3 text-left text-[11px] font-bold">{rot}</th>
      {rascunho[campo].map((x, i) => <td key={i} className="px-0.5"><input aria-label={`${rot} ${MESES_NOME[i]}`} disabled={!pronto} value={x || ''} placeholder="0,00" inputMode="decimal" onChange={(e) => edita(campo, i, e.target.value)} className={`${CAMPO} w-full min-w-[64px] text-right`} /></td>)}
      <td className="pl-2 text-right font-bold tabular-nums">{currency.format(total(rascunho[campo]))}</td>
    </tr>
  )
  return (
    <div className="rounded-lg border border-[var(--ind-borda)] bg-[var(--ind-fundo)] p-3">
      <div className="mb-3 flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wider text-[var(--ind-mudo)]">Vendedor<select value={vend} onChange={(e) => setVend(e.target.value)} className={CAMPO}><option value="">Selecione…</option>{vendedores.map((v) => <option key={v}>{v}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wider text-[var(--ind-mudo)]">Ano<select value={anoSel} onChange={(e) => setAnoSel(e.target.value)} className={CAMPO}><option value="">Selecione…</option>{anos.map((v) => <option key={v}>{v}</option>)}</select></label>
      </div>
      <div className="ind-scroll overflow-x-auto">
        <table className="w-full min-w-[980px] text-[12px] text-[var(--ind-texto)]">
          <thead><tr className="text-[10px] uppercase tracking-wider text-[var(--ind-mudo)]"><th className="py-1 text-left">Meta por vendedor</th>{MESES_NOME.map((m) => <th key={m} className="text-right font-bold">{m}</th>)}<th className="text-right">Total geral</th></tr></thead>
          <tbody>
            {linha('Valor mínimo de venda mensal', 'min')}
            {linha('Valor previsto de venda mensal', 'previsto')}
            <tr className="border-t border-[var(--ind-borda)] text-[#14b8a6]"><th scope="row" className="py-2 text-left text-[11px] font-bold">Total venda</th>{vendido.map((x, i) => <td key={i} className="px-1 text-right tabular-nums">{currency.format(x)}</td>)}<td className="text-right font-bold tabular-nums">{currency.format(total(vendido))}</td></tr>
            <tr className="border-t border-[var(--ind-borda)] text-[#e8963a]"><th scope="row" className="py-2 text-left text-[11px] font-bold">Taxa de conversão mensal</th>{vendido.map((x, i) => <td key={i} className="px-1 text-right tabular-nums">{rascunho.previsto[i] ? PCT((100 * x) / rascunho.previsto[i]) : '—'}</td>)}<td className="text-right">{total(rascunho.previsto) ? PCT((100 * total(vendido)) / total(rascunho.previsto)) : '—'}</td></tr>
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3"><p className="text-[11px] text-[var(--ind-mudo)]">As metas ficam guardadas neste navegador.</p><button type="button" disabled={!pronto} onClick={salvar} className="rounded-md border border-[var(--ind-borda)] px-3 py-1.5 text-xs text-[var(--ind-texto)] disabled:opacity-50">Salvar meta</button></div>
    </div>
  )
}

/** Vendas · Sales: negócios fechados, por vendedor, mês, estado e cidade, com extrato e meta por vendedor. */
export function VendasSales() {
  const { data, error } = useRawData('vendas', api.getVendasRaw)
  const [fAno, setFAno] = useState('')
  const [fVend, setFVend] = useState('')
  const [meta, setMeta] = useState(false)
  const [limite, setLimite] = useState(100)
  const todas = data ?? []
  const vendas = useMemo(() => todas.filter((v) => (!fAno || ano(v) === fAno) && (!fVend || v.vendedor === fVend)), [todas, fAno, fVend])
  const anos = useMemo(() => [...new Set(todas.map(ano).filter(Boolean))].sort().reverse(), [todas])
  const vendedores = useMemo(() => [...new Set(todas.map((v) => v.vendedor).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [todas])

  if (error && !data) return <p role="alert" className="rounded-lg border border-amber-600 bg-amber-950/40 px-4 py-2 text-sm text-amber-300">Não foi possível carregar as vendas: {error}.</p>
  if (!data) return <p role="status" className="py-10 text-center text-sm text-[var(--ind-mudo)]">Carregando as vendas…</p>

  const soma = vendas.reduce((a, v) => a + (v.valorTotal || 0), 0)
  const negocio = contar(vendas, (v) => v.tipo?.trim() || 'Não informado')
  const porVendedor = contar(vendas, (v) => v.vendedor || 'Sem vendedor')
  const porMes = contar(vendas, (v) => MESES_NOME[mesIdx(v)] ?? '—').sort((a, b) => MESES_NOME.indexOf(a.nome) - MESES_NOME.indexOf(b.nome))
  const porUf = contar(vendas, (v) => v.estado || '—')
  const porAno = contar(vendas, ano).sort((a, b) => a.nome.localeCompare(b.nome))
  const cidades = contar(vendas.filter((v) => v.cidade), (v) => v.cidade as string)
  const mensal = new Map<string, number>()
  for (const v of vendas) mensal.set(v.dataVenda.slice(0, 7), (mensal.get(v.dataVenda.slice(0, 7)) ?? 0) + (v.valorTotal || 0))
  const mensalOrd = [...mensal.entries()].sort(([a], [b]) => a.localeCompare(b))
  const extrato = [...vendas].sort((a, b) => b.dataVenda.localeCompare(a.dataVenda))
  const filtrado = Boolean(fAno || fVend)

  return (
    <div className="grid gap-4">
      <section aria-label="Filtros" className="rounded-xl border border-[var(--ind-borda)] bg-[var(--ind-card)] p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wider text-[var(--ind-mudo)]">Ano venda<select value={fAno} onChange={(e) => setFAno(e.target.value)} className={CAMPO}><option value="">Todos</option>{anos.map((a) => <option key={a}>{a}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wider text-[var(--ind-mudo)]">Vendedor<select value={fVend} onChange={(e) => setFVend(e.target.value)} className={`${CAMPO} min-w-[180px]`}><option value="">Todos</option>{vendedores.map((a) => <option key={a}>{a}</option>)}</select></label>
          <button type="button" disabled={!filtrado} onClick={() => { setFAno(''); setFVend('') }} className="rounded-md border border-[var(--ind-borda)] px-3 py-1.5 text-xs text-[var(--ind-mudo)] disabled:opacity-50">Limpar filtros</button>
          <button type="button" aria-expanded={meta} onClick={() => setMeta(!meta)} className="rounded-md border border-[var(--ind-borda)] px-3 py-1.5 text-xs text-[var(--ind-texto)]">Cadastrar meta por vendedor</button>
        </div>
        <p className="mt-3 text-[11px] text-[var(--ind-mudo)]">{filtrado ? `Filtrado — ${number.format(vendas.length)} de ${number.format(todas.length)} negócio(s).` : `Sem filtros — exibindo todos os ${number.format(todas.length)} negócio(s).`}</p>
        {meta && <div className="mt-3"><MetaPorVendedor vendedores={vendedores} anos={anos} vendas={todas} /></div>}
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        <Kpi rotulo="Quantidade" valor={number.format(vendas.length)} sub="cards sales" cor="#0f9d94" />
        <Kpi rotulo="Soma de valor total" valor={currency.format(soma)} sub="soma do período" cor="#9aa0aa" />
        <Kpi rotulo="Ticket médio" valor={currency.format(vendas.length ? soma / vendas.length : 0)} sub="sales" cor="#e8963a" />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <RoscaPainel titulo="Negócio" vendas={vendas.length} itens={negocio} sub={`${negocio.length} tipo(s).`} />
        <RoscaPainel titulo="Visão por vendedor" vendas={vendas.length} itens={porVendedor} sub={`${porVendedor.length} vendedor(es).`} />
        <RoscaPainel titulo="Venda mensal %" vendas={vendas.length} itens={porMes} sub={`${porMes.length} mês(es).`} />
        <RoscaPainel titulo="Negócio estado" vendas={vendas.length} itens={porUf} sub={`${porUf.length} estado(s).`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Painel titulo="Ano venda" nota={`${porAno.length} ano(s).`}><Colunas altura={150} larguraMin={60} colunas={porAno.map((a) => ({ rotulo: a.nome, partes: [{ nome: 'Vendas', valor: a.valor, cor: '#4169e1' }] }))} /></Painel>
        <Painel titulo="Venda mensal (R$)" nota={`${mensalOrd.length} mês(es).`}><Colunas altura={150} larguraMin={26} colunas={mensalOrd.map(([m, v]) => ({ rotulo: m.slice(2), partes: [{ nome: 'R$', valor: Math.round(v), cor: '#0f9d94' }] }))} /></Painel>
      </div>

      <Painel titulo="Vendas por cidade" nota={`${number.format(cidades.length)} cidade(s).`}><ListaBarras itens={cidades} cor="#8a5cd6" altura={190} /></Painel>

      <Painel titulo="Extrato" nota={`${number.format(extrato.length)} negócio(s).`}>
        <div className="ind-scroll overflow-x-auto">
          <table className="w-full min-w-[820px] text-[13px] text-[var(--ind-texto)]">
            <thead><tr className="text-left text-[10px] uppercase tracking-wider text-[var(--ind-mudo)]"><th className="py-2 pr-3">Código</th><th className="pr-3">Vendedor</th><th className="pr-3">Tipo de negócio</th><th className="pr-3">Nome</th><th className="pr-3">Cidade</th><th className="pr-3">UF</th><th className="pr-3">Data da venda</th><th className="text-right">Valor total</th></tr></thead>
            <tbody>{extrato.slice(0, limite).map((v) => (
              <tr key={v.id} className="border-t border-[var(--ind-borda)]"><td className="py-2 pr-3">{v.id}</td><td className="pr-3">{v.vendedor}</td><td className="pr-3">{v.tipo ?? '—'}</td><td className="pr-3">{v.nome}</td><td className="pr-3">{v.cidade ?? '—'}</td><td className="pr-3">{v.estado ?? '—'}</td><td className="pr-3">{dataCurtaBr(v.dataVenda)}</td><td className="text-right tabular-nums">{currency.format(v.valorTotal)}</td></tr>
            ))}</tbody>
          </table>
        </div>
        {limite < extrato.length && <button type="button" onClick={() => setLimite((l) => l + 100)} className="mt-3 w-full rounded-md border border-[var(--ind-borda)] py-1.5 text-xs text-[var(--ind-mudo)] hover:text-[var(--ind-texto)]">Mostrar mais ({extrato.length - limite} restantes)</button>}
      </Painel>
    </div>
  )
}
