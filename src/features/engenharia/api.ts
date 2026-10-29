import type { AcaoCombinada, Engenharia } from './tipos'

const BASE = '/api/engenharia'

/** Erro com o status HTTP, para a tela distinguir código inválido (401) de falha. */
export class ErroApi extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

async function enviar<T>(path: string, init: RequestInit = {}, codigo?: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(codigo ? { 'X-Engenharia-Token': codigo } : {}), ...(init.headers ?? {}) },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ErroApi(body.error || `Erro ${res.status}`, res.status)
  return body as T
}

export const engenhariaApi = {
  carregar: () => enviar<Engenharia>(''),
  salvarAcao: (id: number, dados: { acao: string; dono: string; prazo: string; por: string }, codigo: string) =>
    enviar<AcaoCombinada>(`/acoes/${id}`, { method: 'PUT', body: JSON.stringify(dados) }, codigo),
  concluirAcao: (id: number, por: string, codigo: string) =>
    enviar<AcaoCombinada>(`/acoes/${id}/concluir`, { method: 'POST', body: JSON.stringify({ por }) }, codigo),
  historicoAcao: (id: number, codigo: string) => enviar<AcaoCombinada[]>(`/acoes/${id}/historico`, {}, codigo),
  salvarPrazos: (dados: { sla: Record<string, number>; metaEntrega: number; por: string }, codigo: string) =>
    enviar(`/prazos`, { method: 'PUT', body: JSON.stringify(dados) }, codigo),
}
