import type { ProjetoRaw } from '../../api/types'
import { valorDoCard } from '../painel/funis'

/** Prazo (SLA) de cada card no fluxo, em dias: passou disso desde a abertura, está atrasado. */
export const SLA_DIAS = 5

export const GRUPOS = ['Vendas', 'Financeiro', 'Engenharia', 'Outros'] as const
export type Grupo = (typeof GRUPOS)[number]

export const MESES_NOME = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export interface CardInd {
  id: number
  nome: string
  funil: string
  etapa: string
  grupo: Grupo
  uf: string
  cidade: string
  valor: number
  /** Dias desde a abertura do card (com casas decimais). */
  dias: number
  /** Dias além do prazo (0 quando dentro do SLA). */
  atraso: number
  atrasado: boolean
  ano: string
  /** 'AAAA-MM' */
  mes: string
  aberturaMs: number
  atualizadoEm: string | null
}

const DIA_MS = 86_400_000

/** Número do funil no começo do nome ("07. FINANCEIRO" → 7); sem número, null. */
export function numeroDoFunil(nome: string): number | null {
  const n = parseInt(nome, 10)
  return Number.isFinite(n) ? n : null
}

/** Grupo do funil: 01–04 Vendas · 05, 06, 07, 09 Financeiro · 08, 10, 11, 13, 14, 15 Engenharia · resto Outros. */
export function grupoDoFunil(funil: string): Grupo {
  const n = numeroDoFunil(funil)
  if (n == null) return 'Outros'
  if (n >= 1 && n <= 4) return 'Vendas'
  if ([5, 6, 7, 9].includes(n)) return 'Financeiro'
  if ([8, 10, 11, 13, 14, 15].includes(n)) return 'Engenharia'
  return 'Outros'
}

/** Transforma o projeto do Groner em card do indicador. `agora` é injetável para teste. */
export function criarCard(p: ProjetoRaw, agora = Date.now()): CardInd | null {
  const abertura = Date.parse(p.dataInclusao)
  if (!Number.isFinite(abertura)) return null
  const funil = (p.funil ?? '').trim() || 'Sem funil'
  const dias = Math.max(0, Math.round(((agora - abertura) / DIA_MS) * 10) / 10)
  const atraso = Math.max(0, Math.round((dias - SLA_DIAS) * 10) / 10)
  const d = new Date(abertura)
  return {
    id: p.id,
    nome: (p.nome ?? '').trim() || `Card ${p.id}`,
    funil,
    etapa: (p.etapa ?? '').trim() || 'Sem etapa',
    grupo: grupoDoFunil(funil),
    uf: (p.estado ?? '').trim().toUpperCase() || '—',
    cidade: (p.cidade ?? '').trim() || '—',
    valor: valorDoCard(p),
    dias,
    atraso,
    atrasado: dias > SLA_DIAS,
    ano: String(d.getFullYear()),
    mes: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    aberturaMs: abertura,
    atualizadoEm: p.dataUltimaAtualizacao ?? null,
  }
}

export interface Filtros {
  cliente: string
  codigo: string
  funil: string
  etapa: string
  uf: string
  ano: string
  mes: string
  sla: '' | 'atendido' | 'atrasado'
}

export const FILTROS_VAZIOS: Filtros = { cliente: '', codigo: '', funil: '', etapa: '', uf: '', ano: '', mes: '', sla: '' }

export const filtrosAtivos = (f: Filtros) => Object.values(f).filter(Boolean).length

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function filtrarCards(cards: CardInd[], f: Filtros): CardInd[] {
  const cliente = semAcento(f.cliente.trim())
  const codigo = f.codigo.trim().replace(/^#/, '')
  return cards.filter((c) => {
    if (cliente && !semAcento(c.nome).includes(cliente)) return false
    if (codigo && !String(c.id).startsWith(codigo)) return false
    if (f.funil && c.funil !== f.funil) return false
    if (f.etapa && c.etapa !== f.etapa) return false
    if (f.uf && c.uf !== f.uf) return false
    if (f.ano && c.ano !== f.ano) return false
    if (f.mes && c.mes.slice(5) !== f.mes) return false
    if (f.sla === 'atendido' && c.atrasado) return false
    if (f.sla === 'atrasado' && !c.atrasado) return false
    return true
  })
}

export interface Kpis { total: number; atendidos: number; atrasados: number; diasMedio: number; valor: number }

export function calcularKpis(cards: CardInd[]): Kpis {
  const atrasados = cards.filter((c) => c.atrasado).length
  const soma = cards.reduce((a, c) => a + c.dias, 0)
  return {
    total: cards.length,
    atendidos: cards.length - atrasados,
    atrasados,
    diasMedio: cards.length ? Math.round((soma / cards.length) * 10) / 10 : 0,
    valor: cards.reduce((a, c) => a + c.valor, 0),
  }
}

export interface Contagem { nome: string; total: number; atendidos: number; atrasados: number }

/** Conta cards por chave (maior primeiro), separando atendidos e atrasados. */
export function contarPor(cards: CardInd[], chave: (c: CardInd) => string): Contagem[] {
  const m = new Map<string, Contagem>()
  for (const c of cards) {
    const nome = chave(c)
    const g = m.get(nome) ?? { nome, total: 0, atendidos: 0, atrasados: 0 }
    g.total += 1
    if (c.atrasado) g.atrasados += 1
    else g.atendidos += 1
    m.set(nome, g)
  }
  return [...m.values()].sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR'))
}

/** 'AAAA-MM' → 'AA-MM' (rótulo curto dos gráficos mensais). */
export const mesCurto = (mes: string) => mes.slice(2)

export interface MesSla { mes: string; atendidos: number; atrasados: number }

export function slaPorMes(cards: CardInd[]): MesSla[] {
  const m = new Map<string, MesSla>()
  for (const c of cards) {
    const g = m.get(c.mes) ?? { mes: c.mes, atendidos: 0, atrasados: 0 }
    if (c.atrasado) g.atrasados += 1
    else g.atendidos += 1
    m.set(c.mes, g)
  }
  return [...m.values()].sort((a, b) => a.mes.localeCompare(b.mes))
}

export interface MesGrupo { mes: string; porGrupo: Record<Grupo, number>; total: number }

export function gruposPorMes(cards: CardInd[]): MesGrupo[] {
  const m = new Map<string, MesGrupo>()
  for (const c of cards) {
    const g = m.get(c.mes) ?? { mes: c.mes, porGrupo: { Vendas: 0, Financeiro: 0, Engenharia: 0, Outros: 0 }, total: 0 }
    g.porGrupo[c.grupo] += 1
    g.total += 1
    m.set(c.mes, g)
  }
  return [...m.values()].sort((a, b) => a.mes.localeCompare(b.mes))
}

const ROTULO_MES = (ano: number, mes0: number) => `${MESES_NOME[mes0].toLowerCase()}/${String(ano).slice(2)}`

/** 6 meses fechados + últimas 3 semanas, por data de abertura (sem sobreposição entre os dois). */
export function evolucaoAbertos(cards: CardInd[], agora = Date.now()): { rotulo: string; valor: number }[] {
  const inicioJanela = agora - 21 * DIA_MS
  const ref = new Date(inicioJanela)
  const saida: { rotulo: string; valor: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const ini = new Date(ref.getFullYear(), ref.getMonth() - i, 1).getTime()
    const fim = new Date(ref.getFullYear(), ref.getMonth() - i + 1, 1).getTime()
    const d = new Date(ini)
    saida.push({ rotulo: ROTULO_MES(d.getFullYear(), d.getMonth()), valor: cards.filter((c) => c.aberturaMs >= ini && c.aberturaMs < Math.min(fim, inicioJanela)).length })
  }
  const nomes = ['3 sem. atrás', '2 sem. atrás', 'Esta semana']
  nomes.forEach((rotulo, i) => {
    const ini = inicioJanela + i * 7 * DIA_MS
    const fim = i === 2 ? agora + 1 : ini + 7 * DIA_MS
    saida.push({ rotulo, valor: cards.filter((c) => c.aberturaMs >= ini && c.aberturaMs < fim).length })
  })
  return saida
}

export interface LinhaEtapa { etapa: string; funil: string; total: number; atrasados: number; pctAtraso: number; diasMedio: number; valor: number }

/** Visão executiva: uma linha por combinação funil + etapa. */
export function visaoPorEtapa(cards: CardInd[]): LinhaEtapa[] {
  const m = new Map<string, { etapa: string; funil: string; total: number; atrasados: number; dias: number; valor: number }>()
  for (const c of cards) {
    const k = `${c.funil}\u0000${c.etapa}`
    const g = m.get(k) ?? { etapa: c.etapa, funil: c.funil, total: 0, atrasados: 0, dias: 0, valor: 0 }
    g.total += 1
    g.dias += c.dias
    g.valor += c.valor
    if (c.atrasado) g.atrasados += 1
    m.set(k, g)
  }
  return [...m.values()]
    .map((g) => ({
      etapa: g.etapa,
      funil: g.funil,
      total: g.total,
      atrasados: g.atrasados,
      pctAtraso: Math.round((100 * g.atrasados) / g.total),
      diasMedio: Math.round((g.dias / g.total) * 10) / 10,
      valor: g.valor,
    }))
    .sort((a, b) => b.total - a.total || a.etapa.localeCompare(b.etapa, 'pt-BR'))
}

/** Funis de um grupo com a quantidade de cards, do maior para o menor. */
export function funisDoGrupo(cards: CardInd[], grupo: Grupo): Contagem[] {
  return contarPor(cards.filter((c) => c.grupo === grupo), (c) => c.funil)
}

/** Etapas com a quantidade de cards, e os cards de cada uma do mais atrasado para o menos. */
export function cardsPorEtapa(cards: CardInd[]): { etapa: string; cards: CardInd[] }[] {
  const m = new Map<string, CardInd[]>()
  for (const c of cards) (m.get(c.etapa) ?? m.set(c.etapa, []).get(c.etapa)!).push(c)
  return [...m.entries()]
    .map(([etapa, lista]) => ({ etapa, cards: lista.sort((a, b) => b.atraso - a.atraso || a.id - b.id) }))
    .sort((a, b) => b.cards.length - a.cards.length || a.etapa.localeCompare(b.etapa, 'pt-BR'))
}
