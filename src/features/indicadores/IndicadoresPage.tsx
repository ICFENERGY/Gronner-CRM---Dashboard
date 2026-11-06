import { useMemo, useState } from 'react'
import { api } from '../../api/client'
import { useRawData } from '../../api/useRawData'
import { currency, number } from '../../lib/palette'
import { VendasSales } from './VendasSales'
import {
  FILTROS_VAZIOS, GRUPOS, MESES_NOME, SLA_DIAS, calcularKpis, cardsPorEtapa, contarPor, criarCard, evolucaoAbertos, filtrarCards, filtrosAtivos, funisDoGrupo,
  gruposPorMes, mesCurto, slaPorMes, visaoPorEtapa, type CardInd, type Filtros,
} from './calculos'
import { COR_ATRASO, COR_GRUPO, COR_OK, Colunas, Kpi, Legenda, ListaBarras, Painel, Rosca, Vazio, COR_SERIE } from './ui'
import { dataCurtaBr } from '../../lib/datas'

type SubAba = 'dashboard' | 'executiva' | 'vendas'
const SUBABAS: { k: SubAba; rotulo: string }[] = [
  { k: 'dashboard', rotulo: 'Dashboard' },
  { k: 'executiva', rotulo: 'Visão Executiva · por Etapa' },
  { k: 'vendas', rotulo: 'Vendas · Sales' },
]

const pct1 = (v: number) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
const dias1 = (v: number) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}d`
const unicos = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }))

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return <label className="flex min-w-[110px] flex-1 flex-col gap-1 text-[10px] font-bold uppercase tracking-wider text-[var(--ind-mudo)]">{rotulo}{children}</label>
}
const ENTRADA = 'rounded-md border border-[var(--ind-borda)] bg-[var(--ind-fundo)] px-2.5 py-1.5 text-[13px] font-normal normal-case tracking-normal text-[var(--ind-texto)] placeholder:text-[var(--ind-mudo)] focus:border-[var(--ind-acento)] focus:outline-none'

function BarraFiltros({ cards, f, onChange, total, filtrados }: { cards: CardInd[]; f: Filtros; onChange: (p: Partial<Filtros>) => void; total: number; filtrados: number }) {
  const opcoes = useMemo(() => ({
    funis: unicos(cards.map((c) => c.funil)),
    etapas: unicos(cards.filter((c) => !f.funil || c.funil === f.funil).map((c) => c.etapa)),
    ufs: unicos(cards.map((c) => c.uf).filter((u) => u !== '—')),
    anos: unicos(cards.map((c) => c.ano)).reverse(),
  }), [cards, f.funil])
  const ativos = filtrosAtivos(f)
  const sel = (chave: keyof Filtros, todos: string, itens: string[], rot?: (v: string) => string) => (
    <select value={f[chave]} onChange={(e) => onChange({ [chave]: e.target.value } as Partial<Filtros>)} className={ENTRADA}>
      <option value="">{todos}</option>
      {itens.map((i) => <option key={i} value={i}>{rot ? rot(i) : i}</option>)}
    </select>
  )
  return (
    <section aria-label="Filtros" className="rounded-xl border border-[var(--ind-borda)] bg-[var(--ind-card)] p-4">
      <div className="flex flex-wrap items-end gap-3">
        <Campo rotulo="Cliente"><input value={f.cliente} onChange={(e) => onChange({ cliente: e.target.value })} placeholder="Todos" className={ENTRADA} /></Campo>
        <Campo rotulo="Código"><input value={f.codigo} onChange={(e) => onChange({ codigo: e.target.value })} placeholder="Todos" inputMode="numeric" className={ENTRADA} /></Campo>
        <Campo rotulo="Funil">{sel('funil', 'Todos', opcoes.funis)}</Campo>
        <Campo rotulo="Etapa">{sel('etapa', 'Todas', opcoes.etapas)}</Campo>
        <Campo rotulo="UF">{sel('uf', 'Todas', opcoes.ufs)}</Campo>
        <Campo rotulo="Ano">{sel('ano', 'Todos', opcoes.anos)}</Campo>
        <Campo rotulo="Mês">{sel('mes', 'Todos', MESES_NOME.map((_, i) => String(i + 1).padStart(2, '0')), (m) => MESES_NOME[Number(m) - 1])}</Campo>
        <Campo rotulo="Status SLA">
          <select value={f.sla} onChange={(e) => onChange({ sla: e.target.value as Filtros['sla'] })} className={ENTRADA}>
            <option value="">Todos</option>
            <option value="atendido">SLA atendido</option>
            <option value="atrasado">SLA atrasado</option>
          </select>
        </Campo>
        <button type="button" onClick={() => onChange(FILTROS_VAZIOS)} disabled={!ativos} className="rounded-md border border-[var(--ind-borda)] px-3 py-1.5 text-xs text-[var(--ind-mudo)] enabled:hover:text-[var(--ind-texto)] disabled:opacity-50">Limpar filtros</button>
      </div>
      <p className="mt-3 text-[11px] text-[var(--ind-mudo)]">
        {ativos ? `${ativos} filtro(s) — ${number.format(filtrados)} de ${number.format(total)} cards.` : `Sem filtros — exibindo todos os ${number.format(total)} cards.`}
      </p>
    </section>
  )
}

function Kpis({ cards }: { cards: CardInd[] }) {
  const k = calcularKpis(cards)
  const p = (n: number) => (k.total ? (100 * n) / k.total : 0)
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <Kpi rotulo="Total de cards" valor={number.format(k.total)} sub="100% da seleção" cor="#0f9d94" />
      <Kpi rotulo="SLA atendido" valor={number.format(k.atendidos)} sub={`${pct1(p(k.atendidos))} da seleção · até ${SLA_DIAS}d`} cor={COR_OK} />
      <Kpi rotulo="SLA atrasado" valor={number.format(k.atrasados)} sub={`${pct1(p(k.atrasados))} da seleção`} cor={COR_ATRASO} />
      <Kpi rotulo="Dias médio no fluxo" valor={dias1(k.diasMedio)} sub="média da seleção" cor="#e8963a" />
      <Kpi rotulo="Valor total" valor={currency.format(k.valor)} sub="soma da seleção" cor="#9aa0aa" />
    </div>
  )
}

const partesSla = (atendidos: number, atrasados: number) => [
  { nome: 'Atendido', valor: atendidos, cor: COR_OK },
  { nome: 'Atrasado', valor: atrasados, cor: COR_ATRASO },
]
const LEG_SLA = [{ nome: 'Atendido', cor: COR_OK }, { nome: 'Atrasado', cor: COR_ATRASO }]

function ClientesAbertos({ cards }: { cards: CardInd[] }) {
  const grupos = useMemo(() => cardsPorEtapa(cards), [cards])
  const [limite, setLimite] = useState(60)
  let mostrados = 0
  return (
    <Painel titulo="Clientes com cards em aberto" nota={`${number.format(cards.length)} card(s) · ${number.format(grupos.length)} etapa(s).`}>
      {!cards.length ? <Vazio /> : (
        <div className="ind-scroll max-h-[420px] overflow-y-auto pr-2">
          {grupos.map((g) => {
            if (mostrados >= limite) return null
            const fatia = g.cards.slice(0, Math.max(limite - mostrados, 0))
            mostrados += fatia.length
            return (
              <div key={g.etapa} className="mb-3">
                <div className="flex items-baseline justify-between border-b border-[var(--ind-borda)] pb-1 text-[11px] font-bold uppercase tracking-wide text-[#14b8a6]"><span>{g.etapa}</span><span>{number.format(g.cards.length)} card(s)</span></div>
                {fatia.map((c) => (
                  <div key={c.id} className="border-b border-[var(--ind-borda)] py-1.5 text-[13px] text-[var(--ind-texto)]">
                    <p><span className="text-[var(--ind-mudo)]">#{c.id}</span> {c.nome} · {c.cidade}</p>
                    <p className="flex flex-wrap gap-x-4 text-[11px] text-[var(--ind-mudo)]">
                      <span>Valor: <b className="text-[var(--ind-texto)]">{currency.format(c.valor)}</b></span>
                      <span>Dias no fluxo: <b className="text-[var(--ind-texto)]">{dias1(c.dias)}</b></span>
                      {c.atrasado && <span>Atraso: <b style={{ color: COR_ATRASO }}>{dias1(c.atraso)}</b></span>}
                      <span>Atualizado em: <b className="text-[var(--ind-texto)]">{dataCurtaBr(c.atualizadoEm)}</b></span>
                    </p>
                  </div>
                ))}
              </div>
            )
          })}
          {mostrados < cards.length && (
            <button type="button" onClick={() => setLimite((l) => l + 100)} className="w-full rounded-md border border-[var(--ind-borda)] py-1.5 text-xs text-[var(--ind-mudo)] hover:text-[var(--ind-texto)]">Mostrar mais ({number.format(cards.length - mostrados)} restantes)</button>
          )}
        </div>
      )}
    </Painel>
  )
}

function AbaDashboard({ cards }: { cards: CardInd[] }) {
  const k = calcularKpis(cards)
  const etapas = useMemo(() => contarPor(cards, (c) => c.etapa), [cards])
  const ufs = useMemo(() => contarPor(cards.filter((c) => c.uf !== '—'), (c) => c.uf), [cards])
  const cidades = useMemo(() => contarPor(cards.filter((c) => c.cidade !== '—'), (c) => c.cidade), [cards])
  const anos = useMemo(() => contarPor(cards, (c) => c.ano).sort((a, b) => a.nome.localeCompare(b.nome)), [cards])
  const meses = useMemo(() => slaPorMes(cards), [cards])
  const evolucao = useMemo(() => evolucaoAbertos(cards), [cards])
  const funis = useMemo(() => contarPor(cards, (c) => c.funil).sort((a, b) => b.total - a.total), [cards])
  const pctOk = k.total ? (100 * k.atendidos) / k.total : 0
  return (
    <div className="grid gap-4 lg:grid-cols-[230px_minmax(0,1fr)_minmax(0,1.6fr)]">
      <div className="grid content-start gap-4 lg:row-span-3">
        <Painel titulo="Em aberto por etapa" nota={`${number.format(etapas.length)} etapa(s).`}><ListaBarras itens={etapas.map((e) => ({ nome: e.nome, valor: e.total }))} cor={COR_ATRASO} altura={210} /></Painel>
        <Painel titulo="Cards por UF"><ListaBarras itens={ufs.map((e) => ({ nome: e.nome, valor: e.total }))} cor="#4169e1" altura={190} /></Painel>
        <Painel titulo="Cards por cidade" nota={`${number.format(cidades.length)} cidade(s).`}><ListaBarras itens={cidades.map((e) => ({ nome: e.nome, valor: e.total }))} cor="#8a5cd6" altura={190} /></Painel>
        <Painel titulo="Cards por ano"><Colunas altura={110} colunas={anos.map((a) => ({ rotulo: a.nome, partes: [{ nome: 'Cards', valor: a.total, cor: '#4169e1' }] }))} /></Painel>
      </div>

      <Painel titulo="SLA atendido" nota="do volume filtrado">
        <div className="flex flex-wrap items-center justify-center gap-6 py-2">
          <Rosca partes={partesSla(k.atendidos, k.atrasados)} tamanho={190} espessura={24} centro={<><b className="ind-titulo text-3xl text-[var(--ind-texto)]">{pct1(pctOk)}</b><span className="text-[11px] text-[var(--ind-mudo)]">dentro do prazo</span></>} />
          <ul className="min-w-[150px] space-y-2 text-xs text-[var(--ind-texto)]">
            <li className="flex items-center justify-between gap-6"><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-[2px]" style={{ background: COR_OK }} />Atendido</span><b className="tabular-nums">{number.format(k.atendidos)}</b></li>
            <li className="flex items-center justify-between gap-6"><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-[2px]" style={{ background: COR_ATRASO }} />Atrasado</span><b className="tabular-nums">{number.format(k.atrasados)}</b></li>
          </ul>
        </div>
      </Painel>

      <Painel titulo="Atendido × Atrasado por mês" nota={`${number.format(meses.length)} mês(es).`}>
        <Colunas altura={150} larguraMin={22} colunas={meses.map((m) => ({ rotulo: mesCurto(m.mes), partes: partesSla(m.atendidos, m.atrasados) }))} />
        <Legenda itens={LEG_SLA} />
      </Painel>

      <Painel titulo="Evolução de cards abertos" nota={`6 mês(es) + últimas 3 semanas, por data de abertura — ${number.format(cards.length)} card(s).`} className="lg:col-span-2">
        <Colunas altura={170} larguraMin={50} colunas={evolucao.map((e) => ({ rotulo: e.rotulo, partes: [{ nome: 'Cards', valor: e.valor, cor: '#0f9d94' }] }))} />
      </Painel>

      <Painel titulo="Cards por funil" nota={`${number.format(funis.length)} funil(is).`} className="lg:col-span-2">
        <Colunas altura={190} larguraMin={46} colunas={funis.map((f) => ({ rotulo: f.nome.replace(/^\d+\.\s*/, ''), partes: partesSla(f.atendidos, f.atrasados) }))} />
        <Legenda itens={LEG_SLA} />
      </Painel>

      <div className="lg:col-span-3"><ClientesAbertos cards={cards} /></div>
    </div>
  )
}

function AbaExecutiva({ cards }: { cards: CardInd[] }) {
  const meses = useMemo(() => gruposPorMes(cards), [cards])
  const linhas = useMemo(() => visaoPorEtapa(cards), [cards])
  const [limite, setLimite] = useState(100)
  return (
    <div className="grid gap-4">
      <Painel titulo="Cards por grupo de funil — por mês" nota={`${number.format(cards.length)} card(s) · ${number.format(meses.length)} mês(es).`}>
        <Colunas altura={170} larguraMin={22} colunas={meses.map((m) => ({ rotulo: mesCurto(m.mes), partes: GRUPOS.map((g) => ({ nome: g, valor: m.porGrupo[g], cor: COR_GRUPO[g] })) }))} />
        <Legenda itens={GRUPOS.map((g) => ({ nome: g, cor: COR_GRUPO[g] }))} />
      </Painel>

      <Painel titulo="Cards por funil — um gráfico por grupo">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {GRUPOS.map((g) => {
            const funis = funisDoGrupo(cards, g)
            const total = funis.reduce((a, f) => a + f.total, 0)
            return (
              <div key={g} className="rounded-lg border border-[var(--ind-borda)] bg-[var(--ind-fundo)] p-3">
                <h4 className="ind-titulo text-[15px] font-bold text-[var(--ind-texto)]">{g}</h4>
                <p className="mb-2 text-[11px] text-[var(--ind-mudo)]">{number.format(total)} card(s) · {funis.length} funil(is).</p>
                {!total ? <Vazio /> : (
                  <div className="flex items-start gap-3">
                    <Rosca partes={funis.map((f, i) => ({ nome: f.nome, valor: f.total, cor: COR_SERIE[i % COR_SERIE.length] }))} tamanho={110} espessura={16} legenda="cards" />
                    <ul className="ind-scroll max-h-[150px] min-w-0 flex-1 space-y-1.5 overflow-y-auto pr-1 text-[11px]">
                      {funis.map((f, i) => (
                        <li key={f.nome} className="flex gap-1.5"><i className="mt-1 h-2 w-2 shrink-0 rounded-[2px]" style={{ background: COR_SERIE[i % COR_SERIE.length] }} /><span className="min-w-0 text-[var(--ind-texto)]">{f.nome}<br /><span className="text-[var(--ind-mudo)]">{number.format(f.total)} ({pct1((100 * f.total) / total)})</span></span></li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Painel>

      <Painel titulo="Visão Executiva — por Etapa" nota={`${number.format(linhas.length)} combinação(ões) de funil/etapa.`}>
        <div className="ind-scroll overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13px] text-[var(--ind-texto)]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--ind-mudo)]">
                <th className="py-2 pr-3 font-bold">Etapa</th><th className="pr-3 font-bold">Funil</th>
                <th className="pr-3 text-right font-bold">Qtde</th><th className="pr-3 text-right font-bold">Atrasados</th><th className="pr-3 text-right font-bold">% atrasado</th>
                <th className="pr-3 text-right font-bold">Dias médio no fluxo</th><th className="text-right font-bold">Valor total</th>
              </tr>
            </thead>
            <tbody>
              {linhas.slice(0, limite).map((l) => (
                <tr key={`${l.funil}|${l.etapa}`} className="border-t border-[var(--ind-borda)]">
                  <td className="py-2 pr-3">{l.etapa}</td><td className="pr-3">{l.funil}</td>
                  <td className="pr-3 text-right tabular-nums">{number.format(l.total)}</td>
                  <td className="pr-3 text-right tabular-nums">{number.format(l.atrasados)}</td>
                  <td className="pr-3 text-right"><span className="rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums" style={{ color: l.pctAtraso >= 50 ? COR_ATRASO : COR_OK, background: l.pctAtraso >= 50 ? 'rgba(232,80,91,.15)' : 'rgba(61,154,85,.15)' }}>{l.pctAtraso}%</span></td>
                  <td className="pr-3 text-right tabular-nums">{dias1(l.diasMedio)}</td>
                  <td className="text-right tabular-nums">{currency.format(l.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {limite < linhas.length && <button type="button" onClick={() => setLimite((l) => l + 100)} className="mt-3 w-full rounded-md border border-[var(--ind-borda)] py-1.5 text-xs text-[var(--ind-mudo)] hover:text-[var(--ind-texto)]">Mostrar mais ({linhas.length - limite} restantes)</button>}
      </Painel>
    </div>
  )
}

/**
 * Indicadores dos cards do Groner: Dashboard, Visão Executiva por etapa e Vendas.
 * O SLA daqui é o dos cards (SLA_DIAS em calculos.ts) e não tem relação com o SLA da Pieta.
 */
export function IndicadoresPage() {
  const projetos = useRawData('projetos', api.getProjetosRaw)
  const [sub, setSub] = useState<SubAba>('dashboard')
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS)
  const agora = useMemo(() => new Date(), [])

  const cards = useMemo(() => (projetos.data ?? []).map((p) => criarCard(p)).filter((c): c is CardInd => c !== null), [projetos.data])
  const filtrados = useMemo(() => filtrarCards(cards, filtros), [cards, filtros])

  return (
    <div className="indicadores -mx-6 -mt-4 min-h-[calc(100vh-120px)] px-6 pb-8 pt-5 md:-mx-10 md:px-10">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-2 border-b border-[var(--ind-borda)] pb-3">
        <h2 className="ind-titulo text-[28px] font-bold text-[var(--ind-texto)]">Indicadores</h2>
        <div className="text-right text-[11px] text-[var(--ind-mudo)]">
          <p className="flex items-center justify-end gap-1.5 font-semibold text-[var(--ind-texto)]"><i className="h-1.5 w-1.5 rounded-full bg-[#14b8a6]" />{number.format(cards.length)} cards monitorados</p>
          <p>Consultado em {agora.toLocaleString('pt-BR')}</p>
        </div>
      </header>

      <nav aria-label="Indicadores" className="mb-4 flex gap-1 overflow-x-auto border-b border-[var(--ind-borda)]">
        {SUBABAS.map((s) => (
          <button key={s.k} type="button" aria-current={sub === s.k ? 'page' : undefined} onClick={() => setSub(s.k)} className={`relative whitespace-nowrap px-4 py-2.5 text-[13px] font-semibold ${sub === s.k ? 'text-[#14b8a6]' : 'text-[var(--ind-mudo)] hover:text-[var(--ind-texto)]'}`}>
            {s.rotulo}
            {sub === s.k && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#14b8a6]" />}
          </button>
        ))}
      </nav>

      {sub === 'vendas' ? (
        <VendasSales />
      ) : projetos.error && !projetos.data ? (
        <p role="alert" className="rounded-lg border border-amber-600 bg-amber-950/40 px-4 py-2 text-sm text-amber-300">Não foi possível carregar os cards: {projetos.error}.</p>
      ) : !projetos.data ? (
        <p role="status" className="py-10 text-center text-sm text-[var(--ind-mudo)]">Carregando os cards…</p>
      ) : (
        <div className="grid gap-4">
          <BarraFiltros cards={cards} f={filtros} onChange={(p) => setFiltros((f) => ({ ...f, ...p }))} total={cards.length} filtrados={filtrados.length} />
          <Kpis cards={filtrados} />
          {sub === 'dashboard' ? <AbaDashboard cards={filtrados} /> : <AbaExecutiva cards={filtrados} />}
        </div>
      )}
    </div>
  )
}
