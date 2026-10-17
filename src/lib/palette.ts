/** Sequência categórica da ICF (validada; ver --cat-* em styles.css). */
export const PALETTE = ['#01C38E', '#2E8FD6', '#D99A1E', '#E0605F', '#8077D0', '#D2569A']

export function colorFor(index: number) {
  return PALETTE[index % PALETTE.length]
}

export const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
export const currencyPrecise = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export const number = new Intl.NumberFormat('pt-BR')
export const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
