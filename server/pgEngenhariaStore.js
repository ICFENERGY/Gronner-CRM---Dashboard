/**
 * Armazenamento da Engenharia em Postgres (Neon, tabela "DASHBOARD-GRONNER-CRM",
 * entidade 'engenharia'), com a mesma interface do store em Redis/memória de
 * server/engenhariaStore.js.
 *
 * - ação ativa do card:   tipo 'acao',     chave = card
 * - histórico (até 20):   tipo 'acao_log', chave = card, dados = array (mais nova primeiro)
 * - prazos por marco:     tipo 'config',   chave = 'prazos'
 * A ação e o histórico são gravados juntos, e de forma atômica, pela função
 * dashboard_crm_salvar_acao.
 */
import { jsonb, TABELA_SQL } from './pgSql.js'

const ENTIDADE = 'engenharia'

export function createPgEngenhariaStore(pg) {
  const um = async (tipo, chave) => {
    const linhas = await pg.rows(
      `select dados from ${TABELA_SQL} where tipo = $1 and entidade = $2 and chave = $3`,
      [tipo, ENTIDADE, chave],
    )
    return jsonb(linhas[0]?.dados) ?? null
  }

  return {
    async listarAcoes() {
      const linhas = await pg.todas('acao', ENTIDADE)
      return Object.fromEntries(linhas.map((linha) => [linha.chave, linha.dados]))
    },
    async salvarAcao(id, registro) {
      await pg.funcao('dashboard_crm_salvar_acao', [[String(id), 'text'], [JSON.stringify(registro), 'jsonb']])
      return registro
    },
    async obterAcao(id) {
      return um('acao', String(id))
    },
    async historico(id) {
      const dados = await um('acao_log', String(id))
      return Array.isArray(dados) ? dados : []
    },
    async obterConfig() {
      return um('config', 'prazos')
    },
    async salvarConfig(config) {
      await pg.upsert([{ tipo: 'config', entidade: ENTIDADE, chave: 'prazos', dados: config }])
      return config
    },
  }
}
