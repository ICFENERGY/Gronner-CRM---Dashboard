/**
 * Cada mapper aqui é uma allowlist explícita de campos do Groner.
 * Alguns recursos (PreProposta, sobretudo) embutem objetos gigantes com
 * dados internos e até credenciais (ver sanitize.js) — nunca repassamos o
 * objeto bruto para o frontend, só os campos que a interface realmente usa.
 */

/**
 * Não cruzamos Venda com Projeto/Proposta via API aqui: testamos os dois
 * caminhos possíveis (Venda.id === Projeto.id, e Venda.propostaId ->
 * Proposta) e os dois se mostraram não confiáveis nos dados reais do tenant
 * — em parte por IDs que não coincidem, em parte porque propostas antigas já
 * foram removidas do Groner. Em vez disso, cidade/estado/kit técnico vêm do
 * enriquecimento por planilha (server/enrichment.js), cujo vínculo por
 * Código foi validado 1:1 contra os dados reais antes de integrar.
 */
export function mapVenda(v, enriquecimento) {
  const extra = enriquecimento?.[String(v.id)]
  return {
    id: v.id,
    nome: v.nome,
    vendedor: v.vendedor,
    valorTotal: v.valorTotal,
    valorComissao: v.valorComissao,
    dataVenda: v.dataVenda,
    cicloVenda: v.cicloVenda,
    origemNome: v.origemNome,
    statusNome: v.statusNome,
    statusCor: v.statusCor,
    cidade: extra?.cidade ?? null,
    estado: extra?.estado ?? null,
    bairro: extra?.bairro ?? null,
    fornecedor: extra?.fornecedor ?? null,
    placa: extra?.placa ?? null,
    inversor: extra?.inversor ?? null,
    lucro: extra?.lucro ?? null,
    lucroServico: extra?.lucroServico ?? null,
  }
}

export function mapProjeto(p, enriquecimento) {
  const extra = enriquecimento?.[String(p.id)]
  return {
    id: p.id,
    nome: p.nome,
    tipo: p.tipo,
    tipoLead: p.tipoLead,
    funil: p.etapa,
    etapa: p.status?.nome ?? null,
    corEtapa: p.corEtapa,
    origemLead: p.origemLead?.nome ?? null,
    vendedorResponsavel: p.vendedorResponsavel,
    dataInclusao: p.dataInclusao,
    dataUltimaAtualizacao: p.dataUltimaAtualizacao,
    dataUltimoStatus: p.dataUltimoStatus,
    previsaoFechamento: p.previsaoFechamento,
    valorPrePropostaAceita: p.valorPrePropostaAceita,
    valorVenda: p.valorVenda,
    perda: p.perda,
    consumo: p.consumo,
    qtdPrePropostas: p.qtdPrePropostas,
    latitude: p.latidude ? Number(p.latidude) : null,
    longitude: p.longitude ? Number(p.longitude) : null,
    cidade: extra?.cidade ?? null,
    estado: extra?.estado ?? null,
    bairro: extra?.bairro ?? null,
    concessionaria: extra?.concessionaria ?? null,
  }
}

export function mapProposta(pp) {
  const sim = pp.simulacao ?? {}
  return {
    id: pp.id,
    dataInclusao: pp.dataInclusao,
    dataAlteracao: pp.dataAlteracao,
    titulo: pp.titulo,
    projeto: pp.projeto,
    projetoId: pp.projetoId,
    projetoTipo: pp.projetoTipo,
    origem: pp.origem,
    lead: pp.lead,
    leadEmail: pp.leadEmail,
    statusProjeto: pp.statusProjeto,
    etapaProjeto: pp.etapaProjeto,
    corEtapa: pp.corEtapa,
    aceita: pp.aceita,
    vendedorNome: pp.usuario?.nome?.trim() || null,
    kwP: sim.kwP ?? null,
    preco: sim.preco ?? null,
    precoOriginal: sim.precoOriginal ?? null,
    consumo: sim.consumo ?? null,
    geracaoAnual: sim.geracaoAnual ?? null,
    anoRetornoInvestimento: sim.anoRetornoInvestimento ?? null,
    payBack: sim.payBack ?? null,
  }
}

/** Atrasada = tinha prazo de entrega no passado e ainda não foi concluída. */
function calcularAtrasada(t) {
  if (t.dataConclusao) return false
  if (!t.dataEntrega) return false
  const entrega = new Date(t.dataEntrega).getTime()
  if (Number.isNaN(entrega)) return false
  return entrega < Date.now()
}

/**
 * Mapeia 1:1 com o schema documentado da API Pieta (PIEP) — ver
 * API-PIEP-V3.pdf. Ainda não testado contra a API real (aguardando
 * credenciais); os nomes de campo seguem exatamente a doc para minimizar
 * risco de erro de digitação até a primeira chamada real.
 */
export function mapPietaResumo(r) {
  return {
    userId: r.user_id,
    companyName: r.company_name,
    socialName: r.social_name,
    phantasyName: r.phantasy_name,
    document: r.document,
    projectsQuantity: r.projects_quantity,
    lastProject: r.last_project,
    projectsForPhase: r.projects_for_phase ?? {},
    projects: (r.projects ?? []).map((p) => ({
      projectId: p.project_id,
      status: p.status,
      clientName: p.client_name,
      power: p.power != null ? Number(p.power) : null,
      powerDistributor: p.power_distributor,
      createdAt: p.created_at,
      lastStatusChange: p.last_status_change,
      dueDate: p.due_date,
      message: p.message,
    })),
  }
}

export function mapPietaProjetoDetalhe(p) {
  return {
    projectId: p.project_id,
    status: p.status,
    clientName: p.client_name,
    power: p.power != null ? Number(p.power) : null,
    powerDistributor: p.power_distributor,
    powerDistributorState: p.power_distributor_state,
    createdAt: p.created_at,
    lastStatusChange: p.last_status_change,
    dueDate: p.due_date,
    message: p.message,
    daysSinceCreated: p.days_since_created ?? null,
    tempoTotalDias: p.tempo_total_dias ?? null,
    medidorSubstituidoDate: p.medidor_substituido_date ?? null,
    statusTimeline: (p.status_timeline ?? []).map((s) => ({
      etapa: s.etapa,
      entrouEm: s.entrou_em,
      saiuEm: s.saiu_em,
      tempoNaEtapaDias: s.tempo_na_etapa_dias,
    })),
    mainContact: p.main_contact ? { name: p.main_contact.name, phone: p.main_contact.phone } : null,
    pendencies: p.pendencies ?? [],
    payment: p.payment
      ? { method: p.payment.method, totalPaid: p.payment.total_paid, balanceUsed: p.payment.balance_used }
      : null,
    inversors: p.inversors ?? [],
    solarPanels: p.solar_panels ?? [],
    projectValue: p.project_value ?? null,
    changes: (p.changes ?? []).map((c) => ({
      price: c.price,
      status: c.status,
      payment: c.payment,
      createdAt: c.created_at,
      requestFields: c.request_fields,
      responseStatus: c.response_status,
      changeIntegratorDetail: c.change_integrator_detail,
    })),
    changesTotal: p.changes_total ?? 0,
    totalValue: p.total_value ?? null,
  }
}

/**
 * A SolarZ embute o objeto completo do cliente em cada usina, incluindo CPF,
 * e-mail e telefone. Mantemos só o nome (para casar visualmente com o
 * cliente já conhecido do Groner) e a concessionária; o resto fica de fora.
 */
export function mapUsina(p) {
  return {
    id: p.id,
    nome: p.name,
    potenciaInstalada: p.installedPower ?? null,
    energiaGeradaKwh: p.energyProducedKwh ?? null,
    status: p.status?.status ?? null,
    statusEm: p.status?.at ?? null,
    dataInstalacao: p.dataInstalacao ?? null,
    clienteNome: p.cliente?.nome ?? null,
    concessionaria: p.cliente?.concessionaria ?? null,
    cidade: p.endereco?.cidade ?? null,
    estado: p.endereco?.siglaEstado ?? null,
    cep: p.endereco?.cep ?? null,
    latitude: p.endereco?.latitude ?? null,
    longitude: p.endereco?.longitude ?? null,
  }
}

export function mapTarefa(t) {
  return {
    id: t.id,
    titulo: t.titulo,
    dataInclusao: t.dataInclusao,
    dataEntrega: t.dataEntrega,
    dataInicial: t.dataInicial,
    dataConclusao: t.dataConclusao,
    status: t.status?.nome ?? null,
    statusCor: t.status?.cor ?? null,
    tipo: t.tipo?.nome ?? null,
    tipoCor: t.tipo?.cor ?? null,
    criadoPorNome: t.criadoPorNome,
    projeto: t.projeto,
    projetoId: t.projetoId,
    lead: t.lead,
    responsaveis: (t.membros ?? []).map((m) => m.nome),
    prioridade: t.prioridade,
    bloqueado: t.bloqueado,
    atrasada: calcularAtrasada(t),
  }
}
