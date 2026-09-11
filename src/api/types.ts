export interface UsinaRaw {
  id: number
  nome: string
  potenciaInstalada: number | null
  energiaGeradaKwh: number | null
  status: string | null
  statusEm: string | null
  dataInstalacao: string | null
  clienteNome: string | null
  concessionaria: string | null
  cidade: string | null
  estado: string | null
  cep: string | null
  latitude: number | null
  longitude: number | null
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
