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

export interface EtapaContagem {
  etapa: string
  quantidade: number
}

export interface FunilResumo {
  funil: string
  categoria: string
  cor: string
  cadeiaPrincipal: boolean
  quantidade: number
  etapas: EtapaContagem[]
}

export interface CategoriaResumo {
  categoria: string
  label: string
  cor: string
  quantidade: number
}

export interface VendedorResumo {
  vendedor: string
  quantidade: number
  valorTotal: number
}

export interface MesResumo {
  mes: string
  quantidade: number
  valorTotal: number
}

export interface PivotFunilAnoLinha {
  funil: string
  categoria: string
  cor: string
  cadeiaPrincipal: boolean
  porAno: number[]
  total: number
}

export interface PivotFunilAno {
  anos: string[]
  linhas: PivotFunilAnoLinha[]
}

export interface Summary {
  geradoEm: string
  sourceUpdatedAt?: string | null
  syncStatus?: { configured: boolean; entities: Record<string, unknown> }
  leads: { total: number }
  projetos: {
    total: number
    amostra: number
    porFunil: FunilResumo[]
    porCategoria: CategoriaResumo[]
    porEstado: { name: string; value: number }[]
    porConcessionaria: { name: string; value: number }[]
    pivotFunilAno: PivotFunilAno
  }
  vendas: {
    total: number
    valorTotal: number
    comissaoTotal: number
    ticketMedio: number
    porVendedor: VendedorResumo[]
    porMes: MesResumo[]
  }
  prepropostas: {
    total: number
    aceitas: number
    valorTotalAceita: number
    valorTotalGeral: number
  }
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

/** Venda no formato de docs/data_sales.json (GET /api/indicadores/sales, montado do Neon). cep/logradouro sempre null. */
export interface SaleIndicador {
  codigo: number
  idNegocio: number | null
  nome: string | null
  vendedor: string | null
  tipoNegocio: string | null
  tipoVenda: string | null
  statusVenda: string | null
  etapaNegocio: string | null
  statusNegocio: string | null
  origemContato: string | null
  cidade: string | null
  uf: string | null
  cep: null
  logradouro: null
  valorTotal: number
  valorEntrada: number | null
  valorFinanciado: number | null
  valorProduto: number | null
  valorPago: number | null
  valorServico: number | null
  dataCadastro: string | null
  dataVenda: string | null
  ano: number | null
  mes: number | null
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
  /** `estimado`: dia importado de um print antigo (valores medidos na imagem), não capturado da API. */
  farolHistorico: { data: string; total: number; contagens: Record<string, number>; estimado?: boolean }[]
}
