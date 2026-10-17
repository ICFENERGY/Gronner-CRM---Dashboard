/**
 * Armazenamento da Engenharia no Supabase (tabela "DASHBOARD-GRONNER-CRM",
 * entidade 'engenharia'), com a mesma interface do store em Redis/memória de
 * server/engenhariaStore.js.
 *
 * - ação ativa do card:   tipo 'acao',     chave = card
 * - histórico (até 20):   tipo 'acao_log', chave = card, dados = array (mais nova primeiro)
 * - prazos por marco:     tipo 'config',   chave = 'prazos'
 * A ação e o histórico são gravados juntos, e de forma atômica, pela função
 * dashboard_crm_salvar_acao.
 */
const ENTIDADE = 'engenharia'

export function createSupabaseEngenhariaStore(rest) {
  const filtro = (tipo, chave) => ({ tipo: `eq.${tipo}`, entidade: `eq.${ENTIDADE}`, chave: `eq.${chave}`, select: 'dados' })

  return {
    async listarAcoes() {
      const linhas = await rest.getAll({ tipo: 'eq.acao', entidade: `eq.${ENTIDADE}`, select: 'chave,dados' })
      return Object.fromEntries(linhas.map((linha) => [linha.chave, linha.dados]))
    },
    async salvarAcao(id, registro) {
      await rest.rpc('dashboard_crm_salvar_acao', { p_card: String(id), p_registro: registro })
      return registro
    },
    async obterAcao(id) {
      return (await rest.get(filtro('acao', String(id))))[0]?.dados ?? null
    },
    async historico(id) {
      const dados = (await rest.get(filtro('acao_log', String(id))))[0]?.dados
      return Array.isArray(dados) ? dados : []
    },
    async obterConfig() {
      return (await rest.get(filtro('config', 'prazos')))[0]?.dados ?? null
    },
    async salvarConfig(config) {
      await rest.upsert([{ tipo: 'config', entidade: ENTIDADE, chave: 'prazos', dados: config }])
      return config
    },
  }
}
