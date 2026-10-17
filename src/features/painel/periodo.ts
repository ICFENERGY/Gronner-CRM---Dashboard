/**
 * Período do filtro do painel: Ano ('12m' = últimos 12 meses, 'tudo' = todos os
 * anos ou um ano como '2026') e Mês opcional ('01'..'12', só com ano específico).
 * Datas em AAAA-MM-DD no fuso de São Paulo.
 */

export type Ano = '12m' | 'tudo' | string

export const ANO_PADRAO: Ano = '12m'

export const NOMES_MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

export const anoEspecifico = (ano: string) => /^\d{4}$/.test(ano)
export const anoValido = (ano: unknown): ano is Ano => ano === '12m' || ano === 'tudo' || (typeof ano === 'string' && anoEspecifico(ano))
export const mesValido = (mes: unknown): mes is string => typeof mes === 'string' && /^(0[1-9]|1[0-2])$/.test(mes)

export interface Intervalo {
  inicio: string | null
  fim: string
  /** Mesmo tamanho (ou o mesmo trecho do ano/mês anterior), imediatamente antes — base da variação dos KPIs. */
  anterior: { inicio: string; fim: string } | null
  /** Agrupar a série temporal por dia (quando há um mês escolhido) ou por mês. */
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
const ultimoDiaDoMes = (primeiroDia: string) => somaDias(somaMeses(primeiroDia, 1), -1)
const menor = (a: string, b: string) => (a < b ? a : b)

/**
 * Intervalo do filtro Ano + Mês. O mês só vale com ano específico.
 * Ano ou mês em curso termina hoje; o período anterior tem então o mesmo número de
 * dias (mês → mês anterior; ano → mesmo trecho do ano anterior; 12 meses → 12 meses
 * anteriores; todos os anos → sem comparação).
 */
export function intervalo(ano: Ano, mes = '', hoje = hojeSP()): Intervalo {
  if (anoEspecifico(ano) && mesValido(mes)) {
    const inicio = `${ano}-${mes}-01`
    const fimMes = ultimoDiaDoMes(inicio)
    const fim = hoje >= inicio && hoje < fimMes ? hoje : fimMes
    const inicioAnt = somaMeses(inicio, -1)
    const fimAnt = menor(ultimoDiaDoMes(inicioAnt), somaDias(inicioAnt, diasEntre(inicio, fim)))
    return { inicio, fim, anterior: { inicio: inicioAnt, fim: fimAnt }, porDia: true }
  }
  if (anoEspecifico(ano)) {
    const inicio = `${ano}-01-01`
    const fimAno = `${ano}-12-31`
    const fim = hoje >= inicio && hoje < fimAno ? hoje : fimAno
    const inicioAnt = `${Number(ano) - 1}-01-01`
    const fimAnt = fim === fimAno ? `${Number(ano) - 1}-12-31` : menor(`${Number(ano) - 1}-12-31`, somaDias(inicioAnt, diasEntre(inicio, fim)))
    return { inicio, fim, anterior: { inicio: inicioAnt, fim: fimAnt }, porDia: false }
  }
  if (ano === '12m') {
    const inicio = somaMeses(hoje, -11)
    return { inicio, fim: hoje, anterior: { inicio: somaMeses(inicio, -12), fim: somaDias(inicio, -1) }, porDia: false }
  }
  return { inicio: null, fim: hoje, anterior: null, porDia: false }
}

/** Texto curto do período, em minúsculas onde cabe numa frase: "2026 · março", "últimos 12 meses". */
export function textoPeriodo(ano: Ano, mes = ''): string {
  if (anoEspecifico(ano)) return mesValido(mes) ? `${ano} · ${NOMES_MESES[Number(mes) - 1].toLowerCase()}` : ano
  return ano === 'tudo' ? 'todos os anos' : 'últimos 12 meses'
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
