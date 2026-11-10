import { useEffect, useRef, useState } from 'react'

/**
 * Mostra a página /indicadores dentro do painel (Visão Geral e Vendas).
 * A página avisa a própria altura por postMessage, então só a página do painel rola.
 */
export function IndicadoresFrame({ grupo, theme }: { grupo: 'geral' | 'vendas'; theme: 'light' | 'dark' }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [altura, setAltura] = useState<number | null>(null)
  // O tema inicial vai na URL; mudanças depois vão por postMessage, sem recarregar.
  const temaInicial = useRef(theme)
  const hash = grupo === 'vendas' ? 'sales' : 'dash'

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
      title={grupo === 'vendas' ? 'Indicadores de vendas' : 'Indicadores: visão geral'}
      src={`/indicadores/index.html?embed=1&grupo=${grupo}&tema=${temaInicial.current}#${hash}`}
      scrolling="no"
      onLoad={() => ref.current?.contentWindow?.postMessage({ tipo: 'tema', tema: theme }, window.location.origin)}
      className="block w-full border-0"
      style={{ height: altura ?? 'calc(100vh - 8rem)', minHeight: 'calc(100vh - 8rem)' }}
    />
  )
}
