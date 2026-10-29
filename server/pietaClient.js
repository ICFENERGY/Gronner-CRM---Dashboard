const BASE_URL = 'https://n8n.pied.com.br/webhook/projects'

export const TIMEOUT_MS = 15000
export const MAX_TENTATIVAS = 3 // 1 chamada + 2 novas tentativas
export const ESPERA_RETRY_MS = 500

/** Há usuário e senha da API da Pieta no ambiente. */
export function pietaConfigurada() {
  return Boolean(process.env.PIETA_USER && process.env.PIETA_PASSWORD)
}

function getAuthHeader() {
  const user = process.env.PIETA_USER
  const pass = process.env.PIETA_PASSWORD
  if (!user || !pass) {
    const error = new Error('PIETA_USER e PIETA_PASSWORD precisam estar definidos (variáveis de ambiente)')
    error.code = 'PIETA_SEM_CREDENCIAL'
    throw error
  }
  return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64')
}

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function mensagemDeErro(status, data, projectId) {
  if (status === 401) return 'Credencial da Pieta inválida (401): confira PIETA_USER e PIETA_PASSWORD'
  if (status === 404) return projectId ? `Projeto ${projectId} não encontrado na Pieta (404)` : 'Recurso não encontrado na Pieta (404)'
  return data?.mensagem || `Erro ${status} ao consultar a Pieta`
}

async function tentarUmaVez(projectId, { timeoutMs, auth }) {
  const url = new URL(BASE_URL)
  if (projectId) url.searchParams.set('project_id', projectId)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      headers: { Authorization: auth, Accept: 'application/json' },
      signal: controller.signal,
    })
    const bruto = await res.json().catch(() => null)
    // O proxy da Pieta (n8n) às vezes embrulha um erro interno assim: HTTP 401 com {status:500, body:{error, mensagem}}.
    // Isso NÃO é credencial inválida: vale o status de dentro (500), que é repetido.
    const embrulhado = bruto && typeof bruto.status === 'number' && bruto.body && typeof bruto.body === 'object' ? bruto : null
    const data = embrulhado ? embrulhado.body : bruto
    if (!res.ok || data?.error) {
      const status = embrulhado && embrulhado.status >= 500 ? embrulhado.status : res.status && !res.ok ? res.status : 502
      const error = new Error(mensagemDeErro(status, data, projectId))
      error.status = status
      throw error
    }
    // A API sempre retorna um array com um único objeto.
    return Array.isArray(data) ? data[0] : data
  } catch (err) {
    if (controller.signal.aborted && !err.status) {
      const error = new Error(`Timeout de ${timeoutMs} ms ao consultar a Pieta`)
      error.code = 'PIETA_TIMEOUT'
      throw error
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

/** 5xx, 429, timeout ou rede: instabilidade da API (não é problema do projeto pedido). */
export function ehTransitorio(err) {
  if (err.status) return err.status === 429 || err.status >= 500
  return true // erro de rede ou timeout
}

/** @param opcoes.tentativas 1 = sem nova tentativa (a carga gradual não insiste: a API cai com chamadas seguidas). */
async function pietaRequest(projectId, { timeoutMs = TIMEOUT_MS, esperaMs = ESPERA_RETRY_MS, tentativas = MAX_TENTATIVAS } = {}) {
  const auth = getAuthHeader() // sem credencial falha já, sem tentar de novo
  const maximo = Math.max(1, Math.min(MAX_TENTATIVAS, Math.floor(Number(tentativas)) || 1))
  let ultimo
  for (let i = 1; i <= maximo; i++) {
    try {
      return await tentarUmaVez(projectId, { timeoutMs, auth })
    } catch (err) {
      ultimo = err
      if (!ehTransitorio(err) || i === maximo) break // 401 e 404 não se repetem
      await dormir(esperaMs * i)
    }
  }
  throw ultimo
}

/** Resumo do usuário + lista de projetos (sem project_id). */
export function pietaResumo(opcoes) {
  return pietaRequest(undefined, opcoes)
}

/** Detalhe completo de um projeto específico. */
export function pietaDetalheProjeto(projectId, opcoes) {
  return pietaRequest(projectId, opcoes)
}
