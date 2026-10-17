import { gronerFunis } from '../../../shared/gronerFunis.js'
import { MARCOS } from '../../../shared/engenharia.js'
import type { ProjetoRaw, PropostaRaw, TarefaRaw, UsinaRaw, VendaRaw } from '../../api/types'
import { buildPorCategoria, buildPorFunil } from '../../lib/funilAggregations'
import type { CardEngenharia, Engenharia } from '../engenharia/tipos'
import { chavesDoIntervalo, dentro, intervalo, rotuloChave, type PeriodoKey } from './periodo'

export interface Filtros {
  periodo: PeriodoKey
  vendedor: string
  uf: string
}

export interface Fontes {
  vendas: VendaRaw[] | null
  propostas: PropostaRaw[] | null
  projetos: ProjetoRaw[] | null
  tarefas: TarefaRaw[] | null
  usinas: UsinaRaw[] | null
  engenharia: Engenharia | null
}

export interface Barra { nome: string; valor: number; extra?: number }

const MESES_2026 = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const igual = (a: string | null | undefined, b: string) => !b || (a ?? '').trim().toLowerCase() === b.trim().toLowerCase()
const soma = <T,>(xs: T[], f: (x: T) => number | null | undefined) => xs.reduce((a, x) => a + (Number(f(x)) || 0), 0)
const top = (m: Map<string, Barra>, n: number) => [...m.values()].sort((a, b) => b.valor - a.valor).slice(0, n)

function agrupar<T>(xs: T[], chave: (x: T) => string | null | undefined, valor: (x: T) => number, extra?: (x: T) => number) {
  const m = new Map<string, Barra>()
  for (const x of xs) {
    const k = chave(x) || 'Não informado'
    const b = m.get(k) ?? { nome: k, valor: 0, extra: 0 }
    b.valor += valor(x)
    if (extra) b.extra = (b.extra ?? 0) + extra(x)
    m.set(k, b)
  }
  return m
}

/** Variação percentual contra o período anterior; null quando não há base. */
const variacao = (atual: number, anterior: number | null) => (anterior == null || anterior === 0 ? null : Math.round(((atual - anterior) / anterior) * 100))

export function calcularPainel(f: Fontes, filtros: Filtros) {
  const iv = intervalo(filtros.periodo)

  // Comercial: vendas
  const vendasFiltro = (f.vendas ?? []).filter((v) => igual(v.vendedor, filtros.vendedor) && igual(v.estado, filtros.uf))
  const vendas = vendasFiltro.filter((v) => dentro(v.dataVenda, iv.inicio, iv.fim))
  const vendasAnt = iv.anterior ? vendasFiltro.filter((v) => dentro(v.dataVenda, iv.anterior!.inicio, iv.anterior!.fim)) : null
  const vendido = soma(vendas, (v) => v.valorTotal)
  const vendidoAnt = vendasAnt ? soma(vendasAnt, (v) => v.valorTotal) : null

  const primeiraVenda = vendasFiltro.map((v) => v.dataVenda?.slice(0, 10)).filter(Boolean).sort()[0] ?? null
  const chaves = chavesDoIntervalo(iv, primeiraVenda)
  const porChave = agrupar(vendas, (v) => (iv.porDia ? v.dataVenda.slice(0, 10) : v.dataVenda.slice(0, 7)), (v) => v.valorTotal, () => 1)
  const vendasTempo = chaves.map((k) => ({ chave: k, nome: rotuloChave(k), valor: porChave.get(k)?.valor ?? 0, extra: porChave.get(k)?.extra ?? 0 }))

  // Comercial: propostas (conversão)
  const propostas = (f.propostas ?? []).filter((p) => igual(p.vendedorNome, filtros.vendedor) && dentro(p.dataInclusao, iv.inicio, iv.fim))
  const aceitas = propostas.filter((p) => p.aceita).length

  // Comercial: funil (posição atual)
  const projetos = (f.projetos ?? []).filter((p) => igual(p.vendedorResponsavel, filtros.vendedor) && igual(p.estado, filtros.uf))
  const categorias = buildPorCategoria(buildPorFunil(projetos))
  const funil = gronerFunis.categoriaOrdem
    .map((k) => categorias.find((c) => c.categoria === k))
    .filter((c): c is NonNullable<typeof c> => Boolean(c && c.quantidade > 0))
    .map((c) => ({ nome: c.label, valor: c.quantidade, chave: c.categoria }))

  // Engenharia
  const eng = f.engenharia
  const cards: CardEngenharia[] = (eng?.cards ?? []).filter((c) => igual(c.vendedor, filtros.vendedor) && igual(c.estado, filtros.uf))
  const meta = eng?.prazos.metaEntrega ?? 60
  const engMarcos = MARCOS.map((m) => {
    const g = cards.filter((c) => c.marco === m.k)
    return { nome: m.k, titulo: `${m.k} · ${m.nome}`, momento: m.mom, atrasado: g.filter((c) => c.cor === 'atrasado').length, risco: g.filter((c) => c.cor === 'risco').length, ok: g.filter((c) => c.cor === 'ok').length }
  })
  const homolog = cards.filter((c) => ['5', '6', '7', '9', '10', '11', '12'].includes(c.marco))
  const concessionarias = top(agrupar(homolog, (c) => c.concessionaria, () => 1), Infinity)
  const engSituacao: Barra[] = [
    { nome: 'Atrasado', valor: cards.filter((c) => c.cor === 'atrasado').length },
    { nome: 'Em risco', valor: cards.filter((c) => c.cor === 'risco').length },
    { nome: 'No prazo', valor: cards.filter((c) => c.cor === 'ok').length },
  ]
  const comVenda = cards.filter((c) => c.diasDesdeVenda != null)

  // Usinas
  const usinas = (f.usinas ?? []).filter((u) => igual(u.estado, filtros.uf))
  const comDesempenho = usinas.filter((u) => u.desempenhoMedio3mPct != null)
  const meses = new Map<string, { geracao: number; prognostico: number }>()
  for (const u of usinas) {
    for (const m of u.mensal2026 ?? []) {
      if (!m.geracaoKwh) continue
      const atual = meses.get(m.mes) ?? { geracao: 0, prognostico: 0 }
      atual.geracao += m.geracaoKwh
      atual.prognostico += u.prognosticoKwhMes ?? 0
      meses.set(m.mes, atual)
    }
  }
  const ordemMes = (m: string) => MESES_2026.indexOf(m.slice(0, 3).toLowerCase())
  const geracao = [...meses.entries()].filter(([mes]) => ordemMes(mes) >= 0).sort(([a], [b]) => ordemMes(a) - ordemMes(b)).map(([mes, v]) => ({ nome: `${MESES_2026[ordemMes(mes)]}/26`, valor: Math.round(v.geracao), extra: Math.round(v.prognostico) }))
  const statusUsinas = ['Dentro do esperado', 'Atenção', 'Crítico', 'Sem dado'].map((s) => ({ nome: s, valor: usinas.filter((u) => (u.statusDesempenho ?? 'Sem dado') === s).length }))

  // Tarefas (estado atual; não têm vendedor nem UF)
  const atrasadas = (f.tarefas ?? []).filter((t) => t.atrasada)
  const porResp = new Map<string, Barra>()
  for (const t of atrasadas) for (const r of t.responsaveis.length ? t.responsaveis : ['Sem responsável']) {
    const b = porResp.get(r) ?? { nome: r, valor: 0 }
    b.valor++
    porResp.set(r, b)
  }

  return {
    intervalo: iv,
    vendas,
    propostas,
    cards,
    usinas,
    atrasadas,
    kpis: {
      vendido, vendidoVar: variacao(vendido, vendidoAnt),
      qtdVendas: vendas.length, qtdVendasVar: variacao(vendas.length, vendasAnt?.length ?? null),
      ticket: vendas.length ? vendido / vendas.length : 0,
      conversao: propostas.length ? Math.round((100 * aceitas) / propostas.length) : null, propostas: propostas.length, aceitas,
      engAtrasados: cards.filter((c) => c.cor === 'atrasado').length, engAtivos: cards.length, engSemPlano: cards.filter((c) => c.cor === 'atrasado' && !c.acao).length,
      obrasAlemMeta: comVenda.filter((c) => (c.diasDesdeVenda ?? 0) > meta).length, obras: comVenda.length, meta,
      desempenhoUsinas: comDesempenho.length ? Math.round((100 * soma(comDesempenho, (u) => u.desempenhoMedio3mPct)) / comDesempenho.length) : null,
      usinasCriticas: usinas.filter((u) => u.statusDesempenho === 'Crítico').length, usinas: usinas.length,
      tarefasAtrasadas: atrasadas.length, tarefasTotal: f.tarefas?.length ?? 0,
    },
    series: {
      vendasTempo,
      vendedores: top(agrupar(vendas, (v) => v.vendedor, (v) => v.valorTotal, () => 1), Infinity),
      ufs: top(agrupar(vendas, (v) => v.estado, (v) => v.valorTotal, () => 1), Infinity),
      funil,
      engMarcos,
      concessionarias,
      geracao,
      statusUsinas,
      tarefasResponsavel: top(porResp, Infinity),
      tarefasStatus: top(agrupar(f.tarefas ?? [], (t) => t.status, () => 1), Infinity),
      engSituacao,
    },
  }
}

export type Painel = ReturnType<typeof calcularPainel>

/** Opções dos filtros a partir de todas as fontes. */
export function opcoesFiltros(f: Fontes) {
  const nomes = new Set<string>()
  const ufs = new Set<string>()
  f.vendas?.forEach((v) => { if (v.vendedor) nomes.add(v.vendedor.trim()); if (v.estado) ufs.add(v.estado.trim().toUpperCase()) })
  f.projetos?.forEach((p) => { if (p.estado) ufs.add(p.estado.trim().toUpperCase()) })
  const ordena = (s: Set<string>) => [...s].filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  return { vendedores: ordena(nomes), ufs: ordena(ufs) }
}
