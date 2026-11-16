/**
 * Horários da atualização automática da base (workflow sync-base), em horário de Brasília (UTC-3, sem horário de
 * verão): 06:00, 09:00, 12:00, 15:00 e 19:00. Se mudar o cron do sync-base, mude aqui também.
 */
export const HORAS_ATUALIZACAO = [6, 9, 12, 15, 19]

const BRT_MS = 3 * 3600_000
const DIA_MS = 24 * 3600_000

/** Próxima atualização depois de `agora` (ms) e o início da anterior (para mostrar "Atualizando…"). */
export function proximaAtualizacao(agora: number): { proxima: number; anterior: number } {
  // Meia-noite de Brasília do dia de `agora`, em ms UTC.
  const meiaNoite = Math.floor((agora - BRT_MS) / DIA_MS) * DIA_MS + BRT_MS
  const horarios: number[] = []
  for (const d of [-1, 0, 1]) for (const h of HORAS_ATUALIZACAO) horarios.push(meiaNoite + d * DIA_MS + h * 3600_000)
  const proxima = horarios.find((t) => t > agora) as number
  const anterior = [...horarios].reverse().find((t) => t <= agora) as number
  return { proxima, anterior }
}

export function formatarContagem(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`
}

export function horaBrasilia(t: number): string {
  return new Date(t - BRT_MS).toISOString().slice(11, 16)
}
