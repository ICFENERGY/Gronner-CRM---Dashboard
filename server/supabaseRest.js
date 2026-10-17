/**
 * Cliente mínimo do PostgREST (API de dados do Supabase) para a tabela única
 * "DASHBOARD-GRONNER-CRM". Usa só o `fetch` nativo, sem dependência nova.
 * Desenho completo em docs/SUPABASE-DASHBOARD.md.
 *
 * Erros:
 * - erro de negócio das funções (SQLSTATE PT409/PT400) vira Error com `status`
 *   e `message` do banco (as rotas já repassam mensagens de status < 500);
 * - qualquer outra falha (rede, timeout, 5xx, 4xx do PostgREST) vira status 503
 *   com mensagem genérica. A chave secreta nunca entra em mensagem nem em log.
 */

export const TABELA = 'DASHBOARD-GRONNER-CRM'
export const COLUNAS_UPSERT = ['tipo', 'entidade', 'chave', 'dados', 'hash', 'ativo', 'expira_em']
const TAMANHO_PAGINA = 1000
const TIMEOUT_MS = 8000
const TENTATIVAS = 3

export function supabaseConfigured(env = process.env) {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SECRET_KEY)
}

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function erroIndisponivel(causa, retentavel = true) {
  return Object.assign(new Error('Armazenamento de sincronização indisponível'), { status: 503, causa, retentavel })
}

/** Converte um corpo de erro do PostgREST em Error. `PT409` -> status 409 com a mensagem do banco. */
function erroDaResposta(status, texto) {
  let corpo = null
  try { corpo = JSON.parse(texto) } catch { /* corpo não é JSON */ }
  const negocio = /^PT(\d{3})$/.exec(String(corpo?.code ?? ''))
  if (negocio && corpo?.message) return Object.assign(new Error(String(corpo.message)), { status: Number(negocio[1]), retentavel: false })
  return erroIndisponivel(`HTTP ${status}${corpo?.code ? ` ${corpo.code}` : ''}`, status >= 500)
}

/**
 * @param opcoes.url base do projeto (SUPABASE_URL)
 * @param opcoes.chave chave secreta (SUPABASE_SECRET_KEY)
 * @param opcoes.fetch fetch injetável (testes)
 * @param opcoes.tamanhoPagina linhas por página no getAll (padrão 1000 = max-rows do Supabase)
 * @param opcoes.esperaRetentativaMs base do backoff entre tentativas
 * @param opcoes.log função de log (padrão console.error)
 */
export function createSupabaseRest({
  url, chave, fetch: fetchImpl, timeoutMs = TIMEOUT_MS, tamanhoPagina = TAMANHO_PAGINA,
  esperaRetentativaMs = 100, log = console.error,
} = {}) {
  if (!url || !chave) throw erroIndisponivel('sem configuração')
  const base = `${String(url).replace(/\/+$/, '')}/rest/v1`
  const doFetch = (...args) => (fetchImpl ?? globalThis.fetch)(...args)

  async function chamar(caminho, { metodo = 'GET', cabecalhos = {}, corpo, retentar = true } = {}) {
    const alvo = `${base}${caminho}`
    const tentativas = retentar ? TENTATIVAS : 1
    let ultimo
    for (let n = 1; n <= tentativas; n += 1) {
      try {
        const resposta = await doFetch(alvo, {
          method: metodo,
          headers: {
            apikey: chave,
            Authorization: `Bearer ${chave}`,
            'Content-Type': 'application/json',
            ...cabecalhos,
          },
          body: corpo === undefined ? undefined : JSON.stringify(corpo),
          signal: AbortSignal.timeout(timeoutMs),
        })
        const texto = await resposta.text()
        if (resposta.ok) return { status: resposta.status, texto, cabecalhos: resposta.headers }
        ultimo = erroDaResposta(resposta.status, texto)
        if (!ultimo.retentavel) throw ultimo // erro de negócio ou de requisição: não adianta repetir
      } catch (err) {
        ultimo = 'retentavel' in (err ?? {}) ? err : erroIndisponivel(err?.name === 'TimeoutError' || err?.name === 'AbortError' ? 'timeout' : 'rede')
        if (!ultimo.retentavel) throw ultimo
      }
      if (n < tentativas) await dormir(esperaRetentativaMs * 2 ** (n - 1))
    }
    log('[supabase] falha após tentativas:', ultimo?.causa ?? ultimo?.message)
    throw ultimo
  }

  const consulta = (filtros) => {
    const params = new URLSearchParams()
    for (const [campo, valor] of Object.entries(filtros ?? {})) params.append(campo, String(valor))
    const texto = params.toString()
    return texto ? `?${texto}` : ''
  }
  const json = (texto) => (texto ? JSON.parse(texto) : null)

  const rest = {
    base,

    /** SELECT. `filtros` no formato do PostgREST: { tipo: 'eq.registro', select: 'chave,dados' }. */
    async get(filtros, { intervalo } = {}) {
      const cabecalhos = intervalo ? { 'Range-Unit': 'items', Range: `${intervalo[0]}-${intervalo[1]}` } : {}
      const r = await chamar(`/${TABELA}${consulta(filtros)}`, { cabecalhos })
      return json(r.texto) ?? []
    },

    /** SELECT de todas as linhas, paginado por chave (keyset): estável mesmo com escrita entre páginas. */
    async getAll(filtros) {
      const saida = []
      let ultima = null
      for (;;) {
        const pagina = await rest.get({
          ...filtros,
          order: 'chave.asc',
          limit: tamanhoPagina,
          ...(ultima == null ? {} : { chave: `gt.${ultima}` }),
        })
        saida.push(...pagina)
        if (pagina.length < tamanhoPagina) return saida
        ultima = pagina[pagina.length - 1].chave
      }
    },

    /** Upsert em lote numa única requisição (= uma transação). Todas as colunas vão em todas as linhas. */
    async upsert(linhas) {
      if (!linhas.length) return
      const corpo = linhas.map((l) => ({
        tipo: l.tipo,
        entidade: l.entidade,
        chave: String(l.chave),
        dados: l.dados ?? {},
        hash: l.hash ?? null,
        ativo: l.ativo ?? true,
        expira_em: l.expira_em ?? null,
      }))
      await chamar(`/${TABELA}${consulta({ on_conflict: 'tipo,entidade,chave', columns: COLUNAS_UPSERT.join(',') })}`, {
        metodo: 'POST',
        cabecalhos: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        corpo,
      })
    },

    /** UPDATE por filtro (PATCH). */
    async update(filtros, valores) {
      await chamar(`/${TABELA}${consulta(filtros)}`, {
        metodo: 'PATCH', cabecalhos: { Prefer: 'return=minimal' }, corpo: valores,
      })
    },

    /** DELETE por filtro (o PostgREST recusa DELETE sem filtro). */
    async del(filtros) {
      await chamar(`/${TABELA}${consulta(filtros)}`, { metodo: 'DELETE', cabecalhos: { Prefer: 'return=minimal' } })
    },

    /** Chama uma função SQL. Sem retentativa: algumas não são idempotentes (salvar_acao). */
    async rpc(nome, args = {}) {
      const r = await chamar(`/rpc/${encodeURIComponent(nome)}`, { metodo: 'POST', corpo: args, retentar: false })
      return json(r.texto)
    },
  }
  return rest
}

let singleton
let singletonChave = ''

/** Cliente compartilhado, criado a partir do ambiente (null se não configurado). */
export function getSupabaseRest(env = process.env) {
  if (!supabaseConfigured(env)) return null
  const assinatura = `${env.SUPABASE_URL}|${env.SUPABASE_SECRET_KEY}`
  if (!singleton || singletonChave !== assinatura) {
    singleton = createSupabaseRest({ url: env.SUPABASE_URL, chave: env.SUPABASE_SECRET_KEY })
    singletonChave = assinatura
  }
  return singleton
}
