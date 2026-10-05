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

const STATUS_MARCO = new Map([
  ['FUNIL ENGENHARIA - CRIAR PROP', '1'], ['CRIAR PROJETO->PROPOSTA', '1'], ['CRIAR ABORDAGEM', '1'],
  ['APROVAR PROPOSTA CRIADA', '2'], ['PENDENCIAS TECNICAS->PROJETOS', '3'], ['APROVACAO TECNICA - VENDA', '3'],
  ['PROPOSTA CRIADA APROVADA', '4'], ['AGUARDANDO ASSINATURA', 'G6'], ['DOCUMENTOS PENDENTES', 'G6'], ['PAGAMENTO REALIZADO', 'G6'],
  ['PIETA_CRIACAO DO PROJETO', '5'], ['PIETA_PARECER SOLICITADO', '5'], ['PENDENCIA DE HOMOLOGACAO', '6'], ['PENDENCIA ICF', '6'],
  ['PENDENCIA DOCUMENTAL/TECNICA', '6'], ['PARECER EMITIDO', '6'], ['PEDIDO ENTREGUE', '7'], ['INSTALADOR HOMOLOGADO', '9'],
  ['AGENDAR INSTALACAO', '9'], ['INSTALACAO AGENDADA', '10'], ['DIARIO DE OBRA / OBRA ANDAMENTO', '11'], ['PENDENCIA DE OBRA', '11'],
  ['PENDENCIA DE INSTALACAO', '11'], ['AGUARDANDO VISTORIA', '12'], ['PENDENCIA VIST. CONCESSIONARIA', '12'], ['RELOGIO TROCADO', '13'],
  ['INSTALACAO APP MONITORAMENTO', '13'], ['APP MONITOR INSTALADO', '14'], ['TERMO DE ACEITE', '15'], ['TERMO DE ACEITE ASSINADO', '15'],
  ['DOSSIE', '16'], ['DOSSIE ENVIADO', 'FIM'],
])

function semAcentos(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase()
}

export function marcoDoStatus(status) {
  return STATUS_MARCO.get(semAcentos(status)) ?? null
}

function dataVendaValida(value) {
  if (!value) return null
  const year = Number(String(value).slice(0, 4))
  return Number.isFinite(year) && year >= 1950 ? value : null
}

/** Nome de responsável, ou null quando o Groner manda id 0 ou "Sem …". */
function pessoa(nome, id) {
  if (id === 0 || id === '0') return null
  const texto = typeof nome === 'string' ? nome.trim() : ''
  return texto && !/^sem\s/i.test(texto) ? texto : null
}

export function normalizarDataGroner(value) {
  if (typeof value !== 'string' || !value.trim()) return value ?? null
  const texto = value.trim()
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(texto)) return `${texto}-03:00`
  return texto
}

function diasDesde(value, agora = Date.now()) {
  const timestamp = Date.parse(normalizarDataGroner(value) ?? '')
  return Number.isFinite(timestamp) ? Math.max(0, Math.floor((agora - timestamp) / 86400000)) : null
}

function momentoDoMarco(marco) {
  if (marco === 'FIM') return 'encerrado'
  if (marco === 'G6' || ['1', '2', '3', '4'].includes(marco)) return 'pré-venda'
  if (['5', '6', '7', '9', '10', '11', '12'].includes(marco)) return 'implantação'
  if (['13', '14', '15', '16'].includes(marco)) return 'gestão da usina'
  return null
}

function estaNoFluxoEngenharia(funil, status, marco) {
  if (marco == null) return false
  const etapa = semAcentos(funil)
  return /^(04\.|06\.|07\.|08\.|09\.|10\.|11\.)/.test(etapa)
    && (!etapa.startsWith('04.') || semAcentos(status) === 'FUNIL ENGENHARIA - CRIAR PROP')
}

const DEAL_FIELDS = ['dataVenda', 'dataAceiteProposta', 'kwp', 'geracaoMensalPrevista', 'valorPrePropostaAceita', 'cidade', 'estado', 'bairro', 'concessionaria', 'uc', 'tecnico', 'projetista', 'homologador', 'tipoTelhado', 'faseEnergetica', 'tipoEdificacao', 'dataInicioInstalacao', 'dataTerminoInstalacao', 'dataAssinaturaContrato', 'urlMonitoramento', 'modeloMonitoramento', 'dataTerminoGarantia', 'qtdPrePropostas']

function fieldsFromProject(p) {
  const sources = [p, p.deal, p.deals, p.enriquecimento, p.camposPersonalizados, p.customFields]
  const aliases = Object.fromEntries(DEAL_FIELDS.map((field) => [field, [field]]))
  Object.assign(aliases, {
    kwp: ['kwp', 'kwP', 'Proposta Aceita Potência'], geracaoMensalPrevista: ['geracaoMensalPrevista', 'Proposta Aceita Geração mensal'],
    valorPrePropostaAceita: ['valorPrePropostaAceita', 'Proposta Aceita Valor'], concessionaria: ['concessionaria', 'Concessionária'],
    uc: ['uc', 'Código da unidade consumidora'], tecnico: ['tecnico', 'Técnico'], projetista: ['projetista', 'Projetista'], homologador: ['homologador', 'Homologador'],
    tipoTelhado: ['tipoTelhado', 'Tipo de Telhado'], faseEnergetica: ['faseEnergetica', 'Fase energética'], tipoEdificacao: ['tipoEdificacao', 'Tipo de Edificação'],
    dataInicioInstalacao: ['dataInicioInstalacao', 'Data de início da instalação'], dataTerminoInstalacao: ['dataTerminoInstalacao', 'Data de término da instalação'],
    dataAssinaturaContrato: ['dataAssinaturaContrato', 'Data de Assinatura do Contrato'], urlMonitoramento: ['urlMonitoramento', 'URL do monitoramento'],
    modeloMonitoramento: ['modeloMonitoramento', 'Modelo do monitoramento'], dataTerminoGarantia: ['dataTerminoGarantia', 'Data de término da garantia da instalação'],
    qtdPrePropostas: ['qtdPrePropostas', 'Quantidade de propostas'], dataAceiteProposta: ['dataAceiteProposta', 'Data de aceite da proposta'], dataVenda: ['dataVenda', 'Data da venda'],
  })
  const flat = (source) => {
    const values = {}
    const visit = (node) => {
      if (Array.isArray(node)) return node.forEach(visit)
      if (!node || typeof node !== 'object') return
      for (const [key, value] of Object.entries(node)) {
        if (value == null || value === '') continue
        if (typeof value !== 'object') values[key] = value
        visit(value)
      }
      const label = node.nome ?? node.name ?? node.campoNome ?? node.fieldName
      const answer = node.resposta ?? node.answer ?? node.valor ?? node.value
      if (label && answer != null && typeof answer !== 'object') values[label] = answer
    }
    visit(source)
    return values
  }
  const output = {}
  for (const source of sources) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) continue
    const values = flat(source)
    for (const field of DEAL_FIELDS) {
      if (output[field] != null) continue
      const key = aliases[field].find((candidate) => values[candidate] != null && values[candidate] !== '')
      if (key) output[field] = values[key]
    }
  }
  return output
}

export function mapProjeto(p, enriquecimento) {
  const apiFields = fieldsFromProject(p)
  const extra = { ...(enriquecimento?.[String(p.id)] ?? {}), ...apiFields }
  const status = p.status?.nome ?? p.etapa ?? p.status ?? null
  const funil = p.funil ?? p.etapa ?? null
  const marco = marcoDoStatus(status)
  // A API manda 0001-01-01 quando não há venda; isso não pode apagar a data vinda do Deals.
  const dataVenda = dataVendaValida(apiFields.dataVenda) ?? dataVendaValida(enriquecimento?.[String(p.id)]?.dataVenda)
  const dataAtualizacao = normalizarDataGroner(p.dataUltimaAtualizacao ?? extra?.dataAtualizacao ?? null)
  // A listagem do /Projeto traz os responsáveis com id 0 e "Sem Técnico"/"Sem Projetista" quando vazios.
  const tecnico = pessoa(p.tecnicoResponsavel, p.tecnicoResponsavelId) ?? pessoa(extra?.tecnico)
  const projetista = pessoa(p.projetista, p.projetistaId) ?? pessoa(extra?.projetista)
  const homologador = pessoa(p.homologador, p.homologadorId) ?? pessoa(extra?.homologador)
  return {
    id: p.id,
    nome: p.nome,
    tipo: p.tipo,
    tipoLead: p.tipoLead,
    funil,
    etapa: status,
    marco,
    corEtapa: p.corEtapa,
    origemLead: p.origemLead?.nome ?? null,
    vendedorResponsavel: p.vendedorResponsavel,
    dataInclusao: normalizarDataGroner(p.dataInclusao),
    dataUltimaAtualizacao: dataAtualizacao,
    dataUltimoStatus: normalizarDataGroner(p.dataUltimoStatus),
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
    momento: momentoDoMarco(marco),
    donoNominal: pessoa(extra?.donoNominal) ?? tecnico ?? projetista ?? homologador ?? null,
    diasSemAtualizacao: extra?.diasSemAtualizacao ?? diasDesde(dataAtualizacao),
    diasDesdeVenda: extra?.diasDesdeVenda ?? diasDesde(dataVenda),
    dataEntradaStatus: normalizarDataGroner(extra?.dataEntradaStatus ?? p.dataUltimoStatus ?? null),
    noFluxoEngenharia: estaNoFluxoEngenharia(funil, status, marco),
    dataVenda,
    dataAceiteProposta: extra?.dataAceiteProposta ?? null,
    kwp: extra?.kwp ?? null,
    geracaoMensalPrevista: extra?.geracaoMensalPrevista ?? null,
    uc: extra?.uc ?? null,
    tecnico,
    projetista,
    homologador,
    tipoTelhado: extra?.tipoTelhado ?? null,
    faseEnergetica: extra?.faseEnergetica ?? null,
    tipoEdificacao: extra?.tipoEdificacao ?? null,
    dataInicioInstalacao: extra?.dataInicioInstalacao ?? null,
    dataTerminoInstalacao: extra?.dataTerminoInstalacao ?? null,
    dataAssinaturaContrato: extra?.dataAssinaturaContrato ?? null,
    urlMonitoramento: extra?.urlMonitoramento ?? null,
    modeloMonitoramento: extra?.modeloMonitoramento ?? null,
    dataTerminoGarantia: extra?.dataTerminoGarantia ?? null,
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

function normalizeNomeUsina(nome) {
  return (nome ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

/**
 * A API ao vivo da SolarZ só retorna usinas com monitoramento premium
 * (~52 de 126). O relatório mensal exportado do painel cobre todas as 126,
 * com geração/desempenho Jan-Dez/26 e status de desempenho — mas é um
 * snapshot estático. Aqui usamos o relatório como base (todas as usinas) e
 * sobrepomos o status de monitoramento em tempo real da API quando a usina
 * casa por nome (normalizado, sem acento).
 */
export function mesclarUsinasComRelatorio(usinasAoVivo, relatorio) {
  const porNome = new Map()
  for (const u of usinasAoVivo) {
    const chave = normalizeNomeUsina(u.nome)
    if (!porNome.has(chave)) porNome.set(chave, [])
    porNome.get(chave).push(u)
  }

  const usadas = new Set()
  const usinas = (relatorio.usinas ?? []).map((r) => {
    const chave = normalizeNomeUsina(r.nome)
    const candidatos = porNome.get(chave) ?? []
    const aoVivo = candidatos.find((c) => !usadas.has(c)) ?? null
    if (aoVivo) usadas.add(aoVivo)

    return {
      id: aoVivo?.id ?? null,
      nome: r.nome,
      cliente: r.cliente,
      totalInvestido: r.totalInvestido,
      concessionaria: r.concessionaria ?? aoVivo?.concessionaria ?? null,
      cidade: r.cidade ?? aoVivo?.cidade ?? null,
      estado: r.estado ?? aoVivo?.estado ?? null,
      classe: r.classe,
      plano: r.plano,
      potenciaKwp: r.potenciaKwp ?? aoVivo?.potenciaInstalada ?? null,
      mesAnoRecente: r.mesAnoRecente,
      prognosticoKwhMes: r.prognosticoKwhMes,
      geracaoKwhMes: r.geracaoKwhMes,
      desempenhoMesPct: r.desempenhoMesPct,
      desempenho30dPct: r.desempenho30dPct,
      desempenho12mPct: r.desempenho12mPct,
      desempenhoMedio3mPct: r.desempenhoMedio3mPct,
      statusDesempenho: r.statusDesempenho,
      dataInstalacao: r.dataInstalacao ?? aoVivo?.dataInstalacao ?? null,
      mensal2026: r.mensal2026,
      observacao: r.observacao,
      statusMonitoramento: aoVivo?.status ?? null,
      statusMonitoramentoEm: aoVivo?.statusEm ?? null,
      energiaGeradaAcumuladaKwh: aoVivo?.energiaGeradaKwh ?? null,
      latitude: aoVivo?.latitude ?? null,
      longitude: aoVivo?.longitude ?? null,
    }
  })

  // Usinas que a API retorna mas que por algum motivo não estão no relatório
  // (relatório desatualizado) ainda entram, para não perder dado ao vivo.
  for (const u of usinasAoVivo) {
    if (!usadas.has(u)) {
      usinas.push({
        ...u,
        cliente: u.clienteNome,
        totalInvestido: null,
        classe: null,
        plano: null,
        potenciaKwp: u.potenciaInstalada,
        mesAnoRecente: null,
        prognosticoKwhMes: null,
        geracaoKwhMes: null,
        desempenhoMesPct: null,
        desempenho30dPct: null,
        desempenho12mPct: null,
        desempenhoMedio3mPct: null,
        statusDesempenho: 'Sem dado',
        mensal2026: null,
        observacao: 'Usina identificada apenas na API ao vivo (fora do último relatório mensal).',
        statusMonitoramento: u.status,
        statusMonitoramentoEm: u.statusEm,
        energiaGeradaAcumuladaKwh: u.energiaGeradaKwh,
      })
    }
  }

  return usinas
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
