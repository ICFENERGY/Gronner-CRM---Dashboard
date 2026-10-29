const BASE_URL = 'https://app.solarz.com.br'

// Open API oficial: https://app.solarz.com.br/v3/api-docs/seller-open-api. Paginação medida na conta real:
// as listas começam na página 1 (página 0 devolve 400 "Página inválida"); mesmo assim há detecção defensiva da base.
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
      const mensagem = data?.message || data?.msg
      const error = new Error(mensagem || `Erro ${res.status} ao consultar SolarZ ${path}`)
      error.status = res.status
      const tipo = classificarErro(res.status, mensagem)
      if (tipo) error.code = tipo
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

/**
 * Várias rotas de energia respondem 500/401 com "Recurso nao disponivel para o integrador"
 * (a conta não tem a rota) e 400 "Essa usina não é premium." (sem monitoramento).
 * Nenhum dos dois é falha da credencial nem se repete: viram "indisponível" para aquela usina/rota.
 */
export function classificarErro(status, mensagem) {
  const m = String(mensagem ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  if (m.includes('recurso nao disponivel')) return 'SOLARZ_INDISPONIVEL'
  if (status === 400 && m.includes('nao e premium')) return 'SOLARZ_NAO_PREMIUM'
  if (status === 410) return 'SOLARZ_INDISPONIVEL'
  return null
}

/** A rota não está disponível para a conta/usina (não é erro de credencial nem de rede). */
export const ehIndisponivel = (err) => err?.code === 'SOLARZ_INDISPONIVEL' || err?.code === 'SOLARZ_NAO_PREMIUM'

function ehTransitorio(err) {
  if (err.code === 'SOLARZ_INDISPONIVEL' || err.code === 'SOLARZ_NAO_PREMIUM') return false
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
 * Lista paginada genérica (POST com {page,pageSize,...}). Resposta Spring Page ({content,last,totalElements})
 * ou array simples. Para quando a página vem vazia, curta, marcada como `last`, repete o primeiro id da anterior
 * (API que ignora a paginação) ou o prazo acaba; devolve cada item uma vez só (por id).
 * A base da página é 1; se a API recusar a página 1 com 400, tenta de novo a partir da 0.
 * @returns {{itens: object[], completo: boolean, totalElements: number|null}} completo=false quando parou por teto de páginas
 */
export async function solarzListarPaginado(path, { corpo = {}, pageSize = PAGE_SIZE, maxPages = MAX_PAGES, timeoutMs = TIMEOUT_MS, esperaMs, prazoMs = PRAZO_TOTAL_MS, rotulo = 'itens' } = {}) {
  const inicio = Date.now()
  const todas = []
  const vistos = new Set()
  let primeiroAnterior
  let total = null
  let completo = true
  let base = 1
  for (let n = 0; n < maxPages; n++) {
    const page = base + n
    const restante = prazoMs - (Date.now() - inicio)
    if (restante <= 0) {
      const error = new Error(`Prazo de ${prazoMs} ms esgotado ao listar ${rotulo} da SolarZ (página ${page})`)
      error.code = 'SOLARZ_TIMEOUT'
      throw error
    }
    let data
    try {
      data = await solarzRequest(path, {
        method: 'POST',
        body: { ...corpo, page: String(page), pageSize: String(pageSize) },
        timeoutMs: Math.max(1, Math.min(timeoutMs, restante)),
        esperaMs,
      })
    } catch (err) {
      if (n === 0 && base === 1 && err.status === 400) { base = 0; n = -1; continue } // base 0: refaz a primeira página
      throw err
    }
    const itens = Array.isArray(data) ? data : Array.isArray(data?.content) ? data.content : []
    if (Number.isFinite(data?.totalElements)) total = data.totalElements
    const primeiro = itens[0]?.id
    if (n > 0 && primeiro != null && primeiro === primeiroAnterior) break
    primeiroAnterior = primeiro
    for (const item of itens) {
      if (item?.id != null) {
        if (vistos.has(item.id)) continue
        vistos.add(item.id)
      }
      todas.push(item)
    }
    if (itens.length === 0 || itens.length < pageSize || data?.last === true) return { itens: todas, completo: true, totalElements: total }
    completo = false
  }
  return { itens: todas, completo, totalElements: total }
}

/** Todas as usinas com informações (status ao vivo, cliente, endereço). Só os itens. */
export async function solarzListarUsinas(opcoes = {}) {
  return (await solarzListarPaginado('/openApi/seller/plantWithInfos/list', { ...opcoes, rotulo: 'usinas' })).itens
}

/** Idem, com a indicação de lista completa (para decidir se pode desativar quem sumiu). */
export function solarzListarUsinasCompleto(opcoes = {}) {
  return solarzListarPaginado('/openApi/seller/plantWithInfos/list', { ...opcoes, rotulo: 'usinas' })
}

/** Lista simples de todas as usinas da conta (id, denominacao, premium, arquivada): 139 na conta real, só 59 premium. */
export function solarzListarSimples(opcoes = {}) {
  return solarzListarPaginado('/openApi/seller/plant/list/simple', { ...opcoes, rotulo: 'usinas (lista simples)' })
}

/** Unidades consumidoras por usina (1 chamada paginada para todas). Só as usinas com unidade vêm na resposta. */
export function solarzListarUnidades(opcoes = {}) {
  return solarzListarPaginado('/openApi/seller/plants/units-with-credits', { ...opcoes, rotulo: 'unidades' })
}

/** Tickets em aberto (ABERTO, EM_ANDAMENTO, EM_ESPERA) de todas as usinas. */
export function solarzListarTicketsAbertos(opcoes = {}) {
  return solarzListarPaginado('/openApi/seller/ticket/list', {
    ...opcoes,
    corpo: { filters: { status: STATUS_TICKET_ABERTO } },
    rotulo: 'tickets',
  })
}
export const STATUS_TICKET_ABERTO = ['ABERTO', 'EM_ANDAMENTO', 'EM_ESPERA']

/** Produção mensal do ano: [{yearMonth:'2026-05', total (kWh), totalExpected (kWh)}]. Só premium. */
export function solarzEnergiaAno(plantId, ano, opcoes) {
  return solarzRequest(`/openApi/seller/plant/energy/plantId/${encodeURIComponent(plantId)}/year/${encodeURIComponent(ano)}`, { method: 'POST', ...opcoes })
}

/** Desempenho acumulado: {total1D,15D,30D,365D, expected1D,15D,30D,365D, installationDate}. */
export function solarzDesempenho(plantId, opcoes) {
  return solarzRequest(`/openApi/seller/plant/performance/plantId/${encodeURIComponent(plantId)}`, { method: 'POST', ...opcoes })
}

/** Relatório mensal consolidado (yyyy-MM): [{idPlant, generation, performance (em %), totalInvested, monthYear, ...}]. */
export function solarzRelatorioPeriodo(plantId, inicio, fim, opcoes) {
  const q = new URLSearchParams({ plantId: String(plantId), yearMonthStart: inicio, yearMonthEnd: fim })
  return solarzRequest(`/openApi/seller/plantReport/period/report?${q}`, opcoes)
}

export async function solarzPotenciaUsina(plantId) {
  return solarzRequest(`/openApi/seller/plant/power?id=${plantId}`)
}
