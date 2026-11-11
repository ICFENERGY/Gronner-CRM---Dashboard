/**
 * Camada mínima de consulta ao Postgres (Neon) para a tabela única
 * "DASHBOARD-GRONNER-CRM". Usa o driver serverless do Neon (HTTP, uma requisição
 * por consulta), ideal para funções da Vercel. Desenho em docs/SUPABASE-DASHBOARD.md
 * e neon/dashboard-gronner-crm.sql.
 *
 * A mesma interface do cliente PostgREST (server/supabaseRest.js) onde faz sentido:
 * `todas` (leitura paginada por chave), `upsert` e `funcao`; mais `rows` para SQL livre.
 *
 * Erros:
 * - erro de negócio das funções (SQLSTATE PT409/PT400) vira Error com `status` e a
 *   `message` do banco (as rotas já repassam mensagens de status < 500);
 * - qualquer outra falha (rede, timeout, SQL, permissão) vira status 503 com mensagem
 *   genérica. A string de conexão nunca entra em mensagem nem em log.
 *
 * Testes injetam `executar(texto, parametros, { signal })` (por exemplo, o PGlite).
 */
import { neon } from '@neondatabase/serverless'
import { CA_SUPABASE } from './dbCa.js'

export const TABELA = 'DASHBOARD-GRONNER-CRM'

/**
 * Schema onde ficam a tabela e as funções dashboard_crm_* (DB_SCHEMA; padrão public).
 * Só letras minúsculas, números e _ : o nome entra em SQL (sempre entre aspas), então é validado.
 */
export function schemaDoAmbiente(env = process.env) {
  const nome = String(env.DB_SCHEMA ?? '').trim() || 'public'
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(nome)) throw new Error('DB_SCHEMA inválido: use só letras minúsculas, números e _ (máx. 63).')
  return nome
}

/** Tabela qualificada, ex.: "groner_painel"."DASHBOARD-GRONNER-CRM". Resolvida a cada uso (o .env pode carregar depois deste módulo). */
export const TABELA_SQL = { toString: () => `"${schemaDoAmbiente()}"."${TABELA}"` }
const TAMANHO_PAGINA = 1000
const TIMEOUT_MS = 15000
const TENTATIVAS = 3

/**
 * String de conexão: SUPABASE_DB_URL (Postgres do Supabase, tem prioridade), NEON_DATABASE_URL (a integração da Vercel
 * pode gerir DATABASE_URL de outro banco) ou DATABASE_URL.
 */
export function pgUrl(env = process.env) {
  return String(env.SUPABASE_DB_URL || env.NEON_DATABASE_URL || env.DATABASE_URL || '').trim()
}

export function pgConfigured(env = process.env) {
  return Boolean(pgUrl(env))
}

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function erroIndisponivel(causa, retentavel = true) {
  return Object.assign(new Error('Armazenamento de sincronização indisponível'), { status: 503, causa, retentavel })
}

/** SQLSTATE PT409 -> status 409 com a mensagem do banco; o resto vira 503 genérico (só o código SQLSTATE vai para a causa). */
function converterErro(err) {
  if (err && 'retentavel' in err && 'status' in err) return err
  const codigo = String(err?.code ?? '')
  const negocio = /^PT(\d{3})$/.exec(codigo)
  if (negocio && err?.message) return Object.assign(new Error(String(err.message)), { status: Number(negocio[1]), retentavel: false })
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return erroIndisponivel('timeout')
  // 08xxx/57xxx/53xxx: conexão, desligamento, falta de recurso -> vale repetir; erro de SQL/permissão não.
  const transitorio = !codigo || /^(08|53|57|58|40)/.test(codigo) || /^E[A-Z]+$/.test(codigo)
  return erroIndisponivel(codigo ? `SQLSTATE ${codigo}` : 'rede', transitorio)
}

/** Executor da Neon: driver HTTP. */
function executorNeon(url) {
  const sql = neon(url)
  return async (texto, parametros, { signal } = {}) => sql.query(texto, parametros, { fetchOptions: { signal } })
}

/** Hosts da Neon usam o driver HTTP; qualquer outro Postgres (Supabase, etc.) usa o driver padrão. */
export const ehNeon = (url) => /(^|\.)neon\.tech(:|\/|$)/i.test(new URL(url).host + '/')

/**
 * Certificado da CA do Postgres (PEM): DB_CA_CERT (o texto do certificado) tem prioridade; senão o da CA raiz do Supabase,
 * embutido em server/dbCa.js. É um certificado PÚBLICO, usado para VALIDAR o servidor (a validação nunca é desligada).
 */
function certificadoCa(env = process.env) {
  if (env.DB_CA_CERT) return String(env.DB_CA_CERT).replace(/\\n/g, '\n')
  return CA_SUPABASE
}

/**
 * Executor do Postgres comum (driver `pg`), carregado só quando usado. Um pool pequeno por processo:
 * em função serverless cada instância abre poucas conexões, e o pooler do Supabase (Supavisor) reaproveita.
 * A conexão é cifrada e o certificado do servidor é SEMPRE validado (rejectUnauthorized ligado).
 */
function executorPg(url) {
  let pool
  return async (texto, parametros, { signal } = {}) => {
    if (!pool) {
      const { default: pg } = await import('pg')
      const limpa = new URL(url)
      limpa.searchParams.delete('sslmode') // a opção ssl abaixo manda (e a validação fica ligada)
      pool = new pg.Pool({
        connectionString: limpa.toString(), ssl: { rejectUnauthorized: true, ca: certificadoCa() },
        max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000, query_timeout: TIMEOUT_MS,
      })
      pool.on('error', () => { /* conexão ociosa derrubada pelo servidor: o pool abre outra na próxima consulta */ })
    }
    const consulta = pool.query(texto, parametros)
    const resposta = signal
      ? await Promise.race([consulta, new Promise((_, rejeitar) => signal.addEventListener('abort', () => rejeitar(Object.assign(new Error('timeout'), { name: 'TimeoutError' })), { once: true }))])
      : await consulta
    return resposta.rows
  }
}

function executorPara(url) {
  return ehNeon(url) ? executorNeon(url) : executorPg(url)
}

/** `dados` pode chegar como texto em drivers que não convertem jsonb. */
export const jsonb = (valor) => (typeof valor === 'string' ? JSON.parse(valor) : valor ?? null)

/**
 * @param opcoes.url string de conexão (DATABASE_URL)
 * @param opcoes.executar executor injetável (testes): async (texto, parametros, { signal }) => linhas
 * @param opcoes.tamanhoPagina linhas por página em `todas`
 * @param opcoes.esperaRetentativaMs base do backoff entre tentativas
 * @param opcoes.log função de log (padrão console.error)
 */
export function createPgSql({
  url, executar, timeoutMs = TIMEOUT_MS, tamanhoPagina = TAMANHO_PAGINA, esperaRetentativaMs = 100, log = console.error,
} = {}) {
  if (!executar && !url) throw erroIndisponivel('sem configuração')
  let executor = executar

  /** Executa um SQL parametrizado e devolve as linhas. `retentar` só para consultas idempotentes. */
  async function rows(texto, parametros = [], { retentar = true } = {}) {
    executor ??= executorPara(url)
    const tentativas = retentar ? TENTATIVAS : 1
    let ultimo
    for (let n = 1; n <= tentativas; n += 1) {
      try {
        const resultado = await executor(texto, parametros, { signal: AbortSignal.timeout(timeoutMs) })
        return Array.isArray(resultado) ? resultado : resultado?.rows ?? []
      } catch (err) {
        ultimo = converterErro(err)
        if (!ultimo.retentavel) {
          log('[postgres] erro sem nova tentativa:', ultimo.causa ?? ultimo.message) // só o código do erro, nunca a conexão
          throw ultimo
        }
      }
      if (n < tentativas) await dormir(esperaRetentativaMs * 2 ** (n - 1))
    }
    log('[postgres] falha após tentativas:', ultimo?.causa ?? ultimo?.message)
    throw ultimo
  }

  const pg = {
    rows,

    /**
     * Todas as linhas de um tipo/entidade (colunas chave,dados), paginadas por chave (keyset):
     * estável mesmo com escrita entre páginas. `ativos` restringe aos registros ativos.
     */
    async todas(tipo, entidade, { ativos = false } = {}) {
      const saida = []
      const filtroAtivo = ativos ? ' and ativo' : ''
      let ultima = null
      for (;;) {
        const pagina = ultima == null
          ? await rows(
            `select chave, dados from ${TABELA_SQL} where tipo = $1 and entidade = $2${filtroAtivo} order by chave asc limit $3`,
            [tipo, entidade, tamanhoPagina],
          )
          : await rows(
            `select chave, dados from ${TABELA_SQL} where tipo = $1 and entidade = $2${filtroAtivo} and chave > $3 order by chave asc limit $4`,
            [tipo, entidade, ultima, tamanhoPagina],
          )
        saida.push(...pagina.map((linha) => ({ chave: linha.chave, dados: jsonb(linha.dados) })))
        if (pagina.length < tamanhoPagina) return saida
        ultima = pagina[pagina.length - 1].chave
      }
    },

    /** Upsert em lote numa única instrução (= uma transação). Todas as colunas vão em todas as linhas. */
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
      await rows(
        `insert into ${TABELA_SQL} as t (tipo, entidade, chave, dados, hash, ativo, expira_em)
         select x.tipo, x.entidade, x.chave, x.dados, x.hash, x.ativo, x.expira_em
           from jsonb_to_recordset($1::jsonb) as x(tipo text, entidade text, chave text, dados jsonb, hash text, ativo boolean, expira_em timestamptz)
         on conflict (tipo, entidade, chave) do update
            set dados = excluded.dados, hash = excluded.hash, ativo = excluded.ativo, expira_em = excluded.expira_em`,
        [JSON.stringify(corpo)],
      )
    },

    /**
     * Chama uma função dashboard_crm_* do schema configurado: `select "schema".nome($1::tipo, ...) as r`.
     * `args` = lista de [valor, tipo SQL]. Sem retentativa: algumas não são idempotentes (salvar_acao).
     */
    async funcao(nome, args = []) {
      if (!/^dashboard_crm_[a-z_]+$/.test(nome)) throw erroIndisponivel('função inválida', false)
      const lista = args.map(([, tipo], i) => `$${i + 1}::${tipo}`).join(', ')
      const linhas = await rows(`select "${schemaDoAmbiente()}".${nome}(${lista}) as r`, args.map(([valor]) => valor), { retentar: false })
      return jsonb(linhas[0]?.r)
    },
  }
  return pg
}

let singleton
let singletonUrl = ''

/** Cliente compartilhado, criado a partir do ambiente (null se não configurado). */
export function getPgSql(env = process.env) {
  const url = pgUrl(env)
  if (!url) return null
  if (!singleton || singletonUrl !== url) {
    singleton = createPgSql({ url })
    singletonUrl = url
  }
  return singleton
}
