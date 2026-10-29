import { useCallback, useEffect, useState } from 'react'
import { api } from './api/client'
import { useRawData } from './api/useRawData'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Layout, type AbaItem } from './components/Layout'
import { AbaFinanceiro } from './features/areas/AbaFinanceiro'
import { AbaGeral } from './features/areas/AbaGeral'
import { AbaHomologacao } from './features/areas/AbaHomologacao'
import { AbaUsinas } from './features/areas/AbaUsinas'
import { AbaVendas } from './features/areas/AbaVendas'
import { AREAS } from './features/areas/calculos'
import { useTheme } from './hooks/useTheme'
import { IndicadorTarefasPage } from './pages/IndicadorTarefasPage'
import { ValidacaoCadastroPage } from './pages/ValidacaoCadastroPage'

export type Aba = 'geral' | 'vendas' | 'financeiro' | 'usinas' | 'homologacao' | 'tarefas' | 'cadastro'
/** Uma aba por área, com o nome fixo de `AREAS`; depois as ferramentas de apoio (secundárias). */
const ABAS: { k: Aba; rotulo: string; secundaria?: boolean }[] = [
  { k: 'geral', rotulo: AREAS.geral.nome },
  { k: 'vendas', rotulo: AREAS.vendas.nome },
  { k: 'financeiro', rotulo: AREAS.financeiro.nome },
  { k: 'usinas', rotulo: AREAS.usinas.nome },
  { k: 'homologacao', rotulo: AREAS.homologacao.nome },
  { k: 'tarefas', rotulo: 'Tarefas', secundaria: true },
  { k: 'cadastro', rotulo: 'Cadastro', secundaria: true },
]

/** Endereços antigos continuam abrindo a aba certa (links salvos). */
const APELIDOS: Record<string, Aba> = { comercial: 'vendas', monitoramento: 'usinas', pieta: 'homologacao' }

/** Endereço → aba: #vendas, #financeiro, #usinas, #homologacao, #tarefas, #cadastro; vazio ou desconhecido é a Visão Geral. */
function lerEndereco(): Aba {
  const h = window.location.hash.replace('#', '').split('/')[0]
  return ABAS.find((x) => x.k === h)?.k ?? APELIDOS[h] ?? 'geral'
}

export default function App() {
  const [aba, setAba] = useState<Aba>(lerEndereco)
  const { data: tarefas } = useRawData('tarefas', api.getTarefasRaw)
  const tarefasAtrasadas = tarefas?.filter((t) => t.atrasada).length ?? 0
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

  const abas: AbaItem[] = ABAS.map((a) => ({ ...a, badge: a.k === 'tarefas' ? tarefasAtrasadas : undefined }))

  return (
    <Layout abas={abas} aba={aba} onAba={irParaAba} theme={theme} onToggleTheme={toggleTheme}>
      {/* Um erro de renderização numa aba mostra um aviso, nunca a tela em branco. */}
      <ErrorBoundary key={aba}>
        <div className="mx-auto max-w-[1440px]">
          {aba === 'geral' && <AbaGeral />}
          {aba === 'vendas' && <AbaVendas />}
          {aba === 'financeiro' && <AbaFinanceiro />}
          {aba === 'usinas' && <AbaUsinas />}
          {aba === 'homologacao' && <AbaHomologacao />}
          {aba === 'tarefas' && <IndicadorTarefasPage />}
          {aba === 'cadastro' && <ValidacaoCadastroPage />}
        </div>
      </ErrorBoundary>
    </Layout>
  )
}
