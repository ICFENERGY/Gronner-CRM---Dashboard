/**
 * Armazenamento da sincronização no Supabase (tabela "DASHBOARD-GRONNER-CRM"),
 * com a mesma interface de createSyncStore (server/syncStore.js, Upstash).
 * Mapeamento das estruturas, travas e funções SQL: docs/SUPABASE-DASHBOARD.md e
 * supabase/dashboard-gronner-crm.sql.
 *
 * Híbrido: leituras e upserts de dados por PostgREST simples (o hash canônico
 * continua em JavaScript); funções SQL só onde há atomicidade ou relógio do
 * servidor em jogo (travar, liberar, finalizar, limpar).
 */
import crypto from 'node:crypto'
import {
  assertEntity, canonicalHash, enriquecerComHistorico, etapaDoRegistro, historicoComMudanca,
  normalizarItens, validateBatch, validateChanges, validateFinalize,
} from './syncStore.js'

const VALIDADE_MS = 2 * 24 * 60 * 60 * 1000
const TRAVA_ATIVIDADE_S = 4 * 60
const TRAVA_LOTE_S = 120
const LIMPEZA_INTERVALO_MS = 60 * 60 * 1000

const skipped = (input) => ({ ok: true, skipped: true, reason: 'sync_locked', runId: input.runId, entity: input.entity })
const conflito = (mensagem) => Object.assign(new Error(mensagem), { status: 409 })

/**
 * @param rest cliente de server/supabaseRest.js
 * @param opcoes.agora relógio injetável (ms) para validade dos resultados
 */
export function createSupabaseSyncStore(rest, { agora = () => Date.now() } = {}) {
  if (!rest) {
    const indisponivel = async () => { throw Object.assign(new Error('Armazenamento de sincronização não configurado'), { status: 503 }) }
    return { upsertChanges: indisponivel, cursor: indisponivel, upsertBatch: indisponivel, finalize: indisponivel, load: indisponivel, status: indisponivel }
  }

  const iso = (ms) => new Date(ms).toISOString()
  const expiraEm = () => iso(agora() + VALIDADE_MS)
  const filtroValidade = () => ({ or: `(expira_em.is.null,expira_em.gt.${iso(agora())})` })
  const memoriaLoad = new Map() // entidade -> { versao, valor }
  let ultimaLimpeza = 0

  /** Lê o `dados` de uma linha (ou null). Itens com validade só valem enquanto não expiram. */
  async function ler(tipo, entidade, chave, { comValidade = false } = {}) {
    const linhas = await rest.get({
      tipo: `eq.${tipo}`, entidade: `eq.${entidade}`, chave: `eq.${chave}`, select: 'dados',
      ...(comValidade ? filtroValidade() : {}),
    })
    return linhas[0]?.dados ?? null
  }

  const travar = (entidade, chave, dono, segundos) => rest.rpc('dashboard_crm_travar', {
    p_entidade: entidade, p_chave: chave, p_dono: dono, p_segundos: segundos,
  })
  const liberar = (entidade, chave, dono) => rest.rpc('dashboard_crm_liberar', {
    p_entidade: entidade, p_chave: chave, p_dono: dono,
  }).catch(() => {})

  /** Limpeza oportunista dos itens vencidos (no máximo 1 vez por hora por instância). */
  function limparSePreciso() {
    if (agora() - ultimaLimpeza < LIMPEZA_INTERVALO_MS) return
    ultimaLimpeza = agora()
    rest.rpc('dashboard_crm_limpar_expirados').catch(() => {})
  }

  /**
   * Compara os registros novos com os guardados (só hash, ativo e a etapa: nunca
   * baixa o registro inteiro) e prepara as linhas de histórico de status.
   */
  async function analisar(entity, normalized, ids, runStartedAt) {
    const hashes = normalized.map(canonicalHash)
    const campos = entity === 'projetos' ? 'chave,hash,ativo,etapa:dados->etapa,status:dados->status' : 'chave,hash,ativo'
    const linhas = ids.length
      ? await rest.get({ tipo: 'eq.registro', entidade: `eq.${entity}`, chave: `in.(${ids.join(',')})`, select: campos })
      : []
    const existentes = new Map(linhas.map((linha) => [linha.chave, linha]))
    let inserted = 0; let updated = 0; let unchanged = 0
    const mudaramEtapa = []
    normalized.forEach((record, index) => {
      const atual = existentes.get(ids[index])
      if (atual?.hash == null) inserted += 1
      else if (atual.hash === hashes[index]) unchanged += 1
      else updated += 1
      if (entity === 'projetos' && atual?.hash != null && etapaDoRegistro(atual) !== etapaDoRegistro(record)) mudaramEtapa.push(index)
    })

    const historico = []
    if (mudaramEtapa.length) {
      const idsMudaram = mudaramEtapa.map((index) => ids[index])
      const antigos = await rest.get({ tipo: 'eq.historico', entidade: `eq.${entity}`, chave: `in.(${idsMudaram.join(',')})`, select: 'chave,dados' })
      const porId = new Map(antigos.map((linha) => [linha.chave, linha.dados]))
      for (const index of mudaramEtapa) {
        const id = ids[index]
        historico.push({
          tipo: 'historico', entidade: entity, chave: id,
          dados: historicoComMudanca(porId.get(id), existentes.get(id), normalized[index], runStartedAt),
        })
      }
    }
    return { hashes, existentes, inserted, updated, unchanged, historico }
  }

  return {
    async upsertChanges(input, normalize) {
      validateChanges(input)
      const resultadoChave = `changes:${input.runId}`
      const anterior = await ler('resultado', input.entity, resultadoChave, { comValidade: true })
      if (anterior) return anterior

      const dono = `changes:${input.runId}`
      const trava = await travar(input.entity, 'atividade', dono, TRAVA_ATIVIDADE_S)
      if (!trava?.ok) return skipped(input)

      try {
        const { normalized, ids } = normalizarItens(input.items, normalize)
        const analise = await analisar(input.entity, normalized, ids, input.runStartedAt)
        const [cursorGuardado, statusAnterior] = await Promise.all([
          input.nextCursor ? null : ler('estado', input.entity, 'cursor'),
          ler('estado', input.entity, 'status'),
        ])
        const cursor = input.nextCursor ?? cursorGuardado?.cursor ?? null
        const finishedAt = iso(agora())
        const result = {
          ok: true, runId: input.runId, entity: input.entity, received: normalized.length,
          inserted: analise.inserted, updated: analise.updated, unchanged: analise.unchanged,
          skipped: false, finishedAt, nextCursor: cursor,
        }

        const linhas = []
        normalized.forEach((record, index) => {
          const atual = analise.existentes.get(ids[index])
          // Registro igual e já ativo não precisa ser regravado (poupa escrita e o carimbo de atualização).
          if (atual && atual.hash === analise.hashes[index] && atual.ativo) return
          linhas.push({ tipo: 'registro', entidade: input.entity, chave: ids[index], dados: record, hash: analise.hashes[index], ativo: true })
        })
        linhas.push(...analise.historico)
        if (input.nextCursor) linhas.push({ tipo: 'estado', entidade: input.entity, chave: 'cursor', dados: { cursor: input.nextCursor } })
        linhas.push({
          tipo: 'estado', entidade: input.entity, chave: 'status',
          dados: {
            ...(statusAnterior || {}), entity: input.entity, lastSuccessfulRunAt: finishedAt, sourceUpdatedAt: finishedAt,
            mode: 'changes', inserted: analise.inserted, updated: analise.updated, unchanged: analise.unchanged,
          },
        })
        linhas.push({ tipo: 'resultado', entidade: input.entity, chave: resultadoChave, dados: result, expira_em: expiraEm() })
        await rest.upsert(linhas) // uma requisição = uma transação
        limparSePreciso()
        return result
      } finally {
        await liberar(input.entity, 'atividade', dono)
      }
    },

    async cursor(entity) {
      assertEntity(entity)
      const dados = await ler('estado', entity, 'cursor')
      return dados?.cursor ?? null
    },

    async upsertBatch(input, normalize) {
      validateBatch(input)
      const loteChave = `${input.runId}:${input.batchIndex}`
      const resultadoChave = `lote:${loteChave}`
      // Repetição de um lote já processado devolve o mesmo resultado, sem tocar nas travas.
      const anterior = await ler('resultado', input.entity, resultadoChave, { comValidade: true })
      if (anterior) return anterior

      const donoCarga = `full:${input.runId}`
      const atividade = await travar(input.entity, 'atividade', donoCarga, TRAVA_ATIVIDADE_S)
      if (!atividade?.ok) {
        throw conflito(String(atividade?.dono ?? '').startsWith('changes:') ? 'Sincronização incremental em andamento' : 'Outra sincronização está em andamento')
      }

      const donoLote = crypto.randomUUID()
      const travaLote = await travar(input.entity, `lote:${loteChave}`, donoLote, TRAVA_LOTE_S)
      if (!travaLote?.ok) throw conflito('Lote já está sendo processado')

      try {
        const { normalized, ids } = normalizarItens(input.items, normalize)
        const analise = await analisar(input.entity, normalized, ids, input.runStartedAt)
        const result = {
          ok: true, runId: input.runId, entity: input.entity, batchIndex: input.batchIndex,
          expectedTotal: input.expectedTotal, received: normalized.length,
          inserted: analise.inserted, updated: analise.updated, unchanged: analise.unchanged,
        }
        const batchData = {
          runId: input.runId,
          runStartedAt: input.runStartedAt,
          entity: input.entity,
          batchIndex: input.batchIndex,
          batchCount: input.batchCount,
          expectedTotal: input.expectedTotal,
          items: normalized,
          hashes: Object.fromEntries(ids.map((id, index) => [id, analise.hashes[index]])),
        }
        await rest.upsert([
          { tipo: 'lote', entidade: input.entity, chave: loteChave, dados: batchData, expira_em: expiraEm() },
          { tipo: 'resultado', entidade: input.entity, chave: resultadoChave, dados: result, expira_em: expiraEm() },
          ...analise.historico,
        ])
        return result
      } finally {
        await liberar(input.entity, `lote:${loteChave}`, donoLote)
      }
    },

    async finalize(input) {
      validateFinalize(input)
      // Validação, publicação, soft delete, manifesto e limpeza dos lotes: tudo numa transação no banco.
      return rest.rpc('dashboard_crm_finalizar', {
        p_entidade: input.entity,
        p_run_id: input.runId,
        p_run_started_at: input.runStartedAt,
        p_batch_count: input.batchCount,
        p_expected_total: input.expectedTotal,
      })
    },

    async load(entity) {
      assertEntity(entity)
      const filtroEntidade = { entidade: `eq.${entity}` }
      // Verificação barata de versão (poucos bytes): se nada mudou desde a última leitura, reaproveita
      // a carga já em memória em vez de baixar de novo todos os registros.
      const [manifesto, ultimoRegistro, ultimoHistorico] = await Promise.all([
        ler('estado', entity, 'current'),
        rest.get({ tipo: 'eq.registro', ...filtroEntidade, select: 'atualizado_em', order: 'atualizado_em.desc', limit: 1 }),
        entity === 'projetos'
          ? rest.get({ tipo: 'eq.historico', ...filtroEntidade, select: 'atualizado_em', order: 'atualizado_em.desc', limit: 1 })
          : [],
      ])
      if (!manifesto) return null
      const versao = [manifesto.runId, manifesto.finishedAt, ultimoRegistro[0]?.atualizado_em, ultimoHistorico[0]?.atualizado_em].join('|')
      const guardado = memoriaLoad.get(entity)
      if (guardado?.versao === versao) return guardado.valor

      const linhas = await rest.getAll({ tipo: 'eq.registro', ...filtroEntidade, ativo: 'is.true', select: 'chave,dados' })
      const historico = entity === 'projetos'
        ? await rest.getAll({ tipo: 'eq.historico', ...filtroEntidade, select: 'chave,dados' })
        : []
      const items = linhas.map((linha) => linha.dados).sort((a, b) => Number(a.id) - Number(b.id))
      const porId = Object.fromEntries(historico.map((linha) => [linha.chave, linha.dados]))
      const withHistory = enriquecerComHistorico(items, porId)
      const valor = { items: withHistory, totalItems: withHistory.length, sync: manifesto }
      memoriaLoad.set(entity, { versao, valor })
      return valor
    },

    async status(entity) {
      assertEntity(entity)
      return ler('estado', entity, 'status')
    },
  }
}
