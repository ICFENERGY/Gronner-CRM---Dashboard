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

export const TABELA = 'DASHBOARD-GRONNER-CRM'
export const TABELA_SQL = `public."${TABELA}"`
const TAMANHO_PAGINA = 1000
const TIMEOUT_MS = 15000
const TENTATIVAS = 3

/** String de conexão: NEON_DATABASE_URL (tem prioridade; a integração da Vercel pode gerir DATABASE_URL de outro banco) ou DATABASE_URL. */
export function pgUrl(env = process.env) {
  return String(env.NEON_DATABASE_URL || env.DATABASE_URL || '').trim()
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
  const transitorio = !codigo || /^(08|53|57|58|40)/.test(codigo)
  return erroIndisponivel(codigo ? `SQLSTATE ${codigo}` : 'rede', transitorio)
}

/** Executor padrão: driver HTTP do Neon. */
function executorNeon(url) {
  const sql = neon(url)
  return async (texto, parametros, { signal } = {}) => sql.query(texto, parametros, { fetchOptions: { signal } })
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
    executor ??= executorNeon(url)
    const tentativas = retentar ? TENTATIVAS : 1
    let ultimo
    for (let n = 1; n <= tentativas; n += 1) {
      try {
        const resultado = await executor(texto, parametros, { signal: AbortSignal.timeout(timeoutMs) })
        return Array.isArray(resultado) ? resultado : resultado?.rows ?? []
      } catch (err) {
        ultimo = converterErro(err)
        if (!ultimo.retentavel) throw ultimo
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
     * Chama uma função dashboard_crm_*: `select public.nome($1::tipo, ...) as r`.
     * `args` = lista de [valor, tipo SQL]. Sem retentativa: algumas não são idempotentes (salvar_acao).
     */
    async funcao(nome, args = []) {
      if (!/^dashboard_crm_[a-z_]+$/.test(nome)) throw erroIndisponivel('função inválida', false)
      const lista = args.map(([, tipo], i) => `$${i + 1}::${tipo}`).join(', ')
      const linhas = await rows(`select public.${nome}(${lista}) as r`, args.map(([valor]) => valor), { retentar: false })
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
