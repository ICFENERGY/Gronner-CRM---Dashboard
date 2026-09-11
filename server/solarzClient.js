const BASE_URL = 'https://app.solarz.com.br'

function getAuthHeader() {
  const user = process.env.SOLARZ_USER
  const pass = process.env.SOLARZ_PASSWORD
  if (!user || !pass) {
    throw new Error('SOLARZ_USER e SOLARZ_PASSWORD precisam estar definidos (variáveis de ambiente)')
  }
  return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64')
}

async function solarzRequest(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: getAuthHeader(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const data = await res.json().catch(() => null)

  if (!res.ok) {
    const message = data?.message || `Erro ${res.status} ao consultar SolarZ ${path}`
    const error = new Error(message)
    error.status = res.status
    throw error
  }

  return data
}

/** Busca todas as usinas (plantWithInfos/list já retorna tudo numa única página, sem custo de N chamadas). */
export async function solarzListarUsinas() {
  const data = await solarzRequest('/openApi/seller/plantWithInfos/list', {
    method: 'POST',
    body: { page: '1', pageSize: '500' },
  })
  return data.content ?? []
}

export async function solarzPotenciaUsina(plantId) {
  return solarzRequest(`/openApi/seller/plant/power?id=${plantId}`)
}
