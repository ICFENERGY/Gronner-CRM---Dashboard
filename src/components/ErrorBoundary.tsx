import { Component, type ErrorInfo, type ReactNode } from 'react'

/** Chave dos filtros de Vendas e Financeiro no armazenamento local (ver features/areas/ui.tsx). */
export const CHAVE_FILTROS_PAINEL = 'painel:filtros'

/** Apaga os filtros salvos (podem ser a causa do erro) e recarrega a página. */
export function limparFiltrosERecarregar() {
  try { window.localStorage.removeItem(CHAVE_FILTROS_PAINEL) } catch { /* sem armazenamento local */ }
  window.location.reload()
}

/**
 * Captura erro de renderização para não deixar a tela em branco. `pagina` cobre
 * o conteúdo de uma aba; `cartao` cobre um gráfico só, e o resto da página segue.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; variante?: 'pagina' | 'cartao' }, { erro: Error | null }> {
  state: { erro: Error | null } = { erro: null }

  static getDerivedStateFromError(erro: Error) {
    return { erro }
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error('[painel] erro de renderização capturado:', erro, info.componentStack)
  }

  render() {
    if (!this.state.erro) return this.props.children
    const botao = (
      <button type="button" onClick={limparFiltrosERecarregar} className="rounded-md bg-icf-green px-3 py-1.5 text-sm font-semibold text-icf-navy">
        Limpar filtros e recarregar
      </button>
    )
    if (this.props.variante === 'cartao') {
      return (
        <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center text-xs text-[var(--text-muted)]">
          <p>Não foi possível mostrar este bloco com os filtros atuais.</p>
          {botao}
        </div>
      )
    }
    return (
      <div role="alert" className="mx-auto my-10 grid max-w-xl gap-3 rounded-xl border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
        <h2 className="text-base font-semibold">Algo deu errado ao montar esta tela.</h2>
        <p>Os dados chegaram, mas a página não conseguiu exibi-los. Limpar os filtros salvos costuma resolver; se o problema continuar, avise a equipe do painel.</p>
        <div>{botao}</div>
      </div>
    )
  }
}
