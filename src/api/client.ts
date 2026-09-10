import type { ProjetoRaw, PropostaRaw, Summary, TarefaRaw, VendaRaw } from './types'

async function request<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Erro ${res.status}`)
  }
  return res.json()
}

export const api = {
  getSummary: (refresh = false) => request<Summary>(`/api/summary${refresh ? '?refresh=1' : ''}`),
  getVendasRaw: () => request<VendaRaw[]>('/api/raw/vendas'),
  getProjetosRaw: () => request<ProjetoRaw[]>('/api/raw/projetos'),
  getPropostasRaw: () => request<PropostaRaw[]>('/api/raw/propostas'),
  getTarefasRaw: () => request<TarefaRaw[]>('/api/raw/tarefas'),
}
