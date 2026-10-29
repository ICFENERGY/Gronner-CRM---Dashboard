import type { ProjetoRaw } from '../../api/types'

/** Um item de gráfico de barras ou de pizza. */
export interface Barra { nome: string; valor: number; extra?: number }

/**
 * Nome em texto. Os dados vêm do armazenamento sincronizado e já chegaram com o
 * vendedor como objeto do usuário ({ nome, … }) em vez de texto: aceita os dois
 * e ignora o resto, para um registro estranho não derrubar o painel.
 */
export const textoDe = (v: unknown): string => (typeof v === 'string' ? v : v && typeof v === 'object' && typeof (v as { nome?: unknown }).nome === 'string' ? (v as { nome: string }).nome : '')
/** Filtro vazio aceita tudo; senão compara o nome sem caixa nem espaços nas pontas. */
export const igual = (a: unknown, b: string) => !b || textoDe(a).trim().toLowerCase() === b.trim().toLowerCase()

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
