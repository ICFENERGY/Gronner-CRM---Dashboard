import { useCallback, useEffect, useState } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Layout, type AbaItem } from './components/Layout'
import { AbaGeral } from './features/areas/AbaGeral'
import { AbaHomologacao } from './features/areas/AbaHomologacao'
import { AbaUsinas } from './features/areas/AbaUsinas'
import { AbaVendas } from './features/areas/AbaVendas'
import { AREAS } from './features/areas/calculos'
import { useTheme } from './hooks/useTheme'

export type Aba = 'geral' | 'vendas' | 'solarz' | 'pieta'
/** Visão Geral | Vendas | SolarZ | Pieta, com o nome fixo de `AREAS`. */
const ABAS: { k: Aba; rotulo: string }[] = [
  { k: 'geral', rotulo: AREAS.geral.nome },
  { k: 'vendas', rotulo: AREAS.vendas.nome },
  { k: 'solarz', rotulo: AREAS.usinas.nome },
  { k: 'pieta', rotulo: AREAS.homologacao.nome },
]

/** Endereços antigos continuam abrindo a aba certa (links salvos). */
const APELIDOS: Record<string, Aba> = { comercial: 'vendas', monitoramento: 'solarz', usinas: 'solarz', homologacao: 'pieta', financeiro: 'geral' }

/** Endereço → aba: #vendas, #solarz, #pieta; vazio ou desconhecido é a Visão Geral. */
function lerEndereco(): Aba {
  const h = window.location.hash.replace('#', '').split('/')[0]
  return ABAS.find((x) => x.k === h)?.k ?? APELIDOS[h] ?? 'geral'
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

  const abas: AbaItem[] = ABAS

  return (
    <Layout abas={abas} aba={aba} onAba={irParaAba} theme={theme} onToggleTheme={toggleTheme}>
      {/* Um erro de renderização numa aba mostra um aviso, nunca a tela em branco. */}
      <ErrorBoundary key={aba}>
        <div className="mx-auto max-w-[1440px]">
          {aba === 'geral' && <AbaGeral />}
          {aba === 'vendas' && <AbaVendas />}
          {aba === 'solarz' && <AbaUsinas />}
          {aba === 'pieta' && <AbaHomologacao />}
        </div>
      </ErrorBoundary>
    </Layout>
  )
}
