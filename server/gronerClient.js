import 'dotenv/config'

const TENANT = process.env.GRONER_TENANT
const TOKEN = process.env.GRONER_TOKEN

if (!TENANT || !TOKEN) {
  // Não usar process.exit aqui: em serverless (Vercel) isso derrubaria a
  // function de forma abrupta. Lançar erro dá um 500 normal, tratável.
  throw new Error('GRONER_TENANT e GRONER_TOKEN precisam estar definidos (variáveis de ambiente)')
}

const BASE_URL = `https://${TENANT}.api.groner.app/api`

export async function gronerGet(resource, params = {}) {
  const url = new URL(`${BASE_URL}/${resource}`)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value)
    }
  }

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/json',
    },
  })

  const body = await res.json().catch(() => null)

  if (!res.ok) {
    const message = body?.ResponseException?.ExceptionMessage || body?.Message || `Erro ${res.status} ao consultar ${resource}`
    const error = new Error(message)
    error.status = res.status
    throw error
  }

  return body?.Content ?? body
}

/** Busca todas as páginas de um recurso paginado (uso interno para agregações). */
export async function gronerGetAll(resource, params = {}, { pageSize = 500, maxPages = 40 } = {}) {
  const first = await gronerGet(resource, { ...params, pageNumber: 1, pageSize })
  const items = [...(first.list ?? [])]
  const totalItems = first.totalItems ?? items.length
  const totalPages = Math.min(Math.ceil(totalItems / pageSize), maxPages)

  for (let page = 2; page <= totalPages; page++) {
    const next = await gronerGet(resource, { ...params, pageNumber: page, pageSize })
    if (!next.list || next.list.length === 0) break
    items.push(...next.list)
  }

  return { items, totalItems, summary: first.summary ?? null }
}
