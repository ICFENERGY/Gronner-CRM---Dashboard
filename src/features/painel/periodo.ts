/** Períodos do filtro único do painel. Datas em AAAA-MM-DD no fuso de São Paulo. */

export type PeriodoKey = '30d' | 'mes' | '3m' | '12m' | 'ano' | 'tudo'

export const PERIODOS: { k: PeriodoKey; rotulo: string }[] = [
  { k: '30d', rotulo: 'Últimos 30 dias' },
  { k: 'mes', rotulo: 'Este mês' },
  { k: '3m', rotulo: 'Últimos 3 meses' },
  { k: '12m', rotulo: 'Últimos 12 meses' },
  { k: 'ano', rotulo: 'Este ano' },
  { k: 'tudo', rotulo: 'Todo o histórico' },
]

export interface Intervalo {
  inicio: string | null
  fim: string
  /** Mesmo tamanho, imediatamente antes — base da variação dos KPIs. */
  anterior: { inicio: string; fim: string } | null
  /** Agrupar a série temporal por dia (períodos curtos) ou por mês. */
  porDia: boolean
}

export const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

const somaDias = (iso: string, dias: number) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}
const somaMeses = (iso: string, meses: number) => {
  const d = new Date(`${iso.slice(0, 7)}-01T12:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + meses)
  return d.toISOString().slice(0, 10)
}
const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)

export function intervalo(k: PeriodoKey, hoje = hojeSP()): Intervalo {
  let inicio: string | null
  if (k === '30d') inicio = somaDias(hoje, -29)
  else if (k === 'mes') inicio = `${hoje.slice(0, 7)}-01`
  else if (k === '3m') inicio = somaMeses(hoje, -2)
  else if (k === '12m') inicio = somaMeses(hoje, -11)
  else if (k === 'ano') inicio = `${hoje.slice(0, 4)}-01-01`
  else inicio = null
  if (!inicio) return { inicio: null, fim: hoje, anterior: null, porDia: false }
  const tamanho = diasEntre(inicio, hoje) + 1
  const fimAnterior = somaDias(inicio, -1)
  return { inicio, fim: hoje, anterior: { inicio: somaDias(fimAnterior, -(tamanho - 1)), fim: fimAnterior }, porDia: tamanho <= 45 }
}

/** Data (qualquer formato ISO do Groner) dentro do intervalo, comparando só o dia. */
export function dentro(data: string | null | undefined, ini: string | null, fim: string) {
  if (!data) return false
  const dia = data.slice(0, 10)
  return (!ini || dia >= ini) && dia <= fim
}

/** Chaves contínuas da série temporal do intervalo (dias ou meses), sem buracos. */
export function chavesDoIntervalo(iv: Intervalo, primeiraData: string | null): string[] {
  const inicio = iv.inicio ?? primeiraData ?? iv.fim
  const out: string[] = []
  if (iv.porDia) {
    for (let d = inicio; d <= iv.fim; d = somaDias(d, 1)) out.push(d)
  } else {
    for (let m = `${inicio.slice(0, 7)}-01`; m.slice(0, 7) <= iv.fim.slice(0, 7); m = somaMeses(m, 1)) out.push(m.slice(0, 7))
  }
  return out
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
export const rotuloChave = (k: string) => (k.length === 7 ? `${MESES[Number(k.slice(5, 7)) - 1]}/${k.slice(2, 4)}` : `${k.slice(8, 10)}/${k.slice(5, 7)}`)
