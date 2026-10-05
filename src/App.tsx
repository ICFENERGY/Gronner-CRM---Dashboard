import { useCallback, useEffect, useState } from 'react'
import { api } from './api/client'
import { useRawData } from './api/useRawData'
import { Layout } from './components/Layout'
import { AnaliseCompleta, ANALISES, PainelPage, type PaginaAnalise } from './features/painel/PainelPage'
import { useTheme } from './hooks/useTheme'
import { EngenhariaPage } from './pages/EngenhariaPage'

/**
 * Endereço → o que abrir por cima do painel:
 *   #reuniao, #reuniao/painel (e os antigos #engenharia...) → modo reunião
 *   #vendas, #cadastro, #tarefas, #monitoramento, #pieta, #geral → análise completa
 */
function lerEndereco(): { reuniao: boolean; analise: PaginaAnalise | null } {
  const h = window.location.hash.replace('#', '').split('/')[0]
  if (h === 'reuniao' || h === 'engenharia') return { reuniao: true, analise: null }
  const a = ANALISES.find((x) => x.k === h)
  return { reuniao: false, analise: a ? a.k : null }
}

export default function App() {
  const inicial = lerEndereco()
  const [reuniao, setReuniao] = useState(inicial.reuniao)
  const [analise, setAnalise] = useState<PaginaAnalise | null>(inicial.analise)
  const { data: tarefas } = useRawData('tarefas', api.getTarefasRaw)
  const tarefasAtrasadas = tarefas?.filter((t) => t.atrasada).length ?? 0
  const { theme, toggleTheme } = useTheme()

  const endereco = (h: string) => window.history.replaceState(null, '', h ? `#${h}` : window.location.pathname)
  const abrirReuniao = useCallback(() => { setReuniao(true); endereco('reuniao') }, [])
  const fecharReuniao = useCallback(() => { setReuniao(false); endereco('') }, [])
  const abrirAnalise = (k: string) => { setAnalise(k as PaginaAnalise); endereco(k) }
  const fecharAnalise = useCallback(() => { setAnalise(null); endereco('') }, [])

  useEffect(() => {
    if (!reuniao) return
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) fecharReuniao() }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [reuniao, fecharReuniao])

  return (
    <Layout
      analises={ANALISES}
      onAnalise={abrirAnalise}
      onModoReuniao={abrirReuniao}
      alertCount={tarefasAtrasadas}
      onAlerta={() => abrirAnalise('tarefas')}
      theme={theme}
      onToggleTheme={toggleTheme}
    >
      <PainelPage onModoReuniao={abrirReuniao} />

      {analise && <AnaliseCompleta pagina={analise} titulo={ANALISES.find((a) => a.k === analise)?.rotulo ?? ''} onFechar={fecharAnalise} />}

      {reuniao && (
        <div className="fixed inset-0 z-30 overflow-y-auto bg-[var(--bg)]" role="region" aria-label="Modo reunião">
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-solid)] px-6 py-2.5 md:px-10">
            <span className="text-sm font-semibold">Modo reunião · Engenharia</span>
            <button type="button" onClick={fecharReuniao} className="rounded-md border border-[var(--border-strong)] px-3 py-1 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]">
              Voltar ao painel (Esc)
            </button>
          </div>
          <div className="px-6 py-5 md:px-10">
            <EngenhariaPage />
          </div>
        </div>
      )}
    </Layout>
  )
}
