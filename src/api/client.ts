import type { PietaMetricas, PietaProjetoDetalhe, PietaResumo, ProjetoRaw, PropostaRaw, SyncStatus, TarefaRaw, UsinasRawResponse, VendaRaw } from './types'

async function request<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Erro ${res.status}`)
  }
  return res.json()
}

/** Leituras do painel: dados já sincronizados no banco (nenhuma rota aqui consulta o Groner ao vivo). */
export const api = {
  getVendasRaw: () => request<VendaRaw[]>('/api/raw/vendas'),
  getProjetosRaw: () => request<ProjetoRaw[]>('/api/raw/projetos'),
  getPropostasRaw: () => request<PropostaRaw[]>('/api/raw/propostas'),
  getTarefasRaw: () => request<TarefaRaw[]>('/api/raw/tarefas'),
  getUsinasRaw: () => request<UsinasRawResponse>('/api/raw/usinas'),
  getPietaResumo: () => request<PietaResumo>('/api/raw/pieta/resumo'),
  getPietaMetricas: () => request<PietaMetricas>('/api/raw/pieta/metricas'),
  getPietaProjeto: (projectId: number) => request<PietaProjetoDetalhe>(`/api/raw/pieta/projeto/${projectId}`),
  /** Situação da sincronização do Groner (horário de cada carga), lida do banco. */
  getSyncStatus: () => request<SyncStatus>('/api/sync/groner/status'),
}
