export interface PietaProjetoResumo {
  projectId: number
  status: string
  clientName: string
  power: number | null
  powerDistributor: string
  createdAt: string
  lastStatusChange: string | null
  dueDate: string | null
  message: string | null
}

export interface PietaResumo {
  userId: number
  companyName: string
  socialName: string
  phantasyName: string
  document: string
  projectsQuantity: number
  lastProject: string
  projectsForPhase: Record<string, number>
  projects: PietaProjetoResumo[]
}

export interface PietaStatusTimelineItem {
  etapa: string
  entrouEm: string
  saiuEm: string | null
  tempoNaEtapaDias: number
}

export interface PietaProjetoDetalhe extends PietaProjetoResumo {
  powerDistributorState: string
  daysSinceCreated: number | null
  tempoTotalDias: number | null
  medidorSubstituidoDate: string | null
  statusTimeline: PietaStatusTimelineItem[] | null
  mainContact: { name: string } | null
  pendencies: string[]
  inversors: { brand: string; model: string; power: number; quantity: number }[]
  solarPanels: { brand: string; model: string; power: number; quantity: number }[]
  projectValue: number | null
  changesTotal: number
  totalValue: number | null
}

export interface PietaTempoStats { projetos: number; mediaDias: number | null; medianaDias: number | null }

export interface PietaMetricas {
  vazio: boolean
  aviso: string | null
  atualizadoEm: string | null
  cobertura?: { armazenados: number; totalNoResumo: number | null; restantes: number | null }
  hoje?: string
  projetosArmazenados?: number
  ativos?: number
  finalizados?: number
  prazoVencido?: { quantidade: number; projetos: { projectId: number; clientName: string | null; status: string; dueDate: string; diasAtraso: number }[] }
  comPendencia?: { quantidade: number; pendenciasFrequentes: { pendencia: string; projetos: number }[] }
  tempoPorEtapa?: { etapa: string; projetos: number; visitas: number; mediaDias: number | null; medianaDias: number | null }[]
  tempoDesdePagamento?: { finalizados: PietaTempoStats; emAndamento: PietaTempoStats }
  medidorSubstituido?: { quantidade: number; tempoMedioCriacaoAteTrocaDias: number | null }
  alteracoes?: { valorTotal: number; projetosComAlteracao: number }
}

export interface UsinaMensal {
  mes: string
  geracaoKwh: number | null
  desempenhoPct: number | null
  /** Prognóstico (kWh) do mês; só nos dados vindos da SolarZ. */
  prognosticoKwh?: number | null
  /** Mês corrente: geração parcial, sem desempenho. */
  parcial?: boolean
}

export interface UsinaRaw {
  id: number | null
  nome: string
  cliente: string | null
  totalInvestido: number | null
  concessionaria: string | null
  cidade: string | null
  estado: string | null
  classe: string | null
  plano: string | null
  potenciaKwp: number | null
  mesAnoRecente: string | null
  prognosticoKwhMes: number | null
  geracaoKwhMes: number | null
  desempenhoMesPct: number | null
  desempenho30dPct: number | null
  desempenho12mPct: number | null
  desempenhoMedio3mPct: number | null
  statusDesempenho: string | null
  dataInstalacao: string | null
  /** Ano da série `mensal` (ano corrente nos dados da SolarZ; 2026 no relatório estático). */
  anoMensal?: number | null
  mensal?: UsinaMensal[] | null
  /** Campo antigo, igual a `mensal` quando o ano é 2026. */
  mensal2026: UsinaMensal[] | null
  /** 'solarz' = dado ao vivo guardado pela carga diária; 'relatorio' = relatório estático. */
  fonte?: 'solarz' | 'relatorio'
  dadoEm?: string | null
  unidadesConsumidoras?: string[] | null
  ticketsAbertos?: number | null
  ticketsAbertosPorTipo?: Record<string, number> | null
  ticketsAfetamDesempenho?: number | null
  observacao: string | null
  statusMonitoramento: string | null
  statusMonitoramentoEm: string | null
  energiaGeradaAcumuladaKwh: number | null
}

/** GET /api/sync/groner/status: horário de cada carga do Groner guardada no banco. */
export interface SyncStatus {
  configured: boolean
  entities: Record<string, { finishedAt?: string; sourceUpdatedAt?: string; lastSuccessfulRunAt?: string } | null | undefined>
}

export interface VendaRaw {
  id: number
  nome: string
  vendedor: string
  valorTotal: number
  valorComissao: number
  dataVenda: string
  cicloVenda: number | null
  origemNome: string | null
  statusNome: string
  statusCor: string
  cidade: string | null
  estado: string | null
  bairro: string | null
  fornecedor: string | null
  placa: string | null
  inversor: string | null
  lucro: number | null
  lucroServico: number | null
}

export interface ProjetoRaw {
  id: number
  nome: string
  tipo: string | null
  tipoLead: string | null
  funil: string | null
  etapa: string | null
  corEtapa: string | null
  origemLead: string | null
  vendedorResponsavel: string | null
  dataInclusao: string
  dataUltimaAtualizacao: string
  dataUltimoStatus: string | null
  previsaoFechamento: string | null
  valorPrePropostaAceita: number | null
  valorVenda: number | null
  perda: boolean
  consumo: number | null
  qtdPrePropostas: number | null
  latitude: number | null
  longitude: number | null
  cidade: string | null
  estado: string | null
  bairro: string | null
  concessionaria: string | null
  /** Potência do projeto (kWp), quando informada. */
  kwp?: number | null
  /** Dias desde a última atualização do card no Groner (calculado na leitura). */
  diasSemAtualizacao?: number | null
}

export interface PropostaRaw {
  id: number
  dataInclusao: string
  dataAlteracao: string | null
  titulo: string | null
  projeto: string | null
  projetoId: number
  projetoTipo: string | null
  origem: string | null
  lead: string | null
  leadEmail: string | null
  statusProjeto: string | null
  etapaProjeto: string | null
  corEtapa: string | null
  aceita: boolean
  vendedorNome: string | null
  kwP: number | null
  preco: number | null
  precoOriginal: number | null
  consumo: number | null
  geracaoAnual: number | null
  anoRetornoInvestimento: number | null
  payBack: number | null
}

export interface TarefaRaw {
  id: number
  titulo: string | null
  dataInclusao: string
  dataEntrega: string | null
  dataInicial: string | null
  dataConclusao: string | null
  status: string | null
  statusCor: string | null
  tipo: string | null
  tipoCor: string | null
  criadoPorNome: string | null
  projeto: string | null
  projetoId: number | null
  lead: string | null
  responsaveis: string[]
  prioridade: string | null
  bloqueado: boolean
  atrasada: boolean
}

export interface UsinasRawResponse {
  usinas: UsinaRaw[]
  /** Aviso não-bloqueante — ex.: SolarZ recusou a credencial (401) e os dados abaixo vêm só do relatório importado. */
  avisoIntegracaoSolarZ: string | null
  origemDados?: UsinasOrigemDados
}

export interface UsinasOrigemDados {
  usinasSolarz: number
  usinasRelatorio: number
  solarzAtualizadoEm: string | null
  relatorioExtraidoEm: string | null
  ticketsDisponiveis: boolean
  ticketsAbertos: number | null
  ticketsAbertosPorTipo: Record<string, number>
  /** Foto diária das contagens do farol de monitoramento. */
  farolHistorico: { data: string; total: number; contagens: Record<string, number> }[]
}
