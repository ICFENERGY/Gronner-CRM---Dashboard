import type { Cor } from './tipos'

/** "2026-10-05..." → "05/10". */
export const dm = (s?: string | null) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '—')
/** "2026-10-05..." → "05/10/2026". */
export const dma = (s?: string | null) => (s ? `${dm(s)}/${s.slice(0, 4)}` : '—')
export const num = (n?: number | null, casas = 0) =>
  n == null ? '—' : n.toLocaleString('pt-BR', { maximumFractionDigits: casas })
export const horaSP = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '—'

export const ROTULO_COR: Record<Cor, string> = { atrasado: 'Atrasado', risco: 'Em risco', ok: 'No prazo' }

/** Cores do semáforo (claro/escuro) usadas em toda a Engenharia. */
export const ESTILO_COR: Record<Cor, { pill: string; barra: string; texto: string }> = {
  atrasado: { pill: 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300', barra: 'bg-red-500', texto: 'text-red-700 dark:text-red-300' },
  risco: { pill: 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300', barra: 'bg-amber-400', texto: 'text-amber-800 dark:text-amber-300' },
  ok: { pill: 'bg-green-50 text-green-700 dark:bg-green-950/60 dark:text-green-300', barra: 'bg-green-500', texto: 'text-green-700 dark:text-green-300' },
}

/** Pior cor de um grupo, para o veredito de um momento ou marco. */
export function corDoGrupo(atrasados: number, risco: number): Cor {
  return atrasados ? 'atrasado' : risco ? 'risco' : 'ok'
}
