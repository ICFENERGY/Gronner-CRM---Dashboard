import { useEffect, useState } from 'react'
import { formatarContagem, horaBrasilia, proximaAtualizacao } from '../lib/proximaAtualizacao'

const ATUALIZANDO_MS = 3 * 60_000

/** Cronômetro da faixa: quanto falta para a próxima atualização automática da base. */
export function ProximaAtualizacao() {
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setAgora(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  const { proxima, anterior } = proximaAtualizacao(agora)
  const atualizando = agora - anterior < ATUALIZANDO_MS
  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-secondary)]"
      title={`A base é atualizada automaticamente às 06:00, 09:00, 12:00, 15:00 e 19:00 (Brasília). Próxima: ${horaBrasilia(proxima)}.`}
    >
      <span aria-hidden="true">⏱</span>
      {atualizando ? (
        <span className="font-semibold text-[var(--text-primary)]" role="status">Atualizando a base…</span>
      ) : (
        <span>
          <span className="hidden sm:inline">Próxima atualização às {horaBrasilia(proxima)} · em </span>
          <span className="sm:hidden">{horaBrasilia(proxima)} · </span>
          <b className="tabular-nums text-[var(--text-primary)]">{formatarContagem(proxima - agora)}</b>
        </span>
      )}
    </div>
  )
}
