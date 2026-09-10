export const PALETTE = [
  '#22C55E',
  '#3B82F6',
  '#F59E0B',
  '#EF4444',
  '#A855F7',
  '#14B8A6',
  '#EC4899',
  '#84CC16',
  '#6366F1',
  '#F97316',
  '#06B6D4',
  '#D946EF',
  '#EAB308',
  '#64748B',
]

export function colorFor(index: number) {
  return PALETTE[index % PALETTE.length]
}

export const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
export const currencyPrecise = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export const number = new Intl.NumberFormat('pt-BR')
export const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
