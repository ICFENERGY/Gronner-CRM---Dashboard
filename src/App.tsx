import { useCallback, useEffect, useState } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Layout, type AbaItem } from './components/Layout'
import { PainelPage } from './features/painel/PainelPage'
import { useTheme } from './hooks/useTheme'
import { MonitoramentoSolarPage } from './pages/MonitoramentoSolarPage'
import { PietaPage } from './pages/PietaPage'
import { VendasPage } from './pages/VendasPage'

export type Aba = 'geral' | 'vendas' | 'solarz' | 'pieta'
const ABAS: AbaItem[] = [
  { k: 'geral', rotulo: 'Visão Geral' },
  { k: 'vendas', rotulo: 'Vendas' },
  { k: 'solarz', rotulo: 'SolarZ' },
  { k: 'pieta', rotulo: 'Pieta' },
]

/** Endereços antigos continuam abrindo a aba certa (links salvos). */
const APELIDOS: Record<string, Aba> = { monitoramento: 'solarz', usinas: 'solarz', homologacao: 'pieta', comercial: 'vendas' }

/** Endereço → aba: #vendas, #solarz, #pieta; vazio ou desconhecido é a Visão Geral. */
function lerEndereco(): Aba {
  const h = window.location.hash.replace('#', '').split('/')[0]
  return (ABAS.find((x) => x.k === h)?.k as Aba | undefined) ?? APELIDOS[h] ?? 'geral'
}

export default function App() {
  const [aba, setAba] = useState<Aba>(lerEndereco)
  const { theme, toggleTheme } = useTheme()

  const irParaAba = useCallback((k: string) => {
    setAba(k as Aba)
    window.history.replaceState(null, '', k === 'geral' ? window.location.pathname : `#${k}`)
    window.scrollTo(0, 0)
  }, [])

  // Botão voltar/avançar e links colados com outro #endereço.
  useEffect(() => {
    const mudou = () => setAba(lerEndereco())
    window.addEventListener('hashchange', mudou)
    return () => window.removeEventListener('hashchange', mudou)
  }, [])

  return (
    <Layout abas={ABAS} aba={aba} onAba={irParaAba} theme={theme} onToggleTheme={toggleTheme}>
      {/* Um erro de renderização numa aba mostra um aviso, nunca a tela em branco. */}
      <ErrorBoundary key={aba}>
        {aba === 'geral' && <PainelPage />}
        {aba === 'vendas' && <VendasPage />}
        {aba === 'solarz' && <MonitoramentoSolarPage />}
        {aba === 'pieta' && <PietaPage />}
      </ErrorBoundary>
    </Layout>
  )
}
