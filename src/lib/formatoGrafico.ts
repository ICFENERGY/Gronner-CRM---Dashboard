/**
 * Formato curto (pt-BR) dos números que aparecem nos gráficos: rótulos nas
 * barras, nos pontos das linhas e nos eixos. Um só lugar para todo o painel,
 * para que "R$ 104 mil", "R$ 1,2 mi", "69,5 MWh", "81%" e "1.234" saiam
 * sempre iguais. Os valores exatos continuam na tabela e no tooltip.
 */

const fmt = (v: number, casas: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas })

/** Número curto: até 9.999 inteiro com milhar ("1.234"); depois "12,3 mil", "104 mil", "1,2 mi", "3,4 bi". */
export function numeroCurto(v: number): string {
  const a = Math.abs(v)
  if (a >= 1e9) return `${fmt(v / 1e9, 1)} bi`
  if (a >= 1e6) return `${fmt(v / 1e6, 1)} mi`
  if (a >= 1e4) return `${fmt(v / 1e3, a >= 1e5 ? 0 : 1)} mil`
  return fmt(v, a < 10 && !Number.isInteger(v) ? 1 : 0)
}

/** Quantidade (cards, vendas, usinas): inteiro com milhar até 99.999; acima, abreviado. */
export function quantidadeCurta(v: number): string {
  return Math.abs(v) >= 1e5 ? numeroCurto(v) : fmt(Math.round(v), 0)
}

/** Reais curtos: "R$ 850", "R$ 9,8 mil", "R$ 104 mil", "R$ 1,2 mi". */
export function reaisCurto(v: number): string {
  const a = Math.abs(v)
  if (a >= 1e9) return `R$ ${fmt(v / 1e9, 1)} bi`
  if (a >= 1e6) return `R$ ${fmt(v / 1e6, 1)} mi`
  if (a >= 1e3) return `R$ ${fmt(v / 1e3, a >= 1e4 ? 0 : 1)} mil`
  return `R$ ${fmt(Math.round(v), 0)}`
}

/** Energia a partir de kWh: "850 kWh", "69,5 MWh", "1,2 GWh". */
export function energiaCurta(kwh: number): string {
  const a = Math.abs(kwh)
  if (a >= 1e6) return `${fmt(kwh / 1e6, 1)} GWh`
  if (a >= 1e3) return `${fmt(kwh / 1e3, a >= 1e5 ? 0 : 1)} MWh`
  return kwh === 0 ? '0' : `${fmt(kwh, 0)} kWh`
}

/** Percentual (0 a 100): "81%", "8,5%". */
export function percentualCurto(v: number): string {
  if (v > 0 && v < 0.1) return '<0,1%'
  return `${fmt(v, Math.abs(v) >= 10 ? 0 : 1)}%`
}

/** Dias: "12 d", "3,5 d". */
export function diasCurto(v: number): string {
  return `${fmt(v, Math.abs(v) >= 10 ? 0 : 1)} d`
}

/**
 * Índices dos pontos de uma linha que recebem rótulo quando há muitos pontos:
 * o primeiro, o último, o máximo e o mínimo. Com até `limite` pontos, todos.
 */
export function pontosComRotulo(valores: (number | null | undefined)[], limite = 8): Set<number> {
  const idx = valores.map((v, i) => (v == null || !Number.isFinite(v) ? -1 : i)).filter((i) => i >= 0)
  if (idx.length <= limite) return new Set(idx)
  const v = (i: number) => valores[i] as number
  const max = idx.reduce((a, i) => (v(i) > v(a) ? i : a), idx[0])
  const min = idx.reduce((a, i) => (v(i) < v(a) ? i : a), idx[0])
  return new Set([idx[0], idx[idx.length - 1], max, min])
}

/** Largura aproximada (px) do maior rótulo, para reservar a margem à direita das barras horizontais. */
export function larguraRotulo(valores: number[], formatar: (v: number) => string, fonte = 11): number {
  const maior = valores.reduce((a, v) => Math.max(a, formatar(v).length), 0)
  return Math.ceil(maior * fonte * 0.6) + 10
}
