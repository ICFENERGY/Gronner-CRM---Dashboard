/**
 * Números das quatro áreas do painel (Vendas, Financeiro, Usinas e
 * Homologação) e os alertas de cada uma. Funções puras, sem React: o relógio
 * entra por parâmetro. As linhas das tabelas de indicadores saem daqui em
 * `indicadores.ts`.
 */
import { gronerFunis } from '../../../shared/gronerFunis.js'
import type { PietaMetricas, PietaResumo, PropostaRaw, ProjetoRaw, TarefaRaw, UsinaRaw, UsinasRawResponse, VendaRaw } from '../../api/types'
import { igual, projetoVendido } from '../painel/calculos'
import { NOMES_MESES, dentro, hojeSP, intervalo, mesValido } from '../painel/periodo'

export type Area = 'geral' | 'vendas' | 'financeiro' | 'usinas' | 'homologacao'

/** Nome fixo de cada área e a fonte dela: o mesmo texto em menus, títulos, alertas e rodapés. */
export const AREAS: Record<Area, { nome: string; fonte: string }> = {
  geral: { nome: 'Visão Geral', fonte: 'Groner CRM' },
  vendas: { nome: 'Vendas', fonte: 'Groner CRM' },
  financeiro: { nome: 'Financeiro', fonte: 'Groner CRM' },
  usinas: { nome: 'Usinas', fonte: 'SolarZ' },
  homologacao: { nome: 'Homologação', fonte: 'PIETA' },
}

export interface Filtros {
  /** Ano com 4 dígitos. */
  ano: string
  /** '01'..'12', ou '' para o ano todo. */
  mes: string
  vendedor: string
}

export interface Fontes {
  vendas: VendaRaw[] | null
  propostas: PropostaRaw[] | null
  projetos: ProjetoRaw[] | null
  tarefas: TarefaRaw[] | null
  usinas: UsinasRawResponse | null
  pietaResumo: PietaResumo | null
  pietaMetricas: PietaMetricas | null
}

// ---------- formatação pt-BR ----------
const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
export const inteiro = (v: number) => nf0.format(Math.round(v))
export const decimal1 = (v: number) => nf1.format(v)
/** Curto: 1,2 mi · 104 mil · 950. */
export const compacto = (v: number) => (Math.abs(v) >= 1e6 ? `${nf1.format(v / 1e6)} mi` : Math.abs(v) >= 1e3 ? `${nf0.format(Math.round(v / 1e3))} mil` : nf0.format(Math.round(v)))
export const reais = (v: number) => `R$ ${compacto(v)}`
export const reaisExato = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
export const pctTxt = (v: number) => `${nf0.format(Math.round(v))}%`
/** kWh em MWh com uma casa: 69,5 MWh. */
export const mwh = (kwh: number) => `${nf1.format(kwh / 1000)} MWh`
export const plural = (n: number, um: string, varios: string) => `${inteiro(n)} ${n === 1 ? um : varios}`
const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
export const rotuloMes = (chave: string) => `${MESES_ABREV[Number(chave.slice(5, 7)) - 1]}/${chave.slice(2, 4)}`
export const nomeMes = (chave: string) => NOMES_MESES[Number(chave.slice(5, 7)) - 1].toLowerCase()
export const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
export const somaMes = (chave: string, n: number) => {
  const d = new Date(Date.UTC(Number(chave.slice(0, 4)), Number(chave.slice(5, 7)) - 1 + n, 1))
  return d.toISOString().slice(0, 7)
}
const ultimoDia = (chave: string) => new Date(Date.UTC(Number(chave.slice(0, 4)), Number(chave.slice(5, 7)), 0)).toISOString().slice(0, 10)
const soma = <T,>(xs: T[], f: (x: T) => number | null | undefined) => xs.reduce((a, x) => a + (Number(f(x)) || 0), 0)
const media = (xs: number[]) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : null)

/** Texto da base de comparação: "setembro/26", "01/09 a 29/09", "2025" ou "01/01 a 29/10/2025". */
export function textoBase(ant: { inicio: string; fim: string }): string {
  const mesIni = ant.inicio.slice(0, 7)
  if (ant.inicio.endsWith('-01-01') && ant.fim.endsWith('-12-31')) return ant.inicio.slice(0, 4)
  if (ant.inicio.slice(0, 4) !== ant.fim.slice(0, 4) || ant.inicio.slice(5, 7) !== ant.fim.slice(5, 7)) return `${ddmm(ant.inicio)} a ${ddmm(ant.fim)}/${ant.fim.slice(0, 4)}`
  if (ant.inicio.endsWith('-01') && ant.fim === ultimoDia(mesIni)) return `${nomeMes(mesIni)}/${mesIni.slice(2, 4)}`
  return `${ddmm(ant.inicio)} a ${ddmm(ant.fim)}`
}

/** Prazo da PIETA: chega como "dd/mm/aaaa" (ou ISO). */
export function diaPieta(s: string | null | undefined): string | null {
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s)
  return br ? `${br[3]}-${br[2]}-${br[1]}` : null
}

/** Data e hora (dd/mm/aaaa hh:mm) no fuso de Brasília. */
export function dataHoraBr(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '')
}

/** Recorte de um período: o atual e o anterior (mesmo trecho), com o texto da base. */
function periodo(filtros: Filtros, hoje: string) {
  const iv = intervalo(filtros.ano, filtros.mes, hoje)
  const base = iv.anterior ? textoBase(iv.anterior) : ''
  const noAtual = (d: string | null | undefined) => dentro(d, iv.inicio, iv.fim)
  const noAnterior = (d: string | null | undefined) => (iv.anterior ? dentro(d, iv.anterior.inicio, iv.anterior.fim) : false)
  return { iv, base, noAtual, noAnterior, temAnterior: Boolean(iv.anterior) }
}

/** Funil do Groner normalizado para o número dele ("04. FUNIL DE VENDAS SOLAR 🏆" → 4); null sem número. */
export function numeroFunil(funil: string | null | undefined): number | null {
  const m = /^\s*(\d{1,2})\s*\./.exec(funil ?? '')
  return m ? Number(m[1]) : null
}
const semAcento = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase()

// ---------- Vendas ----------
export interface PontoMensal { chave: string; nome: string; valor: number; qtd: number; destaque: boolean; parcial: boolean }

/** Meses da série: 12, terminando no mês escolhido (ou no mês corrente / dezembro, para o ano todo). */
function mesesDaSerie(filtros: Filtros, hoje: string) {
  const mesAtual = hoje.slice(0, 7)
  const fim = mesValido(filtros.mes) ? `${filtros.ano}-${filtros.mes}` : filtros.ano === hoje.slice(0, 4) ? mesAtual : `${filtros.ano}-12`
  return Array.from({ length: 12 }, (_, i) => {
    const k = somaMes(fim, i - 11)
    return { chave: k, nome: rotuloMes(k), destaque: mesValido(filtros.mes) ? k === fim : k.slice(0, 4) === filtros.ano, parcial: k === mesAtual }
  })
}

/** Funis que não são de cliente: parcerias, RH e os sem número (grupos, fluxos internos). */
const CATEGORIAS_FORA_DE_LEADS = new Set(['parcerias', 'rh', 'outros'])
const categoriaPorNumero = new Map<number, string>(
  (gronerFunis.funilOrdem as string[]).map((nome) => [numeroFunil(nome), (gronerFunis.funilCategoria as Record<string, string>)[nome]] as const).filter((x): x is [number, string] => x[0] != null),
)
/** Projeto de cliente (lead): num funil numerado fora de parcerias e RH. */
export const projetoDeCliente = (p: ProjetoRaw) => {
  const n = numeroFunil(p.funil)
  return n != null && !CATEGORIAS_FORA_DE_LEADS.has(categoriaPorNumero.get(n) ?? 'outros')
}

export function calcularVendas(f: Fontes, filtros: Filtros, hoje = hojeSP()) {
  const pe = periodo(filtros, hoje)
  const vendasF = (f.vendas ?? []).filter((v) => igual(v.vendedor, filtros.vendedor))
  const atual = vendasF.filter((v) => pe.noAtual(v.dataVenda))
  const ant = pe.temAnterior ? vendasF.filter((v) => pe.noAnterior(v.dataVenda)) : null
  const vendido = soma(atual, (v) => v.valorTotal)
  const vendidoAnt = ant ? soma(ant, (v) => v.valorTotal) : null

  const propostasF = (f.propostas ?? []).filter((p) => igual(p.vendedorNome, filtros.vendedor))
  const propostas = propostasF.filter((p) => pe.noAtual(p.dataInclusao))
  const propostasAnt = pe.temAnterior ? propostasF.filter((p) => pe.noAnterior(p.dataInclusao)) : null
  const aceitas = propostas.filter((p) => p.aceita).length
  const aceitasAnt = propostasAnt ? propostasAnt.filter((p) => p.aceita).length : null

  const clientes = (f.projetos ?? []).filter((p) => projetoDeCliente(p) && igual(p.vendedorResponsavel, filtros.vendedor))
  const leads = f.projetos ? clientes.filter((p) => pe.noAtual(p.dataInclusao)).length : null
  const leadsAnt = f.projetos && pe.temAnterior ? clientes.filter((p) => pe.noAnterior(p.dataInclusao)).length : null

  const tarefasAtrasadas = f.tarefas ? f.tarefas.filter((t) => t.atrasada).length : null

  const porMes = new Map<string, { valor: number; qtd: number }>()
  for (const v of vendasF) {
    const k = String(v.dataVenda ?? '').slice(0, 7)
    const g = porMes.get(k) ?? { valor: 0, qtd: 0 }
    g.valor += Number(v.valorTotal) || 0
    g.qtd += 1
    porMes.set(k, g)
  }
  const serie: PontoMensal[] = mesesDaSerie(filtros, hoje).map((m) => ({ ...m, valor: Math.round(porMes.get(m.chave)?.valor ?? 0), qtd: porMes.get(m.chave)?.qtd ?? 0 }))

  return {
    ...pe, vendas: atual, vendasAnt: ant, vendido, vendidoAnt,
    qtd: atual.length, qtdAnt: ant?.length ?? null,
    ticket: atual.length ? vendido / atual.length : null,
    ticketAnt: ant?.length ? vendidoAnt! / ant.length : null,
    propostas: propostas.length, propostasAnt: propostasAnt?.length ?? null,
    aceitas, aceitasAnt,
    taxaAceite: propostas.length ? (100 * aceitas) / propostas.length : null,
    taxaAceiteAnt: propostasAnt?.length ? (100 * aceitasAnt!) / propostasAnt.length : null,
    leads, leadsAnt, tarefasAtrasadas, tarefasTotal: f.tarefas?.length ?? null, serie,
  }
}

// ---------- Financeiro ----------
/** Valor de um projeto na carteira: o da venda; sem ele, o da proposta aceita. */
export const valorProjeto = (p: ProjetoRaw) => (Number(p.valorVenda) > 0 ? Number(p.valorVenda) : Number(p.valorPrePropostaAceita) > 0 ? Number(p.valorPrePropostaAceita) : 0)

/** Funis da carteira (contrato até instalação), na ordem do Groner. */
export const FUNIS_CARTEIRA: { n: number; nome: string }[] = [
  { n: 6, nome: 'Contrato' },
  { n: 7, nome: 'Financeiro' },
  { n: 8, nome: 'Engenharia projeto' },
  { n: 9, nome: 'Compras' },
  { n: 10, nome: 'Homologação' },
  { n: 11, nome: 'Instalação' },
]
const ETAPA_PERDIDA = /PERDID|DESISTENCIA|RECUSADO/
const ETAPAS_AGUARDANDO_PAGAMENTO = new Set(['AGUARDANDO PAGAMENTO', 'PENDENTE PAGAMENTO', 'PAGAMENTO EM PROCESSO'])

export interface Grupo { qtd: number; valor: number }
const somar = (xs: ProjetoRaw[]): Grupo => ({ qtd: xs.length, valor: soma(xs, valorProjeto) })

/** Propostas aceitas no recorte, uma por projeto (a alterada por último), separadas em vendidas e sem venda. */
function aceitasPorProjeto(propostas: PropostaRaw[], projetoPorId: Map<number, ProjetoRaw>) {
  const quando = (p: PropostaRaw) => { const t = Date.parse(p.dataAlteracao ?? p.dataInclusao ?? ''); return Number.isFinite(t) ? t : -Infinity }
  const ultima = new Map<unknown, PropostaRaw>()
  const semProjeto: PropostaRaw[] = []
  for (const p of propostas) {
    if (!p.aceita) continue
    if (p.projetoId == null) { semProjeto.push(p); continue }
    const a = ultima.get(p.projetoId)
    if (!a || quando(p) > quando(a)) ultima.set(p.projetoId, p)
  }
  const lista = [...ultima.values(), ...semProjeto]
  const preco = (p: PropostaRaw) => (Number(p.preco) > 0 ? Number(p.preco) : 0)
  const vendidas = lista.filter((p) => projetoVendido(projetoPorId.get(p.projetoId)))
  const semVenda = lista.filter((p) => !projetoVendido(projetoPorId.get(p.projetoId)))
  return { qtd: lista.length, valor: soma(lista, preco), vendidas: soma(vendidas, preco), semVenda: soma(semVenda, preco), qtdSemVenda: semVenda.length, listaSemVenda: semVenda }
}

/** Lucro e comissão registrados nas vendas (sem negativos; o lucro nunca passa do valor da venda). */
function resultado(vendas: VendaRaw[]) {
  const comLucro = vendas.filter((v) => Number(v.lucro) > 0 && Number(v.valorTotal) > 0)
  const lucro = soma(comLucro, (v) => Math.min(Number(v.lucro), Number(v.valorTotal)))
  const baseLucro = soma(comLucro, (v) => v.valorTotal)
  return {
    lucro,
    margem: baseLucro ? (100 * lucro) / baseLucro : null,
    comLucro: comLucro.length,
    cobertura: vendas.length ? (100 * comLucro.length) / vendas.length : null,
    comissao: soma(vendas, (v) => Math.max(Number(v.valorComissao) || 0, 0)),
  }
}

export function calcularFinanceiro(f: Fontes, filtros: Filtros, hoje = hojeSP()) {
  const pe = periodo(filtros, hoje)
  const projetos = (f.projetos ?? []).filter((p) => igual(p.vendedorResponsavel, filtros.vendedor))
  const projetoPorId = new Map((f.projetos ?? []).map((p) => [p.id, p]))
  const propostasF = (f.propostas ?? []).filter((p) => igual(p.vendedorNome, filtros.vendedor))
  const aceitas = aceitasPorProjeto(propostasF.filter((p) => pe.noAtual(p.dataInclusao)), projetoPorId)
  const aceitasAnt = pe.temAnterior ? aceitasPorProjeto(propostasF.filter((p) => pe.noAnterior(p.dataInclusao)), projetoPorId) : null

  const vendasF = (f.vendas ?? []).filter((v) => igual(v.vendedor, filtros.vendedor))
  const res = resultado(vendasF.filter((v) => pe.noAtual(v.dataVenda)))
  const resAnt = pe.temAnterior ? resultado(vendasF.filter((v) => pe.noAnterior(v.dataVenda))) : null

  // Posição de hoje no funil (não segue o período).
  const ativos = projetos.filter((p) => !ETAPA_PERDIDA.test(semAcento(p.etapa)))
  const doFunil = (n: number) => ativos.filter((p) => numeroFunil(p.funil) === n)
  const banco = somar(doFunil(5))
  const contrato = doFunil(6)
  const contratoEmAndamento = somar(contrato.filter((p) => !/VENDA REALI[SZ]ADA/.test(semAcento(p.etapa))))
  const financeiro = doFunil(7)
  const aguardandoPagamento = somar(financeiro.filter((p) => ETAPAS_AGUARDANDO_PAGAMENTO.has(semAcento(p.etapa))))
  const pagamentoRealizado = somar(financeiro.filter((p) => semAcento(p.etapa) === 'PAGAMENTO REALIZADO'))
  const carteira = FUNIS_CARTEIRA.map((x) => ({ ...x, ...somar(doFunil(x.n)) }))
  const carteiraTotal = carteira.reduce((a, c) => ({ qtd: a.qtd + c.qtd, valor: a.valor + c.valor }), { qtd: 0, valor: 0 })

  // Série: valor em propostas aceitas por mês de criação (uma por projeto em cada mês).
  const serie: PontoMensal[] = mesesDaSerie(filtros, hoje).map((m) => {
    const a = aceitasPorProjeto(propostasF.filter((p) => String(p.dataInclusao ?? '').slice(0, 7) === m.chave), projetoPorId)
    return { ...m, valor: Math.round(a.valor), qtd: a.qtd }
  })

  return { ...pe, aceitas, aceitasAnt, res, resAnt, serie, banco, contratoEmAndamento, aguardandoPagamento, pagamentoRealizado, carteira, carteiraTotal, temProjetos: Boolean(f.projetos) }
}

// ---------- Usinas ----------
export interface PontoGeracao { chave: string; nome: string; geracao: number; prognostico: number; usinas: number; pct: number | null }

/**
 * Geração real × prognóstico por mês fechado, só das usinas com monitoramento
 * da SolarZ (o relatório estático para no mês da extração e distorceria o último mês).
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

export function calcularUsinas(f: Fontes, hoje = hojeSP()) {
  const r = f.usinas
  if (!r) return null
  const usinas = r.usinas
  const premium = usinas.filter((u) => u.fonte === 'solarz').length
  const kwp = soma(usinas, (u) => u.potenciaKwp)
  const mediaPct = (campo: 'desempenho30dPct' | 'desempenho12mPct' | 'desempenhoMedio3mPct') => {
    const xs = usinas.map((u) => u[campo]).filter((v): v is number => v != null && Number.isFinite(v))
    const m = media(xs)
    return { valor: m != null ? 100 * m : null, n: xs.length }
  }
  const status = (s: string) => usinas.filter((u) => (u.statusDesempenho ?? 'Sem dado') === s).length
  const monitoradas = usinas.filter((u) => u.statusMonitoramento)
  const farol = (s: string) => monitoradas.filter((u) => u.statusMonitoramento === s).length
  const serie = serieSolarz(usinas, hoje)
  return {
    usinas, total: usinas.length, premium, naoPremium: usinas.length - premium, kwp,
    serie, ultimo: serie.at(-1) ?? null, penultimo: serie.at(-2) ?? null,
    d30: mediaPct('desempenho30dPct'), d12: mediaPct('desempenho12mPct'), d3: mediaPct('desempenhoMedio3mPct'),
    dentro: status('Dentro do esperado'), atencao: status('Atenção'), criticas: status('Crítico'), semDado: status('Sem dado'),
    monitoradas: monitoradas.length, farolNormal: farol('OK'), farolAlerta: farol('ALERTA'), farolCritico: farol('CRITICO'),
    tickets: r.origemDados?.ticketsDisponiveis ? r.origemDados.ticketsAbertos ?? 0 : null,
  }
}

// ---------- Homologação (PIETA) ----------
export interface PontoEtapa { etapa: string; projetos: number; mediaDias: number | null; amostra: number }
const ENCERRADOS_PIETA = new Set(['Finalizado', 'Cancelado'])
export const tipoPendencia = (status: string) => status.replace(/^Pend[eê]ncia (na|nas|no|nos) /i, '').toLowerCase()

export function calcularHomologacao(f: Fontes, hoje = hojeSP()) {
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

  const m = f.pietaMetricas && !f.pietaMetricas.vazio ? f.pietaMetricas : null
  const tempos = new Map((m?.tempoPorEtapa ?? []).map((e) => [e.etapa, e]))
  const contagem = new Map<string, number>()
  for (const p of ativos) contagem.set(p.status, (contagem.get(p.status) ?? 0) + 1)
  const etapas: PontoEtapa[] = [...contagem.entries()]
    .map(([etapa, n]) => ({ etapa, projetos: n, mediaDias: tempos.get(etapa)?.mediaDias ?? null, amostra: tempos.get(etapa)?.projetos ?? 0 }))
    .sort((a, b) => b.projetos - a.projetos || a.etapa.localeCompare(b.etapa, 'pt-BR'))
  // Etapa mais demorada: só com pelo menos 2 projetos na base detalhada, para um caso isolado não virar regra.
  const demorada = [...(m?.tempoPorEtapa ?? [])].filter((e) => e.projetos >= 2 && e.mediaDias != null).sort((a, b) => b.mediaDias! - a.mediaDias!)[0] ?? null
  const cob = m?.cobertura ?? null
  return {
    projetos, ativos, comPrazo, vencidos, pendencia, etapas, demorada, finMes, finAnt, baseFin,
    desdePagamento: m?.tempoDesdePagamento?.finalizados ?? null,
    cobertura: cob && cob.totalNoResumo ? { armazenados: cob.armazenados, total: cob.totalNoResumo, pct: (100 * cob.armazenados) / cob.totalNoResumo } : null,
  }
}

// ---------- Visão Geral (tudo do Groner CRM) ----------
export interface Item { nome: string; valor: number }
/** Etapa de saída do funil: o projeto não está mais em andamento. */
const ETAPA_ENCERRADA = /PERDID|DESISTENCIA|RECUSADO|DESCARTADO|DESQUALIFICAD/
/** Projeto em andamento: de cliente, fora dos funis de perda (22 e 23) e de etapas de saída. */
export const projetoAtivo = (p: ProjetoRaw) => projetoDeCliente(p) && (numeroFunil(p.funil) ?? 0) < 22 && !p.perda && !ETAPA_ENCERRADA.test(semAcento(p.etapa))
/** Funis do negócio em movimento (venda até instalação): onde um card parado custa dinheiro. */
export const FUNIS_EM_MOVIMENTO = { de: 4, ate: 11 }
export const DIAS_PARADO = 30

/** Categorias do funil do Groner, na ordem do fluxo, com os funis de cada uma. */
const CATEGORIAS_FUNIL = (gronerFunis.categoriaOrdem as string[]).filter((k) => !CATEGORIAS_FORA_DE_LEADS.has(k) && k !== 'perdas')
const ranking = (m: Map<string, number>, max = 10): Item[] => {
  const ord = [...m.entries()].map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor)
  if (ord.length <= max) return ord
  return [...ord.slice(0, max - 1), { nome: `Outros (${ord.length - max + 1})`, valor: ord.slice(max - 1).reduce((a, x) => a + x.valor, 0) }]
}
const contar = <T,>(xs: T[], chave: (x: T) => string) => {
  const m = new Map<string, number>()
  for (const x of xs) { const k = chave(x); m.set(k, (m.get(k) ?? 0) + 1) }
  return m
}
const nomeOu = (v: unknown, padrao: string) => textoLimpo(v) || padrao
const textoLimpo = (v: unknown) => (typeof v === 'string' ? v : '').replace(/\s+/g, ' ').trim()

export function calcularGeral(f: Fontes, filtros: Filtros, hoje = hojeSP()) {
  const pe = periodo(filtros, hoje)
  const v = calcularVendas(f, filtros, hoje)
  const fin = calcularFinanceiro(f, filtros, hoje)
  const doVendedor = (f.projetos ?? []).filter((p) => igual(p.vendedorResponsavel, filtros.vendedor))
  const ativos = doVendedor.filter(projetoAtivo)
  const emMovimento = ativos.filter((p) => { const n = numeroFunil(p.funil) ?? 0; return n >= FUNIS_EM_MOVIMENTO.de && n <= FUNIS_EM_MOVIMENTO.ate })
  const parados = emMovimento.filter((p) => (p.diasSemAtualizacao ?? 0) > DIAS_PARADO)
  const carteira = ativos.filter((p) => { const n = numeroFunil(p.funil) ?? 0; return n >= 6 && n <= 11 })
  const novos = doVendedor.filter((p) => projetoDeCliente(p) && pe.noAtual(p.dataInclusao))

  // Funil: por categoria (linhas da tabela) e por funil com as etapas (gráfico e lista).
  const nomeFunil = new Map<number, string>((gronerFunis.funilOrdem as string[]).map((n) => [numeroFunil(n), n] as const).filter((x): x is [number, string] => x[0] != null))
  const porFunil = new Map<number, { funil: string; n: number; qtd: number; valor: number; etapas: Map<string, { qtd: number; valor: number }> }>()
  for (const p of ativos) {
    const n = numeroFunil(p.funil)!
    const g = porFunil.get(n) ?? { funil: nomeFunil.get(n) ?? textoLimpo(p.funil), n, qtd: 0, valor: 0, etapas: new Map() }
    g.qtd += 1
    g.valor += valorProjeto(p)
    const etapa = nomeOu(p.etapa, 'Sem etapa')
    const e = g.etapas.get(etapa) ?? { qtd: 0, valor: 0 }
    e.qtd += 1
    e.valor += valorProjeto(p)
    g.etapas.set(etapa, e)
    porFunil.set(n, g)
  }
  const funis = [...porFunil.values()].sort((a, b) => a.n - b.n)
  const categorias = CATEGORIAS_FUNIL.map((k) => {
    const doGrupo = funis.filter((x) => categoriaPorNumero.get(x.n) === k)
    return { chave: k, nome: (gronerFunis.categoriaLabel as Record<string, string>)[k] ?? k, funis: doGrupo.map((x) => String(x.n).padStart(2, '0')), qtd: doGrupo.reduce((a, x) => a + x.qtd, 0) }
  }).filter((c) => c.funis.length)

  // Tarefas: posição de hoje (não têm vendedor).
  const tarefas = f.tarefas ?? []
  const abertas = tarefas.filter((t) => !/^finaliza|^conclu|^cancel/i.test(textoLimpo(t.status)))
  const atrasadas = tarefas.filter((t) => t.atrasada)
  const porResponsavel = new Map<string, number>()
  for (const t of atrasadas) for (const r of t.responsaveis?.length ? t.responsaveis : ['Sem responsável']) porResponsavel.set(nomeOu(r, 'Sem responsável'), (porResponsavel.get(nomeOu(r, 'Sem responsável')) ?? 0) + 1)

  // Propostas criadas por mês (série de 12 meses, como a de vendas).
  const propostasF = (f.propostas ?? []).filter((p) => igual(p.vendedorNome, filtros.vendedor))
  const propostasMes = contar(propostasF, (p) => String(p.dataInclusao ?? '').slice(0, 7))
  const aceitasMes = contar(propostasF.filter((p) => p.aceita), (p) => String(p.dataInclusao ?? '').slice(0, 7))
  const seriePropostas: PontoMensal[] = mesesDaSerie(filtros, hoje).map((m) => ({ ...m, valor: propostasMes.get(m.chave) ?? 0, qtd: aceitasMes.get(m.chave) ?? 0 }))

  return {
    ...pe, vendas: v, financeiro: fin,
    temProjetos: Boolean(f.projetos), temTarefas: Boolean(f.tarefas),
    ativos: ativos.length, novos: v.leads, novosAnt: v.leadsAnt,
    emMovimento: emMovimento.length, parados: parados.length,
    kwpCarteira: soma(carteira, (p) => p.kwp), comKwp: carteira.filter((p) => Number(p.kwp) > 0).length, qtdCarteira: carteira.length,
    valorCarteira: soma(carteira, valorProjeto),
    categorias, funis: funis.map((x) => ({ ...x, etapas: [...x.etapas.entries()].map(([etapa, e]) => ({ etapa, ...e })).sort((a, b) => b.qtd - a.qtd) })),
    porVendedor: ranking(contar(ativos, (p) => nomeOu(p.vendedorResponsavel, 'Sem vendedor'))),
    porOrigem: ranking(contar(novos, (p) => nomeOu(p.origemLead, 'Não informada'))),
    porUf: ranking(contar(ativos, (p) => nomeOu(p.estado, 'Não informado').toUpperCase())),
    porCidade: ranking(contar(ativos, (p) => `${nomeOu(p.cidade, 'Não informada')}${p.estado ? `/${textoLimpo(p.estado).toUpperCase()}` : ''}`), 15),
    tarefasTotal: tarefas.length, tarefasAbertas: abertas.length, tarefasAtrasadas: atrasadas.length,
    atrasadasPorResponsavel: ranking(porResponsavel),
    seriePropostas,
  }
}

// ---------- Vendas (aprofundamento comercial) ----------
export interface LinhaVendedor { vendedor: string; vendido: number; vendas: number; ticket: number | null; propostas: number; aceitas: number; taxa: number | null }

const mediana = (xs: number[]) => {
  if (!xs.length) return null
  const o = [...xs].sort((a, b) => a - b)
  const m = Math.floor(o.length / 2)
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2
}

/** Indicadores próprios da aba Vendas: conversão, ticket e vendedores (o resumo fica na Visão Geral). */
export function calcularComercial(f: Fontes, filtros: Filtros, hoje = hojeSP()) {
  const v = calcularVendas(f, filtros, hoje)
  const fin = calcularFinanceiro(f, filtros, hoje)
  const pe = periodo(filtros, hoje)
  const propostasF = (f.propostas ?? []).filter((p) => igual(p.vendedorNome, filtros.vendedor))
  const doRecorte = (noPeriodo: (d: string | null | undefined) => boolean) => {
    const vendas = (f.vendas ?? []).filter((x) => igual(x.vendedor, filtros.vendedor) && noPeriodo(x.dataVenda))
    const valores = vendas.map((x) => Number(x.valorTotal) || 0)
    const ciclos = vendas.map((x) => x.cicloVenda).filter((c): c is number => c != null && Number.isFinite(c) && c >= 0)
    const porVendedor = contar(vendas, (x) => nomeOu(x.vendedor, 'Sem vendedor'))
    const valorPorVendedor = new Map<string, number>()
    for (const x of vendas) { const n = nomeOu(x.vendedor, 'Sem vendedor'); valorPorVendedor.set(n, (valorPorVendedor.get(n) ?? 0) + (Number(x.valorTotal) || 0)) }
    const total = valores.reduce((a, x) => a + x, 0)
    const maior = Math.max(0, ...valorPorVendedor.values())
    const propostas = propostasF.filter((p) => noPeriodo(p.dataInclusao))
    return {
      vendas, total,
      ciclo: media(ciclos), maiorVenda: valores.length ? Math.max(...valores) : null, medianaVenda: mediana(valores),
      vendedores: porVendedor.size, concentracao: total ? (100 * maior) / total : null,
      comProposta: new Set(propostas.map((p) => nomeOu(p.vendedorNome, 'Sem vendedor'))).size,
      propostasPorVenda: vendas.length ? propostas.length / vendas.length : null,
    }
  }
  const atual = doRecorte(pe.noAtual)
  const ant = pe.temAnterior ? doRecorte(pe.noAnterior) : null
  const conversao = fin.aceitas.qtd ? (100 * (fin.aceitas.qtd - fin.aceitas.qtdSemVenda)) / fin.aceitas.qtd : null
  const conversaoAnt = fin.aceitasAnt?.qtd ? (100 * (fin.aceitasAnt.qtd - fin.aceitasAnt.qtdSemVenda)) / fin.aceitasAnt.qtd : null

  // Ranking por vendedor: vendas e propostas do período, maior valor vendido primeiro.
  const nomes = new Set<string>([...atual.vendas.map((x) => nomeOu(x.vendedor, 'Sem vendedor')), ...propostasF.filter((p) => pe.noAtual(p.dataInclusao)).map((p) => nomeOu(p.vendedorNome, 'Sem vendedor'))])
  const vendedores: LinhaVendedor[] = [...nomes].map((nome) => {
    const vs = atual.vendas.filter((x) => nomeOu(x.vendedor, 'Sem vendedor') === nome)
    const ps = propostasF.filter((p) => pe.noAtual(p.dataInclusao) && nomeOu(p.vendedorNome, 'Sem vendedor') === nome)
    const vendido = vs.reduce((a, x) => a + (Number(x.valorTotal) || 0), 0)
    const aceitas = ps.filter((p) => p.aceita).length
    return { vendedor: nome, vendido, vendas: vs.length, ticket: vs.length ? vendido / vs.length : null, propostas: ps.length, aceitas, taxa: ps.length ? (100 * aceitas) / ps.length : null }
  }).sort((a, b) => b.vendido - a.vendido || b.aceitas - a.aceitas || a.vendedor.localeCompare(b.vendedor, 'pt-BR'))

  // Ticket médio por mês (12 meses).
  const serieTicket: PontoMensal[] = v.serie.map((m) => ({ ...m, valor: m.qtd ? Math.round(m.valor / m.qtd) : 0 }))
  return { ...pe, vendasCalc: v, atual, ant, conversao, conversaoAnt, vendedores, serieTicket }
}

// ---------- Alertas (posição de hoje, de 0 a 3 por área) ----------
export interface Alerta {
  id: string
  /** 1 = crítico, 2 = atenção, 3 = acompanhar. */
  gravidade: 1 | 2 | 3
  numero: string
  frase: string
  /** Desempate dentro da mesma gravidade (maior primeiro). */
  peso: number
}
export const MAX_ALERTAS = 3

const ordenar = (xs: Alerta[]) => xs.sort((a, b) => a.gravidade - b.gravidade || b.peso - a.peso).slice(0, MAX_ALERTAS)

export function alertasDaArea(area: Area, f: Fontes, hoje = hojeSP()): Alerta[] {
  const itens: Alerta[] = []
  if (area === 'geral' || area === 'vendas') {
    // Vendas do mês corrente contra o mesmo trecho do mês anterior; só com base mínima (3 vendas) para não alarmar à toa.
    if (f.vendas) {
      const c = calcularVendas(f, { ano: hoje.slice(0, 4), mes: hoje.slice(5, 7), vendedor: '' }, hoje)
      if (c.vendasAnt && c.vendasAnt.length >= 3 && c.vendidoAnt) {
        const queda = Math.round((100 * (c.vendidoAnt - c.vendido)) / c.vendidoAnt)
        if (queda >= 30) {
          itens.push({
            id: 'vendas-queda', gravidade: queda >= 50 ? 2 : 3, peso: queda, numero: `−${queda}%`,
            frase: `no valor vendido em ${nomeMes(hoje.slice(0, 7))} até ${ddmm(hoje)} (${reais(c.vendido)} em ${plural(c.qtd, 'venda', 'vendas')}), contra ${reais(c.vendidoAnt)} de ${c.base}.`,
          })
        }
      }
    }
  }
  if (area === 'geral') {
    const g = calcularGeral(f, { ano: hoje.slice(0, 4), mes: hoje.slice(5, 7), vendedor: '' }, hoje)
    if (g.temProjetos && g.parados > 0) {
      const pct = (100 * g.parados) / Math.max(1, g.emMovimento)
      itens.push({ id: 'projetos-parados', gravidade: pct >= 50 ? 2 : 3, peso: pct, numero: inteiro(g.parados), frase: `de ${inteiro(g.emMovimento)} projetos entre os funis 04 e 11 sem atualização há mais de ${DIAS_PARADO} dias (${pctTxt(pct)}).` })
    }
    const atrasadas = (f.tarefas ?? []).filter((t) => t.atrasada).length
    if (atrasadas) {
      itens.push({ id: 'tarefas', gravidade: 3, peso: (100 * atrasadas) / Math.max(1, f.tarefas!.length), numero: inteiro(atrasadas), frase: `${atrasadas === 1 ? 'tarefa' : 'tarefas'} do Groner com a data de entrega vencida.` })
    }
  }
  if (area === 'usinas') {
    const us = calcularUsinas(f, hoje)
    if (us && us.criticas > 0) {
      itens.push({ id: 'usinas-criticas', gravidade: 2, peso: (100 * us.criticas) / Math.max(1, us.total - us.semDado), numero: inteiro(us.criticas), frase: `${us.criticas === 1 ? 'usina gerou' : 'usinas geraram'} até 50% do prognóstico na média dos últimos 3 meses (Crítico).` })
    }
    if (us && us.farolCritico + us.farolAlerta > 0) {
      const n = us.farolCritico + us.farolAlerta
      itens.push({ id: 'usinas-farol', gravidade: us.farolCritico ? 2 : 3, peso: (100 * n) / Math.max(1, us.monitoradas), numero: inteiro(n), frase: `${n === 1 ? 'usina com alerta' : 'usinas com alerta'} no farol da SolarZ hoje${us.farolCritico ? ` (${inteiro(us.farolCritico)} no farol Crítico)` : ''}.` })
    }
  }
  if (area === 'homologacao') {
    const ho = calcularHomologacao(f, hoje)
    if (ho && ho.vencidos.length) {
      itens.push({ id: 'homologacao-vencidos', gravidade: 2, peso: (100 * ho.vencidos.length) / Math.max(1, ho.ativos.length), numero: inteiro(ho.vencidos.length), frase: `${ho.vencidos.length === 1 ? 'homologação está' : 'homologações estão'} com o prazo informado pela PIETA vencido.` })
    }
    if (ho && ho.pendencia.length) {
      itens.push({ id: 'homologacao-pendencia', gravidade: 3, peso: (100 * ho.pendencia.length) / Math.max(1, ho.ativos.length), numero: inteiro(ho.pendencia.length), frase: `${ho.pendencia.length === 1 ? 'homologação parada' : 'homologações paradas'} em pendência (${[...new Set(ho.pendencia.map((p) => tipoPendencia(p.status)))].join(', ')}).` })
    }
  }
  return ordenar(itens)
}
