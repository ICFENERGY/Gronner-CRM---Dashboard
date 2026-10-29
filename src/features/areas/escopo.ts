import type { Intervalo } from '../painel/periodo'
import { ddmm, nomeMes, type Filtros } from './calculos'

/** Frase do escopo dos filtros: "Período: outubro/2026 até 29/10 · todos os vendedores." */
export function textoEscopo(filtros: Filtros, iv: Intervalo, hoje: string): string {
  const periodo = filtros.mes ? `${nomeMes(`${filtros.ano}-${filtros.mes}`)}/${filtros.ano}` : filtros.ano
  const emCurso = iv.fim === hoje && (iv.inicio ?? '') <= hoje
  return `Período: ${periodo}${emCurso ? ` até ${ddmm(hoje)}` : ''} · ${filtros.vendedor ? `vendedor ${filtros.vendedor}` : 'todos os vendedores'}.`
}
