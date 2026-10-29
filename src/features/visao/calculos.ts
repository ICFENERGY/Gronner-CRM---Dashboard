/**
 * Visão geral consultiva: números, frases de leitura e itens de atenção das
 * quatro áreas (Comercial, Engenharia, Usinas e Homologação). Funções puras,
 * sem React: o relógio entra por parâmetro e as frases são montadas por regra
 * a partir dos dados, nunca escritas à mão.
 */
import { MARCOS } from '../../../shared/engenharia.js'
import type { PietaMetricas, PietaResumo, PropostaRaw, ProjetoRaw, TarefaRaw, UsinaRaw, UsinasRawResponse, VendaRaw } from '../../api/types'
import type { Engenharia } from '../engenharia/tipos'
import { igual, projetoVendido, textoDe } from '../painel/calculos'
import type { Detalhe } from '../painel/detalhes'
import { NOMES_MESES, dentro, hojeSP, intervalo, mesValido } from '../painel/periodo'

export interface FiltrosVisao {
  /** Ano com 4 dígitos. */
  ano: string
  /** '01'..'12', ou '' para o ano todo. */
  mes: string
  vendedor: string
}

export interface FontesVisao {
  vendas: VendaRaw[] | null
  propostas: PropostaRaw[] | null
  projetos: ProjetoRaw[] | null
  tarefas: TarefaRaw[] | null
  usinas: UsinasRawResponse | null
  engenharia: Engenharia | null
  pietaResumo: PietaResumo | null
  pietaMetricas: PietaMetricas | null
}

export type Tom = 'bom' | 'ruim' | 'neutro'
export interface Delta { texto: string; tom: Tom; base: string }
export type Estado = 'atrasado' | 'risco' | 'ok'

export interface KpiVisao {
  id: string
  rotulo: string
  valor: string
  /** Valor exato, quando o número grande é arredondado (ex.: R$ 104 mil). */
  valorExato?: string
  delta?: Delta | null
  contexto?: string
  definicao: string
  estado?: Estado
}

/** Para onde leva um item ou um bloco: a gaveta de detalhe ou uma aba. */
export type Alvo = { tipo: 'detalhe'; detalhe: Detalhe } | { tipo: 'aba'; aba: string }

export interface ItemAtencao {
  id: string
  /** 1 = crítico, 2 = atenção, 3 = acompanhar. */
  gravidade: 1 | 2 | 3
  area: 'Comercial' | 'Engenharia' | 'Usinas' | 'Homologação' | 'Tarefas'
  numero: string
  frase: string
  /** Desempate dentro da mesma gravidade (maior primeiro). */
  peso: number
  acao: { rotulo: string; alvo: Alvo }
}

export const MAX_ITENS_ATENCAO = 6

// ---------- formatação pt-BR ----------
const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
export const inteiro = (v: number) => nf0.format(Math.round(v))
export const compacto = (v: number) => (Math.abs(v) >= 1e6 ? `${nf1.format(v / 1e6)} mi` : Math.abs(v) >= 1e3 ? `${nf0.format(Math.round(v / 1e3))} mil` : nf0.format(Math.round(v)))
export const reais = (v: number) => `R$ ${compacto(v)}`
export const reaisExato = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
export const pctTxt = (v: number) => `${nf0.format(Math.round(v))}%`
export const plural = (n: number, um: string, varios: string) => `${inteiro(n)} ${n === 1 ? um : varios}`
const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
export const rotuloMes = (chave: string) => `${MESES_ABREV[Number(chave.slice(5, 7)) - 1]}/${chave.slice(2, 4)}`
const nomeMes = (chave: string) => NOMES_MESES[Number(chave.slice(5, 7)) - 1].toLowerCase()
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const somaMes = (chave: string, n: number) => {
  const d = new Date(Date.UTC(Number(chave.slice(0, 4)), Number(chave.slice(5, 7)) - 1 + n, 1))
  return d.toISOString().slice(0, 7)
}
const ultimoDia = (chave: string) => new Date(Date.UTC(Number(chave.slice(0, 4)), Number(chave.slice(5, 7)), 0)).toISOString().slice(0, 10)
const soma = <T,>(xs: T[], f: (x: T) => number | null | undefined) => xs.reduce((a, x) => a + (Number(f(x)) || 0), 0)

/** Variação percentual; null sem base (anterior 0 ou ausente). */
export function deltaPct(atual: number, anterior: number | null, base: string, maiorEhMelhor = true): Delta | null {
  if (anterior == null || anterior === 0) return null
  const v = Math.round(((atual - anterior) / anterior) * 100)
  const tom: Tom = v === 0 ? 'neutro' : (v > 0) === maiorEhMelhor ? 'bom' : 'ruim'
  return { texto: `${v > 0 ? '↑' : v < 0 ? '↓' : '→'} ${Math.abs(v)}%`, tom, base }
}

/** Variação em pontos percentuais entre duas taxas (0 a 100). */
export function deltaPp(atual: number | null, anterior: number | null, base: string, maiorEhMelhor = true): Delta | null {
  if (atual == null || anterior == null) return null
  const v = Math.round(atual - anterior)
  const tom: Tom = v === 0 ? 'neutro' : (v > 0) === maiorEhMelhor ? 'bom' : 'ruim'
  return { texto: `${v > 0 ? '↑' : v < 0 ? '↓' : '→'} ${Math.abs(v)} p.p.`, tom, base }
}

/** Texto da base de comparação: "vs setembro/26", "vs 01 a 29/09", "vs 2025" ou "vs 01/01 a 29/10/2025". */
export function textoBase(ant: { inicio: string; fim: string }): string {
  const mesIni = ant.inicio.slice(0, 7)
  if (ant.inicio.endsWith('-01-01') && ant.fim.endsWith('-12-31')) return `vs ${ant.inicio.slice(0, 4)}`
  if (ant.inicio.slice(0, 4) !== ant.fim.slice(0, 4) || ant.inicio.slice(5, 7) !== ant.fim.slice(5, 7)) return `vs ${ddmm(ant.inicio)} a ${ddmm(ant.fim)}/${ant.fim.slice(0, 4)}`
  if (ant.inicio.endsWith('-01') && ant.fim === ultimoDia(mesIni)) return `vs ${nomeMes(mesIni)}/${mesIni.slice(2, 4)}`
  return `vs ${ddmm(ant.inicio)} a ${ddmm(ant.fim)}`
}

/** A base em frase corrida: "em setembro/26", "de 01/09 a 29/09", "em 2025". */
export const naBase = (base: string) => { const s = base.replace(/^vs /, ''); return /^\d{2}\//.test(s) ? `de ${s}` : `em ${s}` }

/** Prazo da Pieta: chega como "dd/mm/aaaa" (ou ISO). */
export function diaPieta(s: string | null | undefined): string | null {
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s)
  return br ? `${br[3]}-${br[2]}-${br[1]}` : null
}

// ---------- Comercial ----------
export interface PontoVendas { chave: string; nome: string; valor: number; vendas: number; destaque: boolean; parcial: boolean }

export function calcularComercial(f: FontesVisao, filtros: FiltrosVisao, hoje = hojeSP()) {
  const iv = intervalo(filtros.ano, filtros.mes, hoje)
  const base = iv.anterior ? textoBase(iv.anterior) : ''
  const vendasF = (f.vendas ?? []).filter((v) => igual(v.vendedor, filtros.vendedor))
  const atual = vendasF.filter((v) => dentro(v.dataVenda, iv.inicio, iv.fim))
  const ant = iv.anterior ? vendasF.filter((v) => dentro(v.dataVenda, iv.anterior!.inicio, iv.anterior!.fim)) : null
  const vendido = soma(atual, (v) => v.valorTotal)
  const vendidoAnt = ant ? soma(ant, (v) => v.valorTotal) : null
  const ticket = atual.length ? vendido / atual.length : null
  const ticketAnt = ant?.length ? vendidoAnt! / ant.length : null

  const propostasF = (f.propostas ?? []).filter((p) => igual(p.vendedorNome, filtros.vendedor))
  const propostas = propostasF.filter((p) => dentro(p.dataInclusao, iv.inicio, iv.fim))
  const propostasAnt = iv.anterior ? propostasF.filter((p) => dentro(p.dataInclusao, iv.anterior!.inicio, iv.anterior!.fim)) : null
  const taxa = (xs: PropostaRaw[]) => (xs.length ? (100 * xs.filter((p) => p.aceita).length) / xs.length : null)
  const aceitas = propostas.filter((p) => p.aceita).length
  const taxaAtual = taxa(propostas)

  // Aceitas ainda sem venda (uma por projeto: a alterada por último).
  const projetoPorId = new Map((f.projetos ?? []).map((p) => [p.id, p]))
  const ultimaPorProjeto = new Map<unknown, PropostaRaw>()
  const quando = (p: PropostaRaw) => { const t = Date.parse(p.dataAlteracao ?? p.dataInclusao ?? ''); return Number.isFinite(t) ? t : -Infinity }
  for (const p of propostas) {
    if (!p.aceita || p.projetoId == null) continue
    const a = ultimaPorProjeto.get(p.projetoId)
    if (!a || quando(p) > quando(a)) ultimaPorProjeto.set(p.projetoId, p)
  }
  const semVenda = [...ultimaPorProjeto.values()].filter((p) => !projetoVendido(projetoPorId.get(p.projetoId)))
  const valorSemVenda = soma(semVenda, (p) => (Number(p.preco) > 0 ? Number(p.preco) : 0))

  // Série: 12 meses terminando no mês escolhido (ou no mês corrente / dezembro, para o ano todo).
  const mesAtual = hoje.slice(0, 7)
  const fimSerie = mesValido(filtros.mes) ? `${filtros.ano}-${filtros.mes}` : filtros.ano === hoje.slice(0, 4) ? mesAtual : `${filtros.ano}-12`
  const porMes = new Map<string, { valor: number; vendas: number }>()
  for (const v of vendasF) {
    const k = String(v.dataVenda ?? '').slice(0, 7)
    const g = porMes.get(k) ?? { valor: 0, vendas: 0 }
    g.valor += Number(v.valorTotal) || 0
    g.vendas += 1
    porMes.set(k, g)
  }
  const serie: PontoVendas[] = []
  for (let i = 11; i >= 0; i--) {
    const k = somaMes(fimSerie, -i)
    const g = porMes.get(k) ?? { valor: 0, vendas: 0 }
    const destaque = mesValido(filtros.mes) ? k === fimSerie : k.slice(0, 4) === filtros.ano
    serie.push({ chave: k, nome: rotuloMes(k), valor: Math.round(g.valor), vendas: g.vendas, destaque, parcial: k === mesAtual })
  }

  const periodo = mesValido(filtros.mes) ? `${nomeMes(`${filtros.ano}-${filtros.mes}`)}/${filtros.ano}` : filtros.ano
  const emCurso = iv.fim === hoje && iv.inicio != null && iv.inicio <= hoje
  const ateHoje = emCurso ? ` (até ${ddmm(hoje)})` : ''
  let frase: string
  if (!atual.length && !ant?.length) frase = `Nenhuma venda registrada em ${periodo}${ateHoje} nem no período anterior.`
  else if (ant && vendidoAnt != null) {
    frase = `Em ${periodo}${ateHoje}: ${reais(vendido)} em ${plural(atual.length, 'venda', 'vendas')}, contra ${reais(vendidoAnt)} em ${plural(ant.length, 'venda', 'vendas')} ${naBase(base)}.`
    if (propostas.length) frase += ` ${pctTxt(taxaAtual!)} das ${inteiro(propostas.length)} propostas criadas foram aceitas.`
  } else frase = `Em ${periodo}${ateHoje}: ${reais(vendido)} em ${plural(atual.length, 'venda', 'vendas')}.`

  const kpis: KpiVisao[] = [
    { id: 'vendido', rotulo: 'Vendido', valor: reais(vendido), valorExato: reaisExato(vendido), delta: vendidoAnt != null ? deltaPct(vendido, vendidoAnt, base) : null, contexto: vendidoAnt != null && !vendidoAnt ? `${base}: R$ 0` : undefined, definicao: 'Soma do valor total das vendas com data de venda no período (Groner · Vendas).' },
    { id: 'qtd', rotulo: 'Vendas', valor: inteiro(atual.length), delta: ant ? deltaPct(atual.length, ant.length, base) : null, contexto: ant && !ant.length ? `${base}: 0` : undefined, definicao: 'Quantidade de vendas com data de venda no período (Groner · Vendas).' },
    { id: 'ticket', rotulo: 'Ticket médio', valor: ticket != null ? reais(ticket) : '—', valorExato: ticket != null ? reaisExato(ticket) : undefined, delta: ticket != null && ticketAnt != null ? deltaPct(ticket, ticketAnt, base) : null, contexto: ticket == null ? 'sem vendas no período' : undefined, definicao: 'Vendido ÷ quantidade de vendas no período.' },
    { id: 'propostas', rotulo: 'Propostas criadas', valor: inteiro(propostas.length), delta: propostasAnt ? deltaPct(propostas.length, propostasAnt.length, base) : null, contexto: taxaAtual != null ? `${pctTxt(taxaAtual)} aceitas (${inteiro(aceitas)})` : undefined, definicao: 'Pré-propostas criadas no período. Aceitas = marcadas como aceitas no Groner ÷ criadas no período.' },
  ]
  return { iv, base, kpis, frase, serie, vendas: atual, vendasAnt: ant, vendido, vendidoAnt, semVenda }
}

// ---------- Engenharia ----------
export interface PontoMarco { marco: string; nome: string; rotulo: string; atrasado: number; risco: number; ok: number; total: number; medianaDias: number | null; prazo: number }

const mediana = (v: number[]) => {
  if (!v.length) return null
  const o = [...v].sort((a, b) => a - b)
  const m = Math.floor(o.length / 2)
  return o.length % 2 ? o[m] : Math.round((o[m - 1] + o[m]) / 2)
}

export function calcularEngenharia(f: FontesVisao, filtros: Pick<FiltrosVisao, 'vendedor'>, hoje = hojeSP()) {
  const eng = f.engenharia
  if (!eng) return null
  const cards = eng.cards.filter((c) => igual(c.vendedor, filtros.vendedor))
  const n = (cor: Estado) => cards.filter((c) => c.cor === cor).length
  const atrasados = n('atrasado')
  const risco = n('risco')
  const ok = n('ok')
  const semPlano = cards.filter((c) => c.cor === 'atrasado' && !c.acao).length
  const kwp = soma(cards, (c) => c.kwp)
  const marcos: PontoMarco[] = MARCOS.map((m) => {
    const g = cards.filter((c) => c.marco === m.k)
    return { marco: m.k, nome: m.nome, rotulo: `${m.k} · ${m.nome}`, atrasado: g.filter((c) => c.cor === 'atrasado').length, risco: g.filter((c) => c.cor === 'risco').length, ok: g.filter((c) => c.cor === 'ok').length, total: g.length, medianaDias: mediana(g.map((c) => c.dias)), prazo: eng.prazos.sla[m.k] ?? m.sla }
  }).filter((m) => m.total > 0)
  const gargalo = [...marcos].sort((a, b) => b.atrasado - a.atrasado || b.total - a.total)[0] ?? null

  const mesAtual = hoje.slice(0, 7)
  const mesAnt = somaMes(mesAtual, -1)
  const concl = eng.painel.concluidosPorMes ?? null
  const conclMes = concl?.find((x) => x.mes === mesAtual)?.n ?? null
  const conclAnt = concl?.find((x) => x.mes === mesAnt)?.n ?? null

  const pct = (x: number) => (cards.length ? (100 * x) / cards.length : 0)
  let frase: string
  if (!cards.length) frase = 'Nenhum card ativo no fluxo da Engenharia.'
  else if (!atrasados) frase = `Nenhum dos ${inteiro(cards.length)} cards ativos está atrasado; ${inteiro(risco)} estão em risco.`
  else frase = `${inteiro(atrasados)} de ${inteiro(cards.length)} cards ativos estão atrasados (${pctTxt(pct(atrasados))})${gargalo && gargalo.atrasado ? `; o maior gargalo é o marco ${gargalo.rotulo}, com ${plural(gargalo.atrasado, 'card atrasado', 'cards atrasados')}` : ''}.`

  const kpis: KpiVisao[] = [
    { id: 'ativos', rotulo: 'Cards ativos', valor: inteiro(cards.length), contexto: `${compacto(kwp)} kWp em andamento`, definicao: 'Projetos no fluxo da Engenharia (marcos 1 a 16) que ainda não foram concluídos, com a potência somada.' },
    { id: 'noprazo', rotulo: 'No prazo', valor: cards.length ? pctTxt(pct(ok)) : '—', contexto: `${inteiro(ok)} no prazo · ${inteiro(risco)} em risco`, estado: cards.length && pct(ok) < 50 ? 'risco' : undefined, definicao: 'Cards sem estouro: dentro do prazo do marco, da meta de entrega e da ação combinada. Em risco = perto de estourar algum desses prazos.' },
    { id: 'atrasados', rotulo: 'Atrasados', valor: inteiro(atrasados), contexto: `${pctTxt(pct(atrasados))} dos ativos · ${inteiro(semPlano)} sem plano de ação`, estado: atrasados ? 'atrasado' : 'ok', definicao: 'Cards que passaram do prazo do marco, da meta de entrega (dias desde a venda) ou da ação combinada na pauta.' },
    { id: 'concluidos', rotulo: `Concluídos em ${MESES_ABREV[Number(mesAtual.slice(5, 7)) - 1]}`, valor: conclMes != null ? inteiro(conclMes) : '—', contexto: conclAnt != null ? `${nomeMes(mesAnt)} inteiro: ${inteiro(conclAnt)}${filtros.vendedor ? ' · sem filtro de vendedor' : ''}` : undefined, definicao: 'Projetos que saíram do fluxo (finalizados) neste mês, pela data do último status no Groner. Não é recortado por vendedor.' },
  ]
  return { cards, atrasados, risco, ok, semPlano, marcos, gargalo, kpis, frase }
}

// ---------- Usinas ----------
export interface PontoGeracao { chave: string; nome: string; geracao: number; prognostico: number; usinas: number; pct: number | null }

/**
 * Geração real × prognóstico por mês fechado, só das usinas ao vivo da SolarZ
 * (o relatório estático para no mês da extração e distorceria o último mês).
 */
export function serieSolarz(usinas: UsinaRaw[], hoje = hojeSP()): PontoGeracao[] {
  const vivas = usinas.filter((u) => u.fonte === 'solarz' && (u.mensal?.length ?? 0) > 0)
  const ano = vivas.reduce((a, u) => Math.max(a, u.anoMensal ?? 0), 0)
  if (!ano) return []
  const meses = new Map<number, { g: number; p: number; n: number }>()
  for (const u of vivas) {
    if ((u.anoMensal ?? 0) !== ano) continue
    u.mensal!.forEach((m, i) => {
      if (m.parcial || !m.geracaoKwh || !m.prognosticoKwh) return
      if (`${ano}-${String(i + 1).padStart(2, '0')}` >= hoje.slice(0, 7)) return
      const g = meses.get(i) ?? { g: 0, p: 0, n: 0 }
      g.g += m.geracaoKwh
      g.p += m.prognosticoKwh
      g.n += 1
      meses.set(i, g)
    })
  }
  return [...meses.entries()].sort(([a], [b]) => a - b).map(([i, g]) => {
    const chave = `${ano}-${String(i + 1).padStart(2, '0')}`
    return { chave, nome: rotuloMes(chave), geracao: Math.round(g.g), prognostico: Math.round(g.p), usinas: g.n, pct: g.p ? (100 * g.g) / g.p : null }
  })
}

export const FAROL: Record<string, string> = { OK: 'Normal', ALERTA: 'Com alerta', CRITICO: 'Crítico' }

export function calcularUsinas(f: FontesVisao, hoje = hojeSP()) {
  const r = f.usinas
  if (!r) return null
  const usinas = r.usinas
  const comDado = usinas.filter((u) => u.desempenhoMedio3mPct != null)
  const media3m = comDado.length ? (100 * soma(comDado, (u) => u.desempenhoMedio3mPct)) / comDado.length : null
  const criticas = usinas.filter((u) => u.statusDesempenho === 'Crítico').length
  const atencao = usinas.filter((u) => u.statusDesempenho === 'Atenção').length
  const monitoradas = usinas.filter((u) => u.statusMonitoramento)
  const farolCritico = monitoradas.filter((u) => u.statusMonitoramento === 'CRITICO').length
  const farolAlerta = monitoradas.filter((u) => u.statusMonitoramento === 'ALERTA').length
  const farolNormal = monitoradas.filter((u) => u.statusMonitoramento === 'OK').length
  const tickets = r.origemDados?.ticketsDisponiveis ? r.origemDados.ticketsAbertos ?? 0 : null
  const serie = serieSolarz(usinas, hoje)
  const ultimo = serie.at(-1) ?? null
  const penultimo = serie.at(-2) ?? null

  let frase: string
  if (!usinas.length) frase = 'Nenhuma usina cadastrada.'
  else {
    frase = `${inteiro(criticas)} de ${inteiro(comDado.length)} usinas com dado estão críticas (até 50% do previsto na média de 3 meses) e ${inteiro(atencao)} em atenção`
    frase += ultimo?.pct != null ? `; em ${ultimo.nome} as ${inteiro(ultimo.usinas)} usinas da SolarZ geraram ${pctTxt(ultimo.pct)} do prognóstico.` : '.'
  }
  const kpis: KpiVisao[] = [
    { id: 'desempenho', rotulo: 'Desempenho 3 meses', valor: media3m != null ? pctTxt(media3m) : '—', contexto: `média de 3 meses · ${inteiro(comDado.length)} de ${inteiro(usinas.length)} usinas com dado`, definicao: 'Média simples, entre as usinas com dado, da geração real ÷ prognóstico nos últimos 3 meses fechados.' },
    { id: 'geracao', rotulo: ultimo ? `Geração em ${ultimo.nome}` : 'Geração do mês', valor: ultimo?.pct != null ? pctTxt(ultimo.pct) : '—', delta: ultimo && penultimo ? deltaPp(ultimo.pct, penultimo.pct, `vs ${penultimo.nome}`) : null, contexto: ultimo ? `do prognóstico · ${compacto(ultimo.geracao / 1000)} de ${compacto(ultimo.prognostico / 1000)} MWh` : undefined, definicao: 'Último mês fechado: soma da geração real ÷ soma do prognóstico das usinas da SolarZ com os dois dados no mês.' },
    { id: 'criticas', rotulo: 'Usinas críticas', valor: inteiro(criticas), contexto: `${inteiro(atencao)} em atenção (51% a 70%)`, estado: criticas ? 'atrasado' : 'ok', definicao: 'Usinas cuja média de 3 meses ficou em até 50% do prognóstico. Atenção = de 51% a 70%.' },
    { id: 'farol', rotulo: 'Alertas SolarZ hoje', valor: inteiro(farolCritico + farolAlerta), contexto: `${inteiro(farolCritico)} crítico · ${inteiro(farolNormal)} normais de ${inteiro(monitoradas.length)}${tickets != null ? ` · ${plural(tickets, 'ticket aberto', 'tickets abertos')}` : ''}`, estado: farolCritico ? 'atrasado' : farolAlerta ? 'risco' : 'ok', definicao: 'Farol de monitoramento da SolarZ hoje (Crítico ou Com alerta), só das usinas ligadas à SolarZ. Tickets = chamados abertos na SolarZ.' },
  ]
  return { usinas, comDado, criticas, atencao, farolCritico, farolAlerta, monitoradas, serie, ultimo, kpis, frase, tickets }
}

// ---------- Homologação (Pieta) ----------
export interface PontoEtapa { etapa: string; projetos: number; mediaDias: number | null; amostra: number }
const ENCERRADOS_PIETA = new Set(['Finalizado', 'Cancelado'])

export function calcularHomologacao(f: FontesVisao, hoje = hojeSP()) {
  const r = f.pietaResumo
  if (!r) return null
  const projetos = r.projects ?? []
  const ativos = projetos.filter((p) => !ENCERRADOS_PIETA.has(p.status))
  const comPrazo = ativos.filter((p) => diaPieta(p.dueDate))
  const vencidos = comPrazo.filter((p) => diaPieta(p.dueDate)! < hoje)
  const pendencia = ativos.filter((p) => /^pend[eê]ncia/i.test(p.status))
  const mesAtual = hoje.slice(0, 7)
  const mesAnt = somaMes(mesAtual, -1)
  const fimAnt = `${mesAnt}-${hoje.slice(8, 10)}` > ultimoDia(mesAnt) ? ultimoDia(mesAnt) : `${mesAnt}-${hoje.slice(8, 10)}`
  const finalizados = projetos.filter((p) => p.status === 'Finalizado' && p.lastStatusChange)
  const finMes = finalizados.filter((p) => dentro(p.lastStatusChange, `${mesAtual}-01`, hoje)).length
  const finAnt = finalizados.filter((p) => dentro(p.lastStatusChange, `${mesAnt}-01`, fimAnt)).length
  const baseFin = textoBase({ inicio: `${mesAnt}-01`, fim: fimAnt })

  const tempos = new Map((f.pietaMetricas?.tempoPorEtapa ?? []).map((e) => [e.etapa, e]))
  const contagem = new Map<string, number>()
  for (const p of ativos) contagem.set(p.status, (contagem.get(p.status) ?? 0) + 1)
  const etapas: PontoEtapa[] = [...contagem.entries()]
    .map(([etapa, n]) => ({ etapa, projetos: n, mediaDias: tempos.get(etapa)?.mediaDias ?? null, amostra: tempos.get(etapa)?.projetos ?? 0 }))
    .sort((a, b) => b.projetos - a.projetos || a.etapa.localeCompare(b.etapa, 'pt-BR'))
  const maiorFila = etapas[0] ?? null
  // Etapa mais demorada: só com pelo menos 2 projetos na base detalhada, para um caso isolado não virar regra.
  const demorada = [...(f.pietaMetricas?.tempoPorEtapa ?? [])].filter((e) => e.projetos >= 2 && e.mediaDias != null).sort((a, b) => b.mediaDias! - a.mediaDias!)[0] ?? null
  const cobertura = f.pietaMetricas?.cobertura ?? null

  let frase = `${plural(ativos.length, 'homologação em andamento', 'homologações em andamento')}`
  if (maiorFila) frase += `; a maior fila é ${maiorFila.etapa}, com ${plural(maiorFila.projetos, 'projeto', 'projetos')}`
  frase += `. ${vencidos.length ? `${plural(vencidos.length, 'está', 'estão')} com prazo vencido` : 'Nenhuma com prazo vencido'} e ${pendencia.length ? `${inteiro(pendencia.length)} em pendência` : 'nenhuma em pendência'}.`

  const kpis: KpiVisao[] = [
    { id: 'andamento', rotulo: 'Em andamento', valor: inteiro(ativos.length), contexto: `de ${plural(projetos.length, 'projeto', 'projetos')} na Pieta`, definicao: 'Projetos na Pieta que não estão Finalizados nem Cancelados (resumo da Pieta, todos os projetos).' },
    { id: 'vencidos', rotulo: 'Prazo vencido', valor: inteiro(vencidos.length), contexto: `${inteiro(comPrazo.length)} com prazo informado pela Pieta`, estado: vencidos.length ? 'atrasado' : 'ok', definicao: 'Projetos em andamento cujo prazo informado pela Pieta (due date) já passou. Muitos projetos não têm prazo informado.' },
    { id: 'pendencia', rotulo: 'Em pendência', valor: inteiro(pendencia.length), contexto: pendencia.length ? [...new Set(pendencia.map((p) => p.status.replace(/^Pend[eê]ncia (na|nas|no|nos) /i, '').toLowerCase()))].join(', ') : 'nenhum status de pendência', estado: pendencia.length ? 'risco' : 'ok', definicao: 'Projetos em andamento num status de pendência (assinaturas, distribuidora ou vistoria), à espera de uma ação.' },
    { id: 'finalizadas', rotulo: `Finalizadas em ${MESES_ABREV[Number(mesAtual.slice(5, 7)) - 1]}`, valor: inteiro(finMes), delta: deltaPct(finMes, finAnt, baseFin), contexto: !finAnt ? `${baseFin}: 0` : undefined, definicao: 'Projetos que chegaram a Finalizado neste mês, pela data da última mudança de status, comparados com o mesmo trecho do mês anterior.' },
  ]
  return { projetos, ativos, vencidos, pendencia, etapas, maiorFila, demorada, cobertura, kpis, frase, finMes, finAnt }
}

// ---------- Itens de atenção (posição de hoje, sem filtros) ----------
export function itensAtencao(f: FontesVisao, hoje = hojeSP()): ItemAtencao[] {
  const itens: ItemAtencao[] = []
  const eng = calcularEngenharia(f, { vendedor: '' }, hoje)
  if (eng && eng.atrasados > 0) {
    const pct = (100 * eng.atrasados) / eng.cards.length
    itens.push({
      id: 'eng-atrasados', gravidade: pct >= 50 ? 1 : 2, area: 'Engenharia', peso: pct, numero: inteiro(eng.atrasados),
      frase: `cards atrasados na Engenharia (${pctTxt(pct)} dos ativos)${eng.gargalo?.atrasado ? `; o marco ${eng.gargalo.rotulo} concentra ${inteiro(eng.gargalo.atrasado)}` : ''}. ${eng.semPlano === eng.atrasados ? 'Nenhum tem plano de ação.' : `${inteiro(eng.semPlano)} sem plano de ação.`}`,
      acao: { rotulo: 'Ver cards atrasados', alvo: { tipo: 'detalhe', detalhe: { tipo: 'engenharia', titulo: 'Engenharia · cards atrasados', somenteAtrasados: true } } },
    })
  }
  const us = calcularUsinas(f, hoje)
  if (us && us.criticas > 0) {
    itens.push({
      id: 'usinas-criticas', gravidade: 2, area: 'Usinas', peso: (100 * us.criticas) / Math.max(1, us.comDado.length), numero: inteiro(us.criticas),
      frase: `${us.criticas === 1 ? 'usina gerou' : 'usinas geraram'} até 50% do previsto na média dos últimos 3 meses (status Crítico).`,
      acao: { rotulo: 'Ver usinas críticas', alvo: { tipo: 'detalhe', detalhe: { tipo: 'usinas', titulo: 'Usinas com desempenho crítico', status: 'Crítico' } } },
    })
  }
  if (us && us.farolCritico + us.farolAlerta > 0) {
    const n = us.farolCritico + us.farolAlerta
    itens.push({
      id: 'usinas-farol', gravidade: us.farolCritico ? 2 : 3, area: 'Usinas', peso: (100 * n) / Math.max(1, us.monitoradas.length), numero: inteiro(n),
      frase: `${n === 1 ? 'usina com alerta' : 'usinas com alerta'} no monitoramento da SolarZ hoje${us.farolCritico ? ` (${inteiro(us.farolCritico)} no farol crítico)` : ''}.`,
      acao: { rotulo: 'Ver usinas com alerta', alvo: { tipo: 'detalhe', detalhe: { tipo: 'usinas', titulo: 'Usinas com alerta no monitoramento', monitoramento: ['CRITICO', 'ALERTA'] } } },
    })
  }
  const ho = calcularHomologacao(f, hoje)
  if (ho && ho.vencidos.length) {
    itens.push({
      id: 'pieta-vencidos', gravidade: 2, area: 'Homologação', peso: (100 * ho.vencidos.length) / Math.max(1, ho.ativos.length), numero: inteiro(ho.vencidos.length),
      frase: `${ho.vencidos.length === 1 ? 'homologação está' : 'homologações estão'} com o prazo da Pieta vencido.`,
      acao: { rotulo: 'Abrir Homologação', alvo: { tipo: 'aba', aba: 'pieta' } },
    })
  }
  if (ho && ho.pendencia.length) {
    itens.push({
      id: 'pieta-pendencia', gravidade: 3, area: 'Homologação', peso: (100 * ho.pendencia.length) / Math.max(1, ho.ativos.length), numero: inteiro(ho.pendencia.length),
      frase: `${ho.pendencia.length === 1 ? 'homologação parada' : 'homologações paradas'} em pendência (${[...new Set(ho.pendencia.map((p) => p.status.replace(/^Pend[eê]ncia (na|nas|no|nos) /i, '').toLowerCase()))].join(', ')}).`,
      acao: { rotulo: 'Abrir Homologação', alvo: { tipo: 'aba', aba: 'pieta' } },
    })
  }
  // Vendas do mês corrente contra o mesmo trecho do mês anterior; só com base mínima (3 vendas) para não alarmar à toa.
  if (f.vendas) {
    const c = calcularComercial(f, { ano: hoje.slice(0, 4), mes: hoje.slice(5, 7), vendedor: '' }, hoje)
    if (c.vendasAnt && c.vendasAnt.length >= 3 && c.vendidoAnt) {
      const queda = Math.round((100 * (c.vendidoAnt - c.vendido)) / c.vendidoAnt)
      if (queda >= 30) {
        itens.push({
          id: 'vendas-queda', gravidade: queda >= 50 ? 2 : 3, area: 'Comercial', peso: queda, numero: `−${queda}%`,
          frase: `nas vendas de ${nomeMes(hoje.slice(0, 7))} até ${ddmm(hoje)}: ${reais(c.vendido)} em ${plural(c.vendas.length, 'venda', 'vendas')}, contra ${reais(c.vendidoAnt)} em ${plural(c.vendasAnt.length, 'venda', 'vendas')} ${naBase(c.base)}.`,
          acao: { rotulo: 'Abrir Comercial', alvo: { tipo: 'aba', aba: 'vendas' } },
        })
      }
    }
  }
  const atrasadas = (f.tarefas ?? []).filter((t) => t.atrasada).length
  if (atrasadas) {
    itens.push({
      id: 'tarefas', gravidade: 3, area: 'Tarefas', peso: (100 * atrasadas) / Math.max(1, f.tarefas!.length), numero: inteiro(atrasadas),
      frase: `${atrasadas === 1 ? 'tarefa' : 'tarefas'} do Groner com a data de entrega vencida.`,
      acao: { rotulo: 'Ver tarefas atrasadas', alvo: { tipo: 'detalhe', detalhe: { tipo: 'tarefas', titulo: 'Tarefas atrasadas' } } },
    })
  }
  return itens.sort((a, b) => a.gravidade - b.gravidade || b.peso - a.peso).slice(0, MAX_ITENS_ATENCAO)
}

/** Data e hora (dd/mm/aaaa hh:mm) no fuso de Brasília. */
export function dataHoraBr(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '')
}

export { textoDe }
