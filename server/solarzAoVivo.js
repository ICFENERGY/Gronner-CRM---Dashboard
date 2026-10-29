/**
 * Plano B do MCP da SolarZ: monta os mesmos dados que a carga diária guarda no Postgres, direto da Open API,
 * para o MCP funcionar quando o banco está indisponível ou ainda vazio. Resultado em memória por CACHE_MS.
 * Usinas premium recebem energia (ano e anterior) e desempenho, com concorrência baixa e orçamento de tempo
 * (a função da Vercel tem 60 s); as demais ficam só com os dados da listagem.
 */
import { mapUsina } from './mappers.js'
import { agruparTickets, agruparUnidades, mesAtualBrasilia, normalizarMeses, solarzRegistroParaArmazenar } from './solarzMetricas.js'

export const CACHE_MS = 15 * 60 * 1000
export const ORCAMENTO_MS = 30000
const CONCORRENCIA = 4

let cache = null

export function limparCacheAoVivo() { cache = null }

/**
 * @param s cliente da SolarZ (server/solarzClient.js)
 * @returns dados no formato de lerSolarzArmazenada, mais `fonte`
 */
export async function montarAoVivo(s, { agora = () => Date.now() } = {}) {
  if (cache && agora() - cache.em < CACHE_MS) return cache.dados
  const inicio = agora()
  const hoje = mesAtualBrasilia(new Date(inicio))
  const tentar = async (fn) => { try { return await fn() } catch { return null } }

  const lista = await s.solarzListarUsinasCompleto()
  const usinas = (Array.isArray(lista?.itens) ? lista.itens : []).filter((u) => u?.id != null).map(mapUsina)
  const [simplesR, ticketsR, unidadesR] = await Promise.all([
    tentar(() => s.solarzListarSimples()),
    tentar(() => s.solarzListarTicketsAbertos({ prazoMs: 15000 })),
    tentar(() => s.solarzListarUnidades({ prazoMs: 15000 })),
  ])
  const simples = simplesR ? { usinas: simplesR.itens.filter((u) => u?.id != null).map((u) => ({ id: u.id, nome: u.denominacao ?? null, premium: Boolean(u.premium), arquivada: Boolean(u.arquivada) })) } : null
  const premium = new Set((simples?.usinas ?? []).filter((u) => u.premium).map((u) => String(u.id)))

  const registros = new Map(usinas.map((u) => [String(u.id), solarzRegistroParaArmazenar(u, {}, new Date(inicio))]))
  const fila = usinas.filter((u) => premium.has(String(u.id)))
  let proximo = 0
  async function trabalhador() {
    while (agora() - inicio < ORCAMENTO_MS) {
      const u = fila[proximo++]
      if (!u) return
      const [a, b, d] = await Promise.all([
        tentar(() => s.solarzEnergiaAno(u.id, hoje.ano)),
        tentar(() => s.solarzEnergiaAno(u.id, hoje.ano - 1)),
        tentar(() => s.solarzDesempenho(u.id)),
      ])
      if (!a && !b && !d) continue
      registros.set(String(u.id), solarzRegistroParaArmazenar(u, { meses: [...normalizarMeses(a), ...normalizarMeses(b)], desempenho: d }, new Date(inicio)))
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCORRENCIA, fila.length) }, trabalhador))

  const dados = {
    registros: [...registros.values()],
    simples,
    tickets: ticketsR ? { ...agruparTickets(ticketsR.itens), completo: ticketsR.completo !== false, atualizadoEm: new Date(inicio).toISOString() } : null,
    unidades: unidadesR ? { porUsina: agruparUnidades(unidadesR.itens) } : null,
    farolHistorico: [],
    estado: { concluidoEm: new Date(inicio).toISOString(), aoVivo: true, premiumSemDetalhe: fila.length - Math.min(proximo, fila.length) },
    fonte: 'direto da SolarZ (banco indisponível ou vazio); sem histórico do farol',
  }
  cache = { em: agora(), dados }
  return dados
}
