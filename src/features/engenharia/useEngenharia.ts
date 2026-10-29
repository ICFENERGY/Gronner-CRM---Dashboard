import { useCallback, useEffect, useRef, useState } from 'react'
import { engenhariaApi } from './api'
import type { Engenharia } from './tipos'

/** Recarrega sozinho a cada minuto, para acompanhar a sincronização de 5 em 5 minutos. */
const INTERVALO_MS = 60_000

export function useEngenharia() {
  const [dados, setDados] = useState<Engenharia | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const ativo = useRef(true)
  const ultimaRequisicao = useRef(0)

  // Só a resposta da requisição mais recente vale: uma lenta e antiga não sobrescreve a nova.
  const recarregar = useCallback(async () => {
    const minha = ++ultimaRequisicao.current
    const vale = () => ativo.current && minha === ultimaRequisicao.current
    try {
      const d = await engenhariaApi.carregar()
      if (vale()) { setDados(d); setErro(null) }
    } catch (e) {
      if (vale()) setErro(e instanceof Error ? e.message : 'Falha ao carregar')
    } finally {
      if (vale()) setCarregando(false)
    }
  }, [])

  useEffect(() => {
    ativo.current = true
    recarregar()
    const t = window.setInterval(recarregar, INTERVALO_MS)
    return () => { ativo.current = false; window.clearInterval(t) }
  }, [recarregar])

  return { dados, erro, carregando, recarregar }
}

const CHAVE_CODIGO = 'engenharia:codigo'
const CHAVE_NOME = 'engenharia:nome'

function ler(chave: string) {
  try { return window.localStorage.getItem(chave) ?? '' } catch { return '' }
}
function gravar(chave: string, valor: string) {
  try { if (valor) window.localStorage.setItem(chave, valor); else window.localStorage.removeItem(chave) } catch { /* sem armazenamento local */ }
}

/** Código da equipe e nome de quem registra, lembrados neste navegador. */
export function useIdentidade() {
  const [codigo, setCodigoState] = useState(() => ler(CHAVE_CODIGO))
  const [nome, setNomeState] = useState(() => ler(CHAVE_NOME))
  return {
    codigo,
    nome,
    setCodigo: (v: string) => { setCodigoState(v); gravar(CHAVE_CODIGO, v) },
    setNome: (v: string) => { setNomeState(v); gravar(CHAVE_NOME, v) },
  }
}
