/**
 * Métricas da Pieta calculadas sobre os detalhes guardados no banco (entidade
 * `pieta_projetos`). Funções puras: o relógio entra por parâmetro.
 */
export const ENTIDADE_PIETA = 'pieta_projetos'
const DIA_MS = 86400000
const FINALIZADO = 'Finalizado'
/** Estados finais: o projeto não está mais em andamento (a API real também traz "Cancelado"). */
export const ENCERRADOS = new Set([FINALIZADO, 'Cancelado'])

/** Data de hoje em Brasília (AAAA-MM-DD). */
export const hojeBrasilia = (agora = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora)

const arred = (n) => Math.round(n * 10) / 10
const media = (v) => (v.length ? arred(v.reduce((a, b) => a + b, 0) / v.length) : null)
function mediana(v) {
  if (!v.length) return null
  const o = [...v].sort((a, b) => a - b)
  const m = Math.floor(o.length / 2)
  return arred(o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2)
}
/** Dia AAAA-MM-DD. A API real manda o prazo (due_date) como "dd/mm/aaaa"; as demais datas, em ISO. */
export const dia = (s) => {
  if (typeof s !== 'string') return null
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s)
  return br ? `${br[3]}-${br[2]}-${br[1]}` : null
}
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DIA_MS)
const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

/** Tira a numeração ("1 - ") e números de medidor/UC/CPF das pendências, para agrupar as iguais e não guardar identificadores. */
export const normalizarPendencia = (p) => p.trim().replace(/^\d+\s*-\s*/, '').replace(/\d[\d.\-/]{2,}\d/g, '#').replace(/\s+/g, ' ')

/**
 * Reduz o retorno bruto da Pieta (resumo + detalhe) ao que o painel precisa.
 * NÃO guarda telefone, contato, pagamento nem detalhe do integrador.
 */
export function pietaRegistroParaArmazenar(resumoProjeto, detalhe, agora = new Date()) {
  const r = resumoProjeto || {}
  const d = detalhe || {}
  const changes = Array.isArray(d.changes) ? d.changes : []
  return {
    projectId: Number(r.project_id ?? d.project_id),
    status: r.status ?? d.status ?? null,
    clientName: r.client_name ?? d.client_name ?? null,
    power: num(r.power ?? d.power),
    powerDistributor: r.power_distributor ?? d.power_distributor ?? null,
    createdAt: r.created_at ?? d.created_at ?? null,
    lastStatusChange: r.last_status_change ?? d.last_status_change ?? null,
    dueDate: r.due_date ?? d.due_date ?? null,
    daysSinceCreated: num(d.days_since_created),
    tempoTotalDias: num(d.tempo_total_dias),
    medidorSubstituidoDate: d.medidor_substituido_date ?? null,
    statusTimeline: Array.isArray(d.status_timeline)
      ? d.status_timeline.map((s) => ({
        etapa: s.etapa, entrouEm: s.entrou_em ?? null, saiuEm: s.saiu_em ?? null, tempoNaEtapaDias: num(s.tempo_na_etapa_dias),
      }))
      : null,
    pendencies: Array.isArray(d.pendencies) ? d.pendencies.filter((p) => typeof p === 'string' && p.trim()).map(normalizarPendencia) : [],
    changesTotal: num(d.changes_total) ?? 0,
    changesQuantidade: changes.length,
    buscadoEm: agora.toISOString(),
  }
}

/** Dias na etapa: a atual (sem saída) usa o tempo corrente; as demais, o valor da API. */
function diasDaVisita(v, agora) {
  if (v.saiuEm == null) {
    const entrou = Date.parse(v.entrouEm)
    if (Number.isFinite(entrou)) return Math.max(0, Math.floor((agora.getTime() - entrou) / DIA_MS))
  }
  return num(v.tempoNaEtapaDias)
}

export function calcularMetricasPieta(registros, { agora = new Date() } = {}) {
  const hoje = hojeBrasilia(agora)
  const todos = registros.filter((r) => r && r.projectId != null)
  const finalizado = (r) => r.status === FINALIZADO
  const ativos = todos.filter((r) => !ENCERRADOS.has(r.status))

  const vencidos = ativos
    .filter((r) => dia(r.dueDate) && dia(r.dueDate) < hoje)
    .map((r) => ({ projectId: r.projectId, clientName: r.clientName ?? null, status: r.status, dueDate: dia(r.dueDate), diasAtraso: diasEntre(dia(r.dueDate), hoje) }))
    .sort((a, b) => b.diasAtraso - a.diasAtraso)

  const comPendencia = ativos.filter((r) => r.pendencies?.length)
  const contagemPend = new Map()
  for (const r of comPendencia) for (const p of new Set(r.pendencies.map((x) => x.trim()))) contagemPend.set(p, (contagemPend.get(p) ?? 0) + 1)
  const pendenciasFrequentes = [...contagemPend.entries()]
    .map(([pendencia, projetos]) => ({ pendencia, projetos }))
    .sort((a, b) => b.projetos - a.projetos || a.pendencia.localeCompare(b.pendencia, 'pt-BR'))
    .slice(0, 10)

  // Tempo por etapa: amostra = um projeto numa etapa, somando as visitas (revisitas) dele.
  const porEtapa = new Map()
  for (const r of todos) {
    if (!r.statusTimeline?.length) continue
    const soma = new Map()
    for (const v of r.statusTimeline) {
      if (!v?.etapa) continue
      if (v.saiuEm == null && ENCERRADOS.has(v.etapa)) continue // etapa final não tem duração
      const d = diasDaVisita(v, agora)
      if (d == null) continue
      const atual = soma.get(v.etapa) ?? { dias: 0, visitas: 0 }
      atual.dias += d
      atual.visitas += 1
      soma.set(v.etapa, atual)
    }
    for (const [etapa, s] of soma) {
      const e = porEtapa.get(etapa) ?? { amostras: [], visitas: 0 }
      e.amostras.push(s.dias)
      e.visitas += s.visitas
      porEtapa.set(etapa, e)
    }
  }
  const tempoPorEtapa = [...porEtapa.entries()]
    .map(([etapa, e]) => ({ etapa, projetos: e.amostras.length, visitas: e.visitas, mediaDias: media(e.amostras), medianaDias: mediana(e.amostras) }))
    .sort((a, b) => b.mediaDias - a.mediaDias)

  const desdePagamento = (lista) => {
    const v = lista.map((r) => r.tempoTotalDias).filter((x) => x != null)
    return { projetos: v.length, mediaDias: media(v), medianaDias: mediana(v) }
  }

  const trocados = todos.filter((r) => r.medidorSubstituidoDate)
  const ateTroca = trocados
    .map((r) => (dia(r.createdAt) && dia(r.medidorSubstituidoDate) ? diasEntre(dia(r.createdAt), dia(r.medidorSubstituidoDate)) : null))
    .filter((x) => x != null && x >= 0)

  const comAlteracao = todos.filter((r) => (r.changesTotal ?? 0) > 0 || (r.changesQuantidade ?? 0) > 0)

  return {
    hoje,
    projetosArmazenados: todos.length,
    ativos: ativos.length,
    finalizados: todos.filter(finalizado).length,
    cancelados: todos.filter((r) => r.status === 'Cancelado').length,
    prazoVencido: { quantidade: vencidos.length, projetos: vencidos.slice(0, 50) },
    comPendencia: { quantidade: comPendencia.length, pendenciasFrequentes },
    tempoPorEtapa,
    tempoDesdePagamento: {
      finalizados: desdePagamento(todos.filter(finalizado)),
      emAndamento: desdePagamento(ativos),
    },
    medidorSubstituido: { quantidade: trocados.length, tempoMedioCriacaoAteTrocaDias: media(ateTroca) },
    alteracoes: { valorTotal: comAlteracao.reduce((a, r) => a + (r.changesTotal ?? 0), 0), projetosComAlteracao: comAlteracao.length },
  }
}
