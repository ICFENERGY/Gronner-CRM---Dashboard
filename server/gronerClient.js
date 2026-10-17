import 'dotenv/config'

const TENANT = process.env.GRONER_TENANT
const TOKEN = process.env.GRONER_TOKEN

if (!TENANT || !TOKEN) {
  // Não usar process.exit aqui: em serverless (Vercel) isso derrubaria a
  // function de forma abrupta. Lançar erro dá um 500 normal, tratável.
  throw new Error('GRONER_TENANT e GRONER_TOKEN precisam estar definidos (variáveis de ambiente)')
}

const BASE_URL = `https://${TENANT}.api.groner.app/api`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * GET com timeout por chamada e novas tentativas (só erro de rede/timeout, 5xx e 429).
 * opts: { timeoutMs = 12000, retries = 2, retryDelayMs = 300, onRetry }
 */
export async function gronerGet(resource, params = {}, opts = {}) {
  const { timeoutMs = 12000, retries = 2, retryDelayMs = 300, onRetry } = opts
  const url = new URL(`${BASE_URL}/${resource}`)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value)
    }
  }

  let lastError
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      onRetry?.(attempt)
      await sleep(retryDelayMs * attempt)
    }
    let res
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (err) {
      // erro de rede ou timeout
      lastError = err
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        lastError = new Error(`Tempo esgotado (${timeoutMs} ms) ao consultar ${resource}`)
        lastError.status = 504
      }
      continue
    }

    const body = await res.json().catch(() => null)

    if (!res.ok) {
      const message = body?.ResponseException?.ExceptionMessage || body?.Message || `Erro ${res.status} ao consultar ${resource}`
      const error = new Error(message)
      error.status = res.status
      if (res.status === 429 || res.status >= 500) {
        lastError = error
        continue
      }
      throw error
    }

    return body?.Content ?? body
  }
  throw lastError
}

/**
 * Busca todas as páginas de um recurso paginado (uso interno para agregações).
 * A API pode devolver menos itens por página que o pageSize pedido (hoje 20),
 * então o total de páginas vem da resposta, não de totalItems / pageSize.
 * opts: { pageSize = 500, maxPages = 40, maxItems, concurrency = 8, ...opçõesDoGronerGet }
 * O teto efetivo é em ITENS: maxItems (ou maxPages * pageSize pedido, compatível com os chamadores).
 */
export async function gronerGetAll(resource, params = {}, opts = {}) {
  const { pageSize = 500, maxPages = 40, concurrency = 8, ...getOpts } = opts
  const maxItems = opts.maxItems ?? maxPages * pageSize
  delete getOpts.maxItems

  const first = await gronerGet(resource, { ...params, pageNumber: 1, pageSize }, getOpts)
  const firstList = first?.list ?? []
  const totalItems = first?.totalItems ?? firstList.length
  const pages = [firstList]

  const realSize = firstList.length
  let totalPages = Number(first?.totalPages)
  if (!Number.isFinite(totalPages) || totalPages < 1) {
    totalPages = realSize > 0 ? Math.ceil(totalItems / realSize) : 1
  }
  if (realSize > 0) totalPages = Math.min(totalPages, Math.ceil(maxItems / realSize))

  let next = 2
  let stop = false
  const worker = async () => {
    while (!stop) {
      const page = next++
      if (page > totalPages) return
      const res = await gronerGet(resource, { ...params, pageNumber: page, pageSize }, getOpts)
      const list = res?.list ?? []
      if (list.length === 0) {
        stop = true
        return
      }
      pages[page - 1] = list
    }
  }
  const n = Math.max(1, Math.min(concurrency, totalPages - 1))
  await Promise.all(Array.from({ length: totalPages > 1 ? n : 0 }, worker))

  // ordem por página; páginas após uma vazia são descartadas para não deixar buraco
  const items = []
  for (let i = 0; i < pages.length; i++) {
    if (!pages[i]) break
    items.push(...pages[i])
  }

  return { items, totalItems, pagesFetched: pages.filter(Boolean).length, summary: first?.summary ?? null }
}
