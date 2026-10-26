const BASE_URL = 'https://app.solarz.com.br'

// A documentação pública da API não foi encontrada; paginação defensiva.
export const PAGE_SIZE = 500
export const MAX_PAGES = 50
export const TIMEOUT_MS = 15000
export const MAX_TENTATIVAS = 3 // 1 chamada + 2 novas tentativas
export const ESPERA_RETRY_MS = 500
export const PRAZO_TOTAL_MS = 25000 // prazo total da listagem inteira (a função da Vercel tem 60 s)

function getAuthHeader() {
  const user = process.env.SOLARZ_USER
  const pass = process.env.SOLARZ_PASSWORD
  if (!user || !pass) {
    const error = new Error('credenciais da SolarZ não configuradas (defina SOLARZ_USER e SOLARZ_PASSWORD)')
    error.code = 'SOLARZ_SEM_CREDENCIAL'
    throw error
  }
  return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64')
}

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function tentarUmaVez(path, { method, body, timeoutMs, auth }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      const error = new Error(data?.message || `Erro ${res.status} ao consultar SolarZ ${path}`)
      error.status = res.status
      throw error
    }
    return data
  } catch (err) {
    if (controller.signal.aborted && !err.status) {
      const error = new Error(`Timeout de ${timeoutMs} ms ao consultar SolarZ ${path}`)
      error.code = 'SOLARZ_TIMEOUT'
      throw error
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

function ehTransitorio(err) {
  if (err.status) return err.status === 429 || err.status >= 500
  return true // erro de rede ou timeout
}

async function solarzRequest(path, { method = 'GET', body, timeoutMs = TIMEOUT_MS, esperaMs = ESPERA_RETRY_MS } = {}) {
  const auth = getAuthHeader() // sem credencial falha já, sem tentar de novo
  let ultimo
  for (let i = 1; i <= MAX_TENTATIVAS; i++) {
    try {
      return await tentarUmaVez(path, { method, body, timeoutMs, auth })
    } catch (err) {
      ultimo = err
      if (!ehTransitorio(err) || i === MAX_TENTATIVAS) break
      await dormir(esperaMs * i)
    }
  }
  throw ultimo
}

/**
 * Busca todas as usinas página a página, até vir página vazia ou com menos
 * itens que pageSize (teto de MAX_PAGES páginas e de PRAZO_TOTAL_MS no total).
 * Para se a página repetir o primeiro id da anterior (API que ignora a paginação)
 * e devolve cada usina uma vez só (por id).
 */
export async function solarzListarUsinas({ pageSize = PAGE_SIZE, maxPages = MAX_PAGES, timeoutMs = TIMEOUT_MS, esperaMs, prazoMs = PRAZO_TOTAL_MS } = {}) {
  const inicio = Date.now()
  const todas = []
  const vistos = new Set()
  let primeiroAnterior
  for (let page = 1; page <= maxPages; page++) {
    const restante = prazoMs - (Date.now() - inicio)
    if (restante <= 0) {
      const error = new Error(`Prazo de ${prazoMs} ms esgotado ao listar usinas da SolarZ (página ${page})`)
      error.code = 'SOLARZ_TIMEOUT'
      throw error
    }
    const data = await solarzRequest('/openApi/seller/plantWithInfos/list', {
      method: 'POST',
      body: { page: String(page), pageSize: String(pageSize) },
      timeoutMs: Math.max(1, Math.min(timeoutMs, restante)),
      esperaMs,
    })
    const itens = Array.isArray(data?.content) ? data.content : []
    const primeiro = itens[0]?.id
    if (page > 1 && primeiro != null && primeiro === primeiroAnterior) break
    primeiroAnterior = primeiro
    for (const usina of itens) {
      if (usina?.id != null) {
        if (vistos.has(usina.id)) continue
        vistos.add(usina.id)
      }
      todas.push(usina)
    }
    if (itens.length === 0 || itens.length < pageSize) break
  }
  return todas
}

export async function solarzPotenciaUsina(plantId) {
  return solarzRequest(`/openApi/seller/plant/power?id=${plantId}`)
}
