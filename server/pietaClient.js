const BASE_URL = 'https://n8n.pied.com.br/webhook/projects'

function getAuthHeader() {
  const user = process.env.PIETA_USER
  const pass = process.env.PIETA_PASSWORD
  if (!user || !pass) {
    throw new Error('PIETA_USER e PIETA_PASSWORD precisam estar definidos (variáveis de ambiente)')
  }
  return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64')
}

async function pietaRequest(projectId) {
  const url = new URL(BASE_URL)
  if (projectId) url.searchParams.set('project_id', projectId)

  const res = await fetch(url, {
    headers: { Authorization: getAuthHeader(), Accept: 'application/json' },
  })

  const data = await res.json().catch(() => null)

  if (!res.ok || data?.error) {
    const message = data?.mensagem || `Erro ${res.status} ao consultar Pieta`
    const error = new Error(message)
    error.status = res.status
    throw error
  }

  // A API sempre retorna um array com um único objeto.
  return Array.isArray(data) ? data[0] : data
}

/** Resumo do usuário + lista de projetos (sem project_id). */
export function pietaResumo() {
  return pietaRequest()
}

/** Detalhe completo de um projeto específico. */
export function pietaDetalheProjeto(projectId) {
  return pietaRequest(projectId)
}
