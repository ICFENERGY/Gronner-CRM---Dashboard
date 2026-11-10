/**
 * "SLA de Atendimento" da Pieta (public/pieta/index.html): monta a lista de chamados no formato
 * de ROWS do modelo, a partir do que já está no Neon (resumo da lista + detalhes guardados da
 * entidade `pieta_projetos`). Funções puras: o relógio entra por parâmetro. Sem CPF, endereço,
 * telefone nem contato: só cliente (como já aparece na API do painel), prazos e equipamentos.
 */
import { ENTIDADE_PIETA, dia, hojeBrasilia } from './pietaMetricas.js'

export const SLA_LIMITE_DIAS = 60
const DIA_MS = 86400000

const diasEntre = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DIA_MS)
const unicos = (v) => [...new Set(v)]

/** A API não distingue o tipo do inversor: microinversor = linhas Deye SUN-M/S...G4 e FoxESS Q1 (como no modelo). */
export const ehMicroinversor = (modelo) =>
  /SUN-?[MS]\d{3}G\d/i.test(modelo ?? '') || /(^|[^A-Z0-9])Q1-\d/i.test(modelo ?? '') || /\bmicro/i.test(modelo ?? '')

const rotulo = (lista) => lista.map((e) => `${e.quantity}x ${[e.brand, e.model].filter(Boolean).join(' ')}`.trim()).join(' + ')
const marcas = (lista) => unicos(lista.map((e) => e.brand).filter(Boolean)).join(' + ')
const soma = (lista) => lista.reduce((a, e) => a + e.quantity, 0)

/** Campos de equipamento do chamado; sem detalhe guardado, tudo ausente (null / ""). */
export function equipamentosDoChamado(registro) {
  const placas = registro?.placas
  const inversores = registro?.inversores
  if (!Array.isArray(placas) && !Array.isArray(inversores)) {
    return {
      placa: '', inversor: '', qtd_placas: null, fab_placas: '', qtd_inversores: null, fab_inversores: '',
      qtd_microinversores: null, qtd_inversores_string: null, fab_microinversores: '',
    }
  }
  const p = placas ?? []
  const inv = inversores ?? []
  const micros = inv.filter((e) => ehMicroinversor(e.model))
  const strings = inv.filter((e) => !ehMicroinversor(e.model))
  return {
    placa: p.length ? rotulo(p) : '(a confirmar)',
    inversor: inv.length ? rotulo(inv) : '(a confirmar)',
    qtd_placas: soma(p),
    fab_placas: marcas(p),
    qtd_inversores: soma(inv),
    fab_inversores: marcas(inv),
    qtd_microinversores: soma(micros),
    qtd_inversores_string: soma(strings),
    fab_microinversores: marcas(micros),
  }
}

/**
 * @param resumoProjetos projetos do resumo guardado (project_id, status, client_name, power, power_distributor, created_at, last_status_change, due_date)
 * @param registros detalhes guardados (pietaRegistroParaArmazenar)
 * @returns lista no formato de ROWS do modelo (ordenada por criação, mais antigo primeiro)
 */
export function montarChamadosSla(resumoProjetos, registros, { agora = new Date() } = {}) {
  const hoje = hojeBrasilia(agora)
  const porId = new Map((registros ?? []).filter((r) => r?.projectId != null).map((r) => [String(r.projectId), r]))
  const base = Array.isArray(resumoProjetos) && resumoProjetos.length
    ? resumoProjetos.map((p) => ({ id: String(p.project_id), resumo: p, reg: porId.get(String(p.project_id)) ?? null }))
    : [...porId.values()].map((r) => ({ id: String(r.projectId), resumo: null, reg: r }))

  const linhas = base.map(({ resumo, reg }) => {
    const r = resumo ?? {}
    const g = reg ?? {}
    const status = r.status ?? g.status ?? null
    const finalizado = status === 'Finalizado'
    const criado = dia(r.created_at ?? g.createdAt)
    const alterado = dia(r.last_status_change ?? g.lastStatusChange)
    // Finalizado: cadastro até a entrada na etapa Finalizado (ou a última mudança); aberto: idade até hoje.
    const entradaFinal = finalizado
      ? dia((g.statusTimeline ?? []).filter((s) => s?.etapa === 'Finalizado').map((s) => s.entrouEm).filter(Boolean).pop())
      : null
    const fim = finalizado ? (entradaFinal ?? alterado ?? hoje) : hoje
    const potencia = Number(r.power ?? g.power)
    return {
      cliente: r.client_name ?? g.clientName ?? '(sem nome)',
      ano: criado ? criado.slice(0, 4) : '',
      mes: criado ? criado.slice(0, 7) : '',
      status: status ?? '(sem status)',
      finalizado,
      sla: criado ? Math.max(0, diasEntre(criado, fim)) : 0,
      distribuidora: r.power_distributor ?? g.powerDistributor ?? '',
      estado: g.estado ?? null,
      potencia: Number.isFinite(potencia) && (r.power ?? g.power) != null ? potencia : null,
      ...equipamentosDoChamado(g),
      ultima_alteracao: alterado ?? '',
      descricao: Array.isArray(g.pendencies) ? g.pendencies.join('; ') : '',
    }
  })
  return linhas.sort((a, b) => a.mes.localeCompare(b.mes) || a.cliente.localeCompare(b.cliente, 'pt-BR'))
}

/** Situação dos dados para a página: totais, cobertura de equipamentos e data da última sincronização. */
export function resumoDaCobertura(chamados, { resumoEm = null, estado = null } = {}) {
  return {
    total: chamados.length,
    comEquipamentos: chamados.filter((c) => c.qtd_placas != null).length,
    comEstado: chamados.filter((c) => c.estado).length,
    atualizadoEm: estado?.concluidoEm ?? resumoEm ?? null,
    resumoEm,
    restantes: estado?.restantes ?? null,
  }
}

/** Lê do Neon o resumo e os detalhes guardados (nenhuma chamada à Pieta). */
export async function lerPietaParaSla(pg) {
  const [linhas, estados] = await Promise.all([
    pg.todas('registro', ENTIDADE_PIETA, { ativos: true }),
    pg.todas('estado', ENTIDADE_PIETA),
  ])
  const resumo = estados.find((e) => e.chave === 'resumo')?.dados ?? null
  const status = estados.find((e) => e.chave === 'status')?.dados ?? null
  return {
    resumoProjetos: Array.isArray(resumo?.projetos) ? resumo.projetos : [],
    resumoEm: resumo?.em ?? null,
    registros: linhas.map((l) => l.dados),
    estado: status ? { concluidoEm: status.concluidoEm ?? null, restantes: status.restantes ?? null } : null,
  }
}
