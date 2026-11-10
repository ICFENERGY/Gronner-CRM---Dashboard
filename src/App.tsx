import { useCallback, useEffect, useState } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Layout, type AbaItem } from './components/Layout'
import { IndicadoresFrame } from './components/IndicadoresFrame'
import { useTheme } from './hooks/useTheme'
import { MonitoramentoSolarPage } from './pages/MonitoramentoSolarPage'

export type Aba = 'geral' | 'vendas' | 'usinas' | 'engenharia' | 'pieta'
const ABAS: AbaItem[] = [
  { k: 'geral', rotulo: 'Visão Geral' },
  { k: 'vendas', rotulo: 'Vendas' },
  { k: 'usinas', rotulo: 'Usinas' },
  { k: 'engenharia', rotulo: 'Engenharia' },
  { k: 'pieta', rotulo: 'Pieta' },
]

/** Endereços antigos continuam abrindo a aba certa (links salvos). */
const APELIDOS: Record<string, Aba> = { monitoramento: 'usinas', solarz: 'usinas', homologacao: 'pieta', comercial: 'vendas' }

/** Endereço → aba: #vendas, #usinas, #engenharia, #pieta; vazio ou desconhecido é a Visão Geral. */
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
        {aba === 'geral' && <IndicadoresFrame grupo="geral" theme={theme} />}
        {aba === 'vendas' && <IndicadoresFrame grupo="vendas" theme={theme} />}
        {aba === 'usinas' && <MonitoramentoSolarPage />}
        {aba === 'engenharia' && <IndicadoresFrame grupo="engenharia" theme={theme} />}
        {aba === 'pieta' && <IndicadoresFrame grupo="pieta" theme={theme} />}
      </ErrorBoundary>
    </Layout>
  )
}
