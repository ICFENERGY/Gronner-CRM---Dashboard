export type MomentoKey = 'pre' | 'imp' | 'usi'

export interface Marco {
  k: string
  nome: string
  mom: MomentoKey
  sla: number
  papel: string
  acao: string
  dep: string
  paralelo?: boolean
}

export declare const MOMENTOS: Record<MomentoKey, string>
export declare const MARCOS: Marco[]
export declare const META_ENTREGA_PADRAO: number
export declare const LIMITES_PARADO: { verde: number; amarelo: number }
export declare function momentoDoMarco(marco: string | null): MomentoKey | 'fim' | null
