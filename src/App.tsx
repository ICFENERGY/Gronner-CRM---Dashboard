import { useState } from 'react'
import { api } from './api/client'
import { useRawData } from './api/useRawData'
import { Layout, type PageKey } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { IndicadorTarefasPage } from './pages/IndicadorTarefasPage'
import { ValidacaoCadastroPage } from './pages/ValidacaoCadastroPage'
import { VendasPage } from './pages/VendasPage'

export default function App() {
  const [page, setPage] = useState<PageKey>('geral')
  const { data: tarefas } = useRawData('tarefas', api.getTarefasRaw)
  const tarefasAtrasadas = tarefas?.filter((t) => t.atrasada).length ?? 0

  return (
    <Layout page={page} onNavigate={setPage} alertCount={tarefasAtrasadas}>
      {page === 'geral' && <Dashboard />}
      {page === 'vendas' && <VendasPage />}
      {page === 'cadastro' && <ValidacaoCadastroPage />}
      {page === 'tarefas' && <IndicadorTarefasPage />}
    </Layout>
  )
}
