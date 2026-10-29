import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api/client'
import { useRawData } from './api/useRawData'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Layout, type AbaItem } from './components/Layout'
import { VisaoGeralPage } from './features/visao/VisaoGeralPage'
import { useTheme } from './hooks/useTheme'
import { EngenhariaPage } from './pages/EngenhariaPage'
import { IndicadorTarefasPage } from './pages/IndicadorTarefasPage'
import { MonitoramentoSolarPage } from './pages/MonitoramentoSolarPage'
import { PietaPage } from './pages/PietaPage'
import { ValidacaoCadastroPage } from './pages/ValidacaoCadastroPage'
import { VendasPage } from './pages/VendasPage'

export type Aba = 'geral' | 'engenharia' | 'vendas' | 'cadastro' | 'tarefas' | 'monitoramento' | 'pieta'
/** Visão geral primeiro; depois o detalhe de cada bloco; por fim as ferramentas de apoio (secundárias). */
const ABAS: { k: Aba; rotulo: string; secundaria?: boolean }[] = [
  { k: 'geral', rotulo: 'Visão geral' },
  { k: 'vendas', rotulo: 'Comercial' },
  { k: 'engenharia', rotulo: 'Engenharia' },
  { k: 'monitoramento', rotulo: 'Usinas' },
  { k: 'pieta', rotulo: 'Homologação' },
  { k: 'tarefas', rotulo: 'Tarefas', secundaria: true },
  { k: 'cadastro', rotulo: 'Cadastro', secundaria: true },
]

/**
 * Endereço → tela. Uma aba por área (#vendas, #engenharia, #engenharia/painel,
 * #cadastro, #tarefas, #monitoramento, #pieta); #reuniao e #reuniao/painel
 * abrem o modo reunião em tela cheia; vazio ou #geral é a visão geral.
 */
function lerEndereco(): { reuniao: boolean; aba: Aba | null } {
  const h = window.location.hash.replace('#', '').split('/')[0]
  // #reuniao não diz em que aba o usuário estava: aba null = manter a atual.
  if (h === 'reuniao') return { reuniao: true, aba: null }
  const a = ABAS.find((x) => x.k === h)
  return { reuniao: false, aba: a ? a.k : 'geral' }
}

export default function App() {
  const inicial = lerEndereco()
  const [reuniao, setReuniao] = useState(inicial.reuniao)
  const [aba, setAba] = useState<Aba>(inicial.aba ?? 'geral')
  // Hash da aba (ex.: 'engenharia/painel') no momento em que a reunião foi aberta.
  const hashAntesReuniao = useRef<string | null>(null)
  const { data: tarefas } = useRawData('tarefas', api.getTarefasRaw)
  const tarefasAtrasadas = tarefas?.filter((t) => t.atrasada).length ?? 0
  const { theme, toggleTheme } = useTheme()

  const endereco = (h: string) => window.history.replaceState(null, '', h ? `#${h}` : window.location.pathname)
  const abrirReuniao = useCallback(() => {
    const atual = window.location.hash.replace('#', '')
    if (atual.split('/')[0] !== 'reuniao') hashAntesReuniao.current = atual
    setReuniao(true)
    endereco('reuniao')
  }, [])
  const fecharReuniao = useCallback(() => {
    // Volta ao hash da aba de origem (preserva #engenharia/painel); sem ele, usa a aba atual.
    const guardado = hashAntesReuniao.current
    hashAntesReuniao.current = null
    const destino = guardado !== null && (guardado.split('/')[0] || 'geral') === aba ? guardado : aba === 'geral' ? '' : aba
    setReuniao(false)
    endereco(destino === 'geral' ? '' : destino)
  }, [aba])
  const irParaAba = useCallback((k: string) => { hashAntesReuniao.current = null; setAba(k as Aba); setReuniao(false); endereco(k === 'geral' ? '' : k) }, [])

  // Botão voltar/avançar e links colados com outro #endereço.
  useEffect(() => {
    const mudou = () => { const e = lerEndereco(); setReuniao(e.reuniao); if (e.aba) setAba(e.aba) }
    window.addEventListener('hashchange', mudou)
    return () => window.removeEventListener('hashchange', mudou)
  }, [])

  useEffect(() => {
    if (!reuniao) return
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) fecharReuniao() }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [reuniao, fecharReuniao])

  const abas: AbaItem[] = ABAS.map((a) => ({ ...a, badge: a.k === 'tarefas' ? tarefasAtrasadas : undefined }))

  return (
    <Layout
      abas={abas}
      aba={aba}
      onAba={irParaAba}
      onModoReuniao={abrirReuniao}
      theme={theme}
      onToggleTheme={toggleTheme}
    >
      {/* Um erro de renderização numa aba mostra um aviso, nunca a tela em branco. */}
      <ErrorBoundary key={aba}>
        {aba === 'geral' && <VisaoGeralPage onModoReuniao={abrirReuniao} onAba={irParaAba} />}
        {/* Com a reunião aberta, a Engenharia só monta dentro dela (evita duas buscas em paralelo). */}
        {aba === 'engenharia' && !reuniao && <EngenhariaPage base="engenharia" />}
        {aba === 'vendas' && <VendasPage />}
        {aba === 'cadastro' && <ValidacaoCadastroPage />}
        {aba === 'tarefas' && <IndicadorTarefasPage />}
        {aba === 'monitoramento' && <MonitoramentoSolarPage />}
        {aba === 'pieta' && <PietaPage />}
      </ErrorBoundary>



      {reuniao && (
        <div className="fixed inset-0 z-30 overflow-y-auto bg-[var(--bg)]" role="region" aria-label="Modo reunião">
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-solid)] px-6 py-2.5 md:px-10">
            <span className="text-sm font-semibold">Modo reunião · Engenharia</span>
            <button type="button" onClick={fecharReuniao} className="rounded-md border border-[var(--border-strong)] px-3 py-1 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]">
              Voltar ao painel (Esc)
            </button>
          </div>
          <div className="px-6 py-5 md:px-10">
            <ErrorBoundary>
              <EngenhariaPage base="reuniao" />
            </ErrorBoundary>
          </div>
        </div>
      )}
    </Layout>
  )
}
