import { useEffect, useState } from 'react'
import { horaSP } from '../features/engenharia/formato'
import { PainelEngenharia } from '../features/engenharia/painel/PainelEngenharia'
import { PautaDiaria } from '../features/engenharia/pauta/PautaDiaria'
import { useEngenharia, useIdentidade } from '../features/engenharia/useEngenharia'

type Aba = 'pauta' | 'painel'
const ABAS: { k: Aba; rotulo: string }[] = [
  { k: 'pauta', rotulo: 'Pauta diária' },
  { k: 'painel', rotulo: 'Painel da Engenharia' },
]
const ATRASO_MS = 15 * 60 * 1000

/** Engenharia: Pauta Diária (reunião) e Painel (indicadores), lidos do Groner sincronizado. */
export function EngenhariaPage({ base = 'engenharia' }: { base?: 'engenharia' | 'reuniao' }) {
  // Aba no endereço (#engenharia/painel ou #reuniao/painel), para abrir direto por link.
  const [aba, setAbaState] = useState<Aba>(() => (/^#(reuniao|engenharia)\/painel$/.test(window.location.hash) ? 'painel' : 'pauta'))
  const setAba = (a: Aba) => {
    setAbaState(a)
    window.history.replaceState(null, '', a === 'painel' ? `#${base}/painel` : `#${base}`)
  }
  const [aviso, setAviso] = useState<string | null>(null)
  const { dados, erro, carregando, recarregar } = useEngenharia()
  const identidade = useIdentidade()

  useEffect(() => {
    if (!aviso) return
    const t = window.setTimeout(() => setAviso(null), 3500)
    return () => window.clearTimeout(t)
  }, [aviso])

  const atualizado = (msg: string) => { setAviso(msg); recarregar() }
  const fonteEm = dados?.fonte?.sourceUpdatedAt ?? dados?.fonte?.lastSuccessfulRunAt ?? null
  const atrasada = fonteEm ? Date.now() - Date.parse(fonteEm) > ATRASO_MS : false

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <span className="text-xs uppercase tracking-wide text-[var(--text-muted)]">ICF Energy · Engenharia</span>
          <h2 className="text-xl font-semibold">{aba === 'pauta' ? 'Pauta Diária da Engenharia' : 'Painel da Engenharia'}</h2>
          {dados && (
            <p className="text-xs text-[var(--text-secondary)]">
              {fonteEm
                ? <span className={atrasada ? 'font-semibold text-amber-700 dark:text-amber-300' : ''}>{atrasada ? 'Sincronização atrasada — última às ' : 'Groner sincronizado às '}{horaSP(fonteEm)}</span>
                : 'Lido direto do Groner (sincronização ainda não ativa)'}
              {' · '}calculado às {horaSP(dados.geradoEm)}
            </p>
          )}
        </div>
        <nav aria-label="Abas da Engenharia" className="flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1">
          {ABAS.map((a) => (
            <button key={a.k} type="button" aria-pressed={aba === a.k} onClick={() => setAba(a.k)} className={`rounded-md px-3 py-1.5 text-sm font-medium ${aba === a.k ? 'bg-icf-green text-icf-navy' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'}`}>
              {a.rotulo}
            </button>
          ))}
        </nav>
      </div>

      {carregando && !dados && <p className="py-16 text-center text-sm text-[var(--text-muted)]">Carregando a Engenharia…</p>}
      {erro && dados && (
        <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
          A última atualização falhou ({erro}). Os dados abaixo são de {horaSP(dados.geradoEm)}; nova tentativa em 1 minuto.
        </p>
      )}
      {erro && !dados && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300">Não foi possível carregar: {erro}</p>}

      {dados && (aba === 'pauta'
        ? <PautaDiaria dados={dados} identidade={identidade} onAtualizar={atualizado} />
        : <PainelEngenharia dados={dados} />)}

      {aviso && (
        <div role="status" className="fixed bottom-5 left-1/2 z-20 max-w-[calc(100vw-32px)] -translate-x-1/2 rounded-lg bg-[var(--text-primary)] px-4 py-2.5 text-sm text-[var(--bg)] shadow-lg">
          {aviso}
        </div>
      )}
    </div>
  )
}
