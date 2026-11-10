import { useEffect, useRef, useState } from 'react'

/**
 * Mostra uma página estática do painel dentro de um iframe: /indicadores (Visão Geral, Vendas e Engenharia) e /pieta (aba Pieta).
 * A página avisa a própria altura por postMessage, então só a página do painel rola.
 */
export type GrupoFrame = 'geral' | 'vendas' | 'engenharia' | 'pieta'

const PAGINAS: Record<GrupoFrame, { titulo: string; url: string; hash: string }> = {
  geral: { titulo: 'Indicadores: visão geral', url: '/indicadores/index.html?embed=1&grupo=geral', hash: '#dash' },
  vendas: { titulo: 'Indicadores de vendas', url: '/indicadores/index.html?embed=1&grupo=vendas', hash: '#sales' },
  engenharia: { titulo: 'Engenharia: gestão diária', url: '/indicadores/index.html?embed=1&grupo=engenharia', hash: '#gestao' },
  pieta: { titulo: 'Pieta: SLA de atendimento', url: '/pieta/index.html?embed=1', hash: '' },
}

export function IndicadoresFrame({ grupo, theme }: { grupo: GrupoFrame; theme: 'light' | 'dark' }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [altura, setAltura] = useState<number | null>(null)
  // O tema inicial vai na URL; mudanças depois vão por postMessage, sem recarregar.
  const temaInicial = useRef(theme)
  const pagina = PAGINAS[grupo]

  useEffect(() => {
    const ouvir = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== ref.current?.contentWindow) return
      if (e.data?.tipo === 'indicadores-altura' && typeof e.data.altura === 'number') setAltura(e.data.altura)
    }
    window.addEventListener('message', ouvir)
    return () => window.removeEventListener('message', ouvir)
  }, [])

  useEffect(() => {
    ref.current?.contentWindow?.postMessage({ tipo: 'tema', tema: theme }, window.location.origin)
  }, [theme])

  return (
    <iframe
      ref={ref}
      title={pagina.titulo}
      src={`${pagina.url}&tema=${temaInicial.current}${pagina.hash}`}
      scrolling="no"
      onLoad={() => ref.current?.contentWindow?.postMessage({ tipo: 'tema', tema: theme }, window.location.origin)}
      className="block w-full border-0"
      style={{ height: altura ?? 'calc(100vh - 8rem)', minHeight: 'calc(100vh - 8rem)' }}
    />
  )
}
