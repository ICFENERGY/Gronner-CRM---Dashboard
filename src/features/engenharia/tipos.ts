/** Contrato de GET /api/engenharia (server/engenharia.js). */

export type Cor = 'atrasado' | 'risco' | 'ok'
export type Momento = 'pre' | 'imp' | 'usi'

export interface AcaoCombinada {
  acao: string
  dono: string
  prazo: string
  feita: boolean
  em: string
  por: string | null
}

export interface Passagem {
  de: string | null
  para: string | null
  statusNovo: string
  em: string
}

export interface CardEngenharia {
  id: number
  marco: string
  momento: Momento
  status: string | null
  funil: string | null
  cidade: string | null
  estado: string | null
  concessionaria: string | null
  kwp: number | null
  dono: string | null
  vendedor: string | null
  dataVenda: string | null
  dataUltimaAtualizacao: string | null
  diasSemAtualizacao: number | null
  desde: string | null
  estimado: boolean
  dias: number
  prazo: number
  diasDesdeVenda: number | null
  projecao: number | null
  cor: Cor
  motivos: string[]
  acao: AcaoCombinada | null
  acaoAnterior: AcaoCombinada | null
  acaoVencida: boolean
  semDono: boolean
  passagens: Passagem[]
}

export interface FluxoMarco {
  marco: string
  nome: string
  momento: Momento
  verde: number
  amarelo: number
  vermelho: number
  kwp: number
  diasMediana: number | null
  status: Record<string, number>
}

export interface Painel {
  ativos: number
  encerrados: number
  historicoContrato: number
  universo: number
  kwpAtivo: number
  valorAtivo: number
  porMomento: Record<Momento, { n: number; kwp: number }>
  parados: { vermelho: number; amarelo: number; verde: number; pct: number }
  fila: { n: number; pendenciaTecnica: number; maisAntigo: number }
  retrabalho: { pct: number; base: number }
  obra: { idadeMediana: number | null; n: number }
  monitoramento: { pct: number; base: number; relogioSemMonitoramento: number }
  usina: { geracaoPrevistaPct: number; ucPct: number; geracaoPrevistaMWh: number }
  gestao: { completaPct: number; donoPct: number; prazoFuturoPct: number; prazoVencido: number; semPrazo: number; semDono: number }
  fluxo: FluxoMarco[]
  concessionarias: { nome: string; n: number }[]
  homologacao: number
  vendas: { mes: string; n: number; kwp: number }[]
  /** Encerrados por mês (data do último status no Groner), últimos 12 meses. */
  concluidosPorMes?: { mes: string; n: number }[]
  preenchimento: { campo: string; rotulo: string; grupo: 'cheio' | 'vazio'; pct: number }[]
}

export interface Engenharia {
  geradoEm: string
  hoje: string
  fonte: { sourceUpdatedAt?: string; lastSuccessfulRunAt?: string; mode?: string } | null
  prazos: { sla: Record<string, number>; metaEntrega: number; salvoEm: string | null; proposta: boolean }
  cards: CardEngenharia[]
  painel: Painel
  edicao: { armazenamento: boolean; acoes: boolean; prazos: boolean }
}
