import { useState } from 'react'
import { api } from './api/client'
import { useRawData } from './api/useRawData'
import { Layout, type PageKey } from './components/Layout'
import { useTheme } from './hooks/useTheme'
import { Dashboard } from './pages/Dashboard'
import { EngenhariaPage } from './pages/EngenhariaPage'
import { IndicadorTarefasPage } from './pages/IndicadorTarefasPage'
import { MonitoramentoSolarPage } from './pages/MonitoramentoSolarPage'
import { PietaPage } from './pages/PietaPage'
import { ValidacaoCadastroPage } from './pages/ValidacaoCadastroPage'
import { VendasPage } from './pages/VendasPage'

const PAGINAS: PageKey[] = ['geral', 'engenharia', 'vendas', 'cadastro', 'tarefas', 'monitoramento', 'pieta']

/** Página pelo endereço (#engenharia), para abrir direto por link — ex.: a Pauta na reunião. */
function paginaDoEndereco(): PageKey {
  const hash = window.location.hash.replace('#', '').split('/')[0] as PageKey
  return PAGINAS.includes(hash) ? hash : 'geral'
}

export default function App() {
  const [page, setPageState] = useState<PageKey>(paginaDoEndereco)
  const setPage = (p: PageKey) => {
    setPageState(p)
    window.history.replaceState(null, '', p === 'geral' ? window.location.pathname : `#${p}`)
  }
  const { data: tarefas } = useRawData('tarefas', api.getTarefasRaw)
  const tarefasAtrasadas = tarefas?.filter((t) => t.atrasada).length ?? 0
  const { theme, toggleTheme } = useTheme()

  return (
    <Layout page={page} onNavigate={setPage} alertCount={tarefasAtrasadas} theme={theme} onToggleTheme={toggleTheme}>
      {page === 'geral' && <Dashboard />}
      {page === 'engenharia' && <EngenhariaPage />}
      {page === 'vendas' && <VendasPage />}
      {page === 'cadastro' && <ValidacaoCadastroPage />}
      {page === 'tarefas' && <IndicadorTarefasPage />}
      {page === 'monitoramento' && <MonitoramentoSolarPage />}
      {page === 'pieta' && <PietaPage />}
    </Layout>
  )
}
