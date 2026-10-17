/**
 * Armazenamento da sincronização em Postgres (Neon, tabela "DASHBOARD-GRONNER-CRM"),
 * com a mesma interface de createSyncStore (server/syncStore.js, Upstash) e de
 * createSupabaseSyncStore. Mapeamento das estruturas, travas e funções SQL:
 * docs/SUPABASE-DASHBOARD.md e neon/dashboard-gronner-crm.sql.
 *
 * Híbrido: leituras e upserts de dados por SQL simples (o hash canônico continua em
 * JavaScript); funções SQL só onde há atomicidade ou relógio do servidor em jogo
 * (travar, liberar, finalizar, limpar).
 */
import crypto from 'node:crypto'
import {
  assertEntity, canonicalHash, enriquecerComHistorico, etapaDoRegistro, historicoComMudanca,
  normalizarItens, validateBatch, validateChanges, validateFinalize,
} from './syncStore.js'
import { jsonb, TABELA_SQL } from './pgSql.js'

const VALIDADE_MS = 2 * 24 * 60 * 60 * 1000
const TRAVA_ATIVIDADE_S = 4 * 60
const TRAVA_LOTE_S = 120
const LIMPEZA_INTERVALO_MS = 60 * 60 * 1000

const skipped = (input) => ({ ok: true, skipped: true, reason: 'sync_locked', runId: input.runId, entity: input.entity })
const conflito = (mensagem) => Object.assign(new Error(mensagem), { status: 409 })

/**
 * @param pg cliente de server/pgSql.js
 * @param opcoes.agora relógio injetável (ms) para validade dos resultados
 */
export function createPgSyncStore(pg, { agora = () => Date.now() } = {}) {
  if (!pg) {
    const indisponivel = async () => { throw Object.assign(new Error('Armazenamento de sincronização não configurado'), { status: 503 }) }
    return { upsertChanges: indisponivel, cursor: indisponivel, upsertBatch: indisponivel, finalize: indisponivel, load: indisponivel, status: indisponivel }
  }

  const iso = (ms) => new Date(ms).toISOString()
  const expiraEm = () => iso(agora() + VALIDADE_MS)
  const memoriaLoad = new Map() // entidade -> { versao, valor }
  let ultimaLimpeza = 0

  /** Lê o `dados` de uma linha (ou null). Itens com validade só valem enquanto não expiram. */
  async function ler(tipo, entidade, chave, { comValidade = false } = {}) {
    const linhas = comValidade
      ? await pg.rows(
        `select dados from ${TABELA_SQL} where tipo = $1 and entidade = $2 and chave = $3 and (expira_em is null or expira_em > $4::timestamptz)`,
        [tipo, entidade, chave, iso(agora())],
      )
      : await pg.rows(`select dados from ${TABELA_SQL} where tipo = $1 and entidade = $2 and chave = $3`, [tipo, entidade, chave])
    return jsonb(linhas[0]?.dados) ?? null
  }

  const travar = (entidade, chave, dono, segundos) => pg.funcao('dashboard_crm_travar', [
    [entidade, 'text'], [chave, 'text'], [dono, 'text'], [segundos, 'integer'],
  ])
  const liberar = (entidade, chave, dono) => pg.funcao('dashboard_crm_liberar', [
    [entidade, 'text'], [chave, 'text'], [dono, 'text'],
  ]).catch(() => {})

  /** Limpeza oportunista dos itens vencidos (no máximo 1 vez por hora por instância). */
  function limparSePreciso() {
    if (agora() - ultimaLimpeza < LIMPEZA_INTERVALO_MS) return
    ultimaLimpeza = agora()
    pg.funcao('dashboard_crm_limpar_expirados').catch(() => {})
  }

  /**
   * Compara os registros novos com os guardados (só hash, ativo e a etapa: nunca
   * baixa o registro inteiro) e prepara as linhas de histórico de status.
   */
  async function analisar(entity, normalized, ids, runStartedAt) {
    const hashes = normalized.map(canonicalHash)
    const campos = entity === 'projetos' ? ", dados->'etapa' as etapa, dados->'status' as status" : ''
    const linhas = ids.length
      ? await pg.rows(
        `select chave, hash, ativo${campos} from ${TABELA_SQL}
          where tipo = 'registro' and entidade = $1 and chave in (select jsonb_array_elements_text($2::jsonb))`,
        [entity, JSON.stringify(ids)],
      )
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
      const antigos = await pg.rows(
        `select chave, dados from ${TABELA_SQL}
          where tipo = 'historico' and entidade = $1 and chave in (select jsonb_array_elements_text($2::jsonb))`,
        [entity, JSON.stringify(idsMudaram)],
      )
      const porId = new Map(antigos.map((linha) => [linha.chave, jsonb(linha.dados)]))
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
        await pg.upsert(linhas) // uma instrução = uma transação
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
        await pg.upsert([
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
      return pg.funcao('dashboard_crm_finalizar', [
        [input.entity, 'text'],
        [input.runId, 'text'],
        [input.runStartedAt, 'text'],
        [input.batchCount, 'integer'],
        [input.expectedTotal, 'integer'],
      ])
    },

    async load(entity) {
      assertEntity(entity)
      // Verificação barata de versão (uma consulta, poucos bytes): se nada mudou desde a última leitura,
      // reaproveita a carga já em memória em vez de baixar de novo todos os registros.
      const [verificacao] = await pg.rows(
        `select (select dados from ${TABELA_SQL} where tipo = 'estado' and entidade = $1 and chave = 'current') as manifesto,
                (select max(atualizado_em)::text from ${TABELA_SQL} where tipo = 'registro' and entidade = $1) as ultimo_registro,
                (select max(atualizado_em)::text from ${TABELA_SQL} where tipo = 'historico' and entidade = $1 and $2::boolean) as ultimo_historico`,
        [entity, entity === 'projetos'],
      )
      const manifesto = jsonb(verificacao?.manifesto)
      if (!manifesto) return null
      const versao = [manifesto.runId, manifesto.finishedAt, verificacao.ultimo_registro, verificacao.ultimo_historico].join('|')
      const guardado = memoriaLoad.get(entity)
      if (guardado?.versao === versao) return guardado.valor

      const linhas = await pg.todas('registro', entity, { ativos: true })
      const historico = entity === 'projetos' ? await pg.todas('historico', entity) : []
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
