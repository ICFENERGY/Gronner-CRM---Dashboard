import { useEffect, useRef, useState } from 'react'
import { formatarContagem, horaBrasilia, proximaAtualizacao } from '../lib/proximaAtualizacao'

/** A atualização da base leva cerca de 1 minuto depois do horário; a tela recarrega sozinha neste tempo. */
const RECARREGA_APOS_MS = 150_000

function digitando(): boolean {
  const ativo = (d: Document | null | undefined) => {
    const el = d?.activeElement as HTMLElement | null | undefined
    return !!el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable)
  }
  if (ativo(document)) return true
  // As telas de Indicadores ficam em iframe do mesmo endereço: dá para ver se tem alguém escrevendo lá dentro.
  return Array.from(document.querySelectorAll('iframe')).some((f) => {
    try { return ativo(f.contentDocument) } catch { return false }
  })
}

/**
 * Cronômetro da faixa: quanto falta para a próxima atualização automática da base. Quando o horário passa, a página
 * recarrega sozinha para trazer os dados novos (espera se alguém estiver preenchendo um campo).
 */
export function ProximaAtualizacao() {
  const [agora, setAgora] = useState(() => Date.now())
  const abertaEm = useRef(Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setAgora(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  const { proxima, anterior } = proximaAtualizacao(agora)
  const aguardando = agora - anterior < RECARREGA_APOS_MS

  // Página aberta antes do horário (dados antigos) e já passou o tempo da atualização: recarrega uma vez.
  useEffect(() => {
    if (abertaEm.current < anterior + RECARREGA_APOS_MS - 5_000 && agora >= anterior + RECARREGA_APOS_MS && agora < anterior + 30 * 60_000 && !digitando()) {
      window.location.reload()
    }
  }, [agora, anterior])

  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-secondary)]"
      title={`A base é atualizada automaticamente às 06:00, 09:00, 12:00, 15:00 e 19:00 (Brasília) e a tela recarrega sozinha. Última: ${horaBrasilia(anterior)}. Próxima: ${horaBrasilia(proxima)}.`}
    >
      <span aria-hidden="true">⏱</span>
      {aguardando ? (
        <span className="font-semibold text-[var(--text-primary)]" role="status">Atualizando a base…</span>
      ) : (
        <span>
          <span className="hidden sm:inline">Atualizado às <b className="text-[var(--text-primary)]">{horaBrasilia(anterior)}</b> · próxima às {horaBrasilia(proxima)} em </span>
          <span className="sm:hidden">✓ {horaBrasilia(anterior)} · próx. {horaBrasilia(proxima)} · </span>
          <b className="tabular-nums text-[var(--text-primary)]">{formatarContagem(proxima - agora)}</b>
        </span>
      )}
    </div>
  )
}
