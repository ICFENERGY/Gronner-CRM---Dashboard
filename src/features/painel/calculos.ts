import { gronerFunis } from '../../../shared/gronerFunis.js'
import { MARCOS } from '../../../shared/engenharia.js'
import type { ProjetoRaw, PropostaRaw, TarefaRaw, UsinaRaw, VendaRaw } from '../../api/types'
import { buildPorCategoria, buildPorFunil } from '../../lib/funilAggregations'
import type { CardEngenharia, Engenharia } from '../engenharia/tipos'
import { ANO_PADRAO, anoEspecifico, anoValido, chavesDoIntervalo, dentro, hojeSP, intervalo, mesValido, rotuloChave, type Ano } from './periodo'

export interface Filtros {
  /** '12m' (últimos 12 meses), 'tudo' (todos os anos) ou um ano, como '2026'. */
  ano: Ano
  /** '01'..'12', ou '' para o ano todo. Só vale com ano específico. */
  mes: string
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

/**
 * Filtros lidos do armazenamento local. Aceita o formato novo (ano + mês) e migra o
 * antigo ({ periodo }): "12m", "tudo", "ano" (este ano) e "mes" (este mês) viram o
 * equivalente; "30d" e "3m" não têm correspondente e voltam ao padrão.
 */
export function filtrosValidos(lido: unknown, padrao: Filtros, hoje = hojeSP()): Filtros {
  if (!lido || typeof lido !== 'object' || Array.isArray(lido)) return padrao
  const o = lido as Record<string, unknown>
  let ano: Ano = padrao.ano
  let mes = padrao.mes
  if (anoValido(o.ano)) {
    ano = o.ano
    mes = anoEspecifico(ano) && mesValido(o.mes) ? o.mes : ''
  } else if (o.periodo === 'tudo' || o.periodo === '12m') {
    ano = o.periodo
    mes = ''
  } else if (o.periodo === 'ano') {
    ano = hoje.slice(0, 4)
    mes = ''
  } else if (o.periodo === 'mes') {
    ano = hoje.slice(0, 4)
    mes = hoje.slice(5, 7)
  }
  return {
    ano,
    mes,
    vendedor: typeof o.vendedor === 'string' ? o.vendedor : padrao.vendedor,
    uf: typeof o.uf === 'string' ? o.uf : padrao.uf,
  }
}

/**
 * Série mensal real x prognóstico somando as usinas, para o ano da série (corrente nos dados da SolarZ).
 * Usa o prognóstico de cada mês quando existe; no relatório estático (sem ele) cai no prognóstico do mês de referência.
 * O mês corrente entra marcado como parcial.
 */
export function serieGeracaoUsinas(usinas: UsinaRaw[]): Barra[] {
  const meses = new Map<number, { geracao: number; prognostico: number; parcial: boolean }>()
  let ano = 0
  for (const u of usinas) {
    const serie = u.mensal ?? u.mensal2026 ?? []
    if (serie.length) ano = Math.max(ano, u.anoMensal ?? 2026)
    serie.forEach((m, i) => {
      if (!m.geracaoKwh) return
      const atual = meses.get(i) ?? { geracao: 0, prognostico: 0, parcial: false }
      atual.geracao += m.geracaoKwh
      atual.prognostico += m.prognosticoKwh ?? u.prognosticoKwhMes ?? 0
      atual.parcial = atual.parcial || Boolean(m.parcial)
      meses.set(i, atual)
    })
  }
  const yy = String(ano || 2026).slice(2)
  return [...meses.entries()].sort(([x], [y]) => x - y).map(([i, v]) => ({ nome: `${MESES_ABREV[i]}/${yy}${v.parcial ? ' (parcial)' : ''}`, valor: Math.round(v.geracao), extra: Math.round(v.prognostico) }))
}

export const FILTROS_PADRAO: Filtros = { ano: ANO_PADRAO, mes: '', vendedor: '', uf: '' }

export interface Barra { nome: string; valor: number; extra?: number }

const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
/**
 * Nome em texto. Os dados vêm do armazenamento sincronizado e já chegaram com o
 * vendedor como objeto do usuário ({ nome, … }) em vez de texto: aceita os dois
 * e ignora o resto, para um registro estranho não derrubar o painel.
 */
export const textoDe = (v: unknown): string => (typeof v === 'string' ? v : v && typeof v === 'object' && typeof (v as { nome?: unknown }).nome === 'string' ? (v as { nome: string }).nome : '')
export const igual = (a: unknown, b: string) => !b || textoDe(a).trim().toLowerCase() === b.trim().toLowerCase()
const soma = <T,>(xs: T[], f: (x: T) => number | null | undefined) => xs.reduce((a, x) => a + (Number(f(x)) || 0), 0)
const top = (m: Map<string, Barra>, n: number) => [...m.values()].sort((a, b) => b.valor - a.valor).slice(0, n)

function agrupar<T>(xs: T[], chave: (x: T) => string | null | undefined, valor: (x: T) => number, extra?: (x: T) => number) {
  const m = new Map<string, Barra>()
  for (const x of xs) {
    const k = textoDe(chave(x)).trim() || 'Não informado'
    const b = m.get(k) ?? { nome: k, valor: 0, extra: 0 }
    b.valor += valor(x)
    if (extra) b.extra = (b.extra ?? 0) + extra(x)
    m.set(k, b)
  }
  return m
}

/**
 * Projeto "vendido": tem valor de venda, ou está num funil de contrato em diante
 * (06. CONTRATO até 17. SEGURO: financeiro, engenharia, homologação, pós-venda).
 */
export function projetoVendido(p: ProjetoRaw | undefined): boolean {
  if (!p) return false
  if (Number(p.valorVenda) > 0) return true
  const n = parseInt((p.funil ?? '').trim(), 10)
  return n >= 6 && n <= 17
}

/** Variação percentual contra o período anterior; null quando não há base. */
const variacao = (atual: number, anterior: number | null) => (anterior == null || anterior === 0 ? null : Math.round(((atual - anterior) / anterior) * 100))

export function calcularPainel(f: Fontes, filtros: Filtros) {
  const iv = intervalo(filtros.ano, filtros.mes)

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

  // Comercial: propostas aceitas x não aceitas é derivado de `propostas`.
  // Financeiro: proposta aceita vira "vendida" quando o projeto dela tem valor de venda ou já passou do contrato.
  const projetoPorId = new Map((f.projetos ?? []).map((p) => [p.id, p]))
  // Um projeto com várias propostas aceitas conta uma vez: vale a alterada por último.
  const quandoProposta = (p: PropostaRaw) => { const t = Date.parse(p.dataAlteracao ?? p.dataInclusao ?? ''); return Number.isFinite(t) ? t : -Infinity }
  const ultimaPorProjeto = new Map<unknown, PropostaRaw>()
  const aceitasSemProjeto: PropostaRaw[] = []
  for (const p of propostas) {
    if (!p.aceita) continue
    if (p.projetoId == null) { aceitasSemProjeto.push(p); continue }
    const atual = ultimaPorProjeto.get(p.projetoId)
    if (!atual || quandoProposta(p) > quandoProposta(atual)) ultimaPorProjeto.set(p.projetoId, p)
  }
  const aceitasLista = [...ultimaPorProjeto.values(), ...aceitasSemProjeto]
  const vendidaPorProjeto = (p: PropostaRaw) => projetoVendido(projetoPorId.get(p.projetoId))
  const propostasVendidas = aceitasLista.filter(vendidaPorProjeto)
  const propostasNaoVendidas = aceitasLista.filter((p) => !vendidaPorProjeto(p))
  const valorProposta = (p: PropostaRaw) => (Number(p.preco) > 0 ? Number(p.preco) : 0)

  // Financeiro: composição do valor vendido (sem negativos)
  const composicao = { lucro: 0, comissao: 0, outros: 0 }
  for (const v of vendas) {
    const total = Number(v.valorTotal) > 0 ? Number(v.valorTotal) : 0
    const lucro = Math.min(Math.max(Number(v.lucro) || 0, 0), total)
    const comissao = Math.min(Math.max(Number(v.valorComissao) || 0, 0), total - lucro)
    composicao.lucro += lucro
    composicao.comissao += comissao
    composicao.outros += total - lucro - comissao
  }

  // Comercial: funil (posição atual)
  const projetos = (f.projetos ?? []).filter((p) => igual(p.vendedorResponsavel, filtros.vendedor) && igual(p.estado, filtros.uf))
  const categorias = buildPorCategoria(buildPorFunil(projetos))
  const funil = gronerFunis.categoriaOrdem
    .map((k) => categorias.find((c) => c.categoria === k))
    .filter((c): c is NonNullable<typeof c> => Boolean(c && c.quantidade > 0))
    .map((c) => ({ nome: c.label, valor: c.quantidade, chave: c.categoria }))

  // Financeiro: projetos no funil 07. FINANCEIRO por etapa (posição atual)
  const projetosFinanceiro = projetos.filter((p) => /^07(?!\d)/.test((p.funil ?? '').trim()))

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
  const NOME_MOMENTO: Record<string, string> = { pre: 'Pré-venda', imp: 'Implantação', usi: 'Gestão da usina' }
  const engMomento: Barra[] = ['pre', 'imp', 'usi'].map((m) => ({ nome: NOME_MOMENTO[m], valor: cards.filter((c) => c.momento === m).length }))
  const engMarcosRosca: Barra[] = MARCOS.map((m) => ({ nome: `${m.k} · ${m.nome}`, valor: cards.filter((c) => c.marco === m.k).length }))
  const comVenda = cards.filter((c) => c.diasDesdeVenda != null)

  // Usinas
  const usinas = (f.usinas ?? []).filter((u) => igual(u.estado, filtros.uf))
  const comDesempenho = usinas.filter((u) => u.desempenhoMedio3mPct != null)
  const geracao = serieGeracaoUsinas(usinas)
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
    propostasVendidas,
    propostasNaoVendidas,
    projetosFinanceiro,
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
      origens: top(agrupar(vendas, (v) => v.origemNome, () => 1, (v) => v.valorTotal), Infinity),
      propostasAceitacao: [
        { nome: 'Aceitas', valor: aceitas },
        { nome: 'Não aceitas', valor: propostas.length - aceitas },
      ] as Barra[],
      finComposicao: [
        { nome: 'Lucro', valor: composicao.lucro },
        { nome: 'Comissão', valor: composicao.comissao },
        { nome: 'Demais custos', valor: composicao.outros },
      ] as Barra[],
      finStatus: top(agrupar(vendas, (v) => v.statusNome, (v) => (Number(v.valorTotal) > 0 ? Number(v.valorTotal) : 0), () => 1), Infinity),
      finFunil: top(agrupar(projetosFinanceiro, (p) => p.etapa, () => 1), Infinity),
      finPropostas: [
        { nome: 'Já vendidas', valor: propostasVendidas.reduce((a, p) => a + valorProposta(p), 0), extra: propostasVendidas.length },
        { nome: 'Ainda não vendidas', valor: propostasNaoVendidas.reduce((a, p) => a + valorProposta(p), 0), extra: propostasNaoVendidas.length },
      ] as Barra[],
      engMomento,
      engMarcosRosca,
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
  f.vendas?.forEach((v) => { const nome = textoDe(v.vendedor).trim(); const uf = textoDe(v.estado).trim(); if (nome) nomes.add(nome); if (uf) ufs.add(uf.toUpperCase()) })
  f.projetos?.forEach((p) => { const uf = textoDe(p.estado).trim(); if (uf) ufs.add(uf.toUpperCase()) })
  const anos = new Set<string>([hojeSP().slice(0, 4)])
  for (const d of [...(f.vendas ?? []).map((v) => v.dataVenda), ...(f.propostas ?? []).map((p) => p.dataInclusao)]) {
    const a = typeof d === 'string' ? d.slice(0, 4) : ''
    if (anoEspecifico(a)) anos.add(a)
  }
  const ordena = (s: Set<string>) => [...s].filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  return { vendedores: ordena(nomes), ufs: ordena(ufs), anos: [...anos].sort().reverse() }
}
