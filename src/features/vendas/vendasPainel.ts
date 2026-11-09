import type { SaleIndicador, VendaRaw } from '../../api/types'

/**
 * Venda da aba Vendas: o formato de docs/data_sales.json (fonte principal, /api/indicadores/sales)
 * mais os campos que só a venda gravada tem (/api/raw/vendas: comissão, ciclo, kit, lucro).
 */
export interface VendaPainel extends SaleIndicador {
  valorComissao: number | null
  cicloVenda: number | null
  statusNome: string | null
  bairro: string | null
  fornecedor: string | null
  placa: string | null
  inversor: string | null
  lucro: number | null
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

const limpo = (v: string | null | undefined) => {
  const t = typeof v === 'string' ? v.trim() : ''
  return t === '' ? null : t
}

function anoMes(data: string | null | undefined) {
  const m = /^(\d{4})-(\d{2})/.exec(data ?? '')
  return m ? { ano: Number(m[1]), mes: Number(m[2]) } : { ano: null, mes: null }
}

/** Venda gravada (formato antigo) no formato de sales: usado quando /api/indicadores/sales falha. */
export function saleDeVendaRaw(v: VendaRaw): SaleIndicador {
  const { ano, mes } = anoMes(v.dataVenda)
  return {
    codigo: v.id, idNegocio: null, nome: v.nome ?? null, vendedor: limpo(v.vendedor), tipoNegocio: null, tipoVenda: null,
    statusVenda: null, etapaNegocio: null, statusNegocio: null, origemContato: limpo(v.origemNome), cidade: v.cidade ?? null,
    uf: v.estado ?? null, cep: null, logradouro: null, valorTotal: Number(v.valorTotal) || 0, valorEntrada: null,
    valorFinanciado: null, valorProduto: null, valorPago: null, valorServico: null, dataCadastro: null,
    dataVenda: v.dataVenda ?? null, ano, mes,
  }
}

/** Junta as duas fontes pelo código da venda (= id). Sem sales, usa só as vendas gravadas. */
export function combinarVendas(sales: SaleIndicador[] | null, vendas: VendaRaw[] | null): VendaPainel[] {
  const extras = new Map((vendas ?? []).map((v) => [Number(v.id), v]))
  const base = sales ?? (vendas ?? []).map(saleDeVendaRaw)
  return base.map((s) => {
    const v = extras.get(Number(s.codigo))
    return {
      ...s,
      vendedor: limpo(s.vendedor),
      origemContato: limpo(s.origemContato),
      valorTotal: Number(s.valorTotal) || 0,
      valorComissao: v?.valorComissao ?? null,
      cicloVenda: v?.cicloVenda ?? null,
      statusNome: v?.statusNome ?? null,
      bairro: v?.bairro ?? null,
      fornecedor: v?.fornecedor ?? null,
      placa: v?.placa ?? null,
      inversor: v?.inversor ?? null,
      lucro: v?.lucro ?? null,
    }
  })
}

export interface FiltrosVendas {
  ano?: string
  mes?: string
  vendedor?: string
  origem?: string
  uf?: string
  tipoNegocio?: string
  statusVenda?: string
  busca?: string
}

/** Rótulo do mês (Jan…Dez) da venda, pelo campo `mes` da fonte. */
export const rotuloMes = (v: Pick<SaleIndicador, 'mes'>) => (v.mes ? MESES[v.mes - 1] ?? '—' : '—')

export function filtrarVendas<T extends SaleIndicador>(vendas: T[], f: FiltrosVendas): T[] {
  const busca = (f.busca ?? '').trim().toLowerCase()
  return vendas.filter((v) => {
    if (f.ano && String(v.ano ?? '') !== f.ano) return false
    if (f.mes && rotuloMes(v) !== f.mes) return false
    if (f.vendedor && v.vendedor !== f.vendedor) return false
    if (f.origem && v.origemContato !== f.origem) return false
    if (f.uf && v.uf !== f.uf) return false
    if (f.tipoNegocio && v.tipoNegocio !== f.tipoNegocio) return false
    if (f.statusVenda && v.statusVenda !== f.statusVenda) return false
    if (busca && !(v.nome ?? '').toLowerCase().includes(busca)) return false
    return true
  })
}

/** Soma de um valor opcional e quantas vendas o informam (para não mostrar 0 quando o campo não existe). */
export function somaInformada(vendas: SaleIndicador[], campo: 'valorProduto' | 'valorServico' | 'valorEntrada' | 'valorFinanciado' | 'valorPago') {
  let soma = 0
  let informadas = 0
  for (const v of vendas) {
    const n = v[campo]
    if (n == null || !Number.isFinite(n)) continue
    soma += n
    informadas += 1
  }
  return { soma, informadas }
}

export const MESES_ROTULO = MESES
