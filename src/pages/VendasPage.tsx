import { useMemo, useState } from 'react'
import { api } from '../api/client'
import { useRawData } from '../api/useRawData'
import { BarChartGeneric } from '../components/BarChartGeneric'
import { DataTable } from '../components/DataTable'
import { DetailRow, Modal } from '../components/Modal'
import { DonutChart } from '../components/DonutChart'
import { FilterBar, type FilterDef } from '../components/FilterBar'
import { KpiCard } from '../components/KpiCard'
import { useFilters, uniqueSorted } from '../hooks/useFilters'
import { currency, number } from '../lib/palette'
import { reaisCurto } from '../lib/formatoGrafico'
import { agruparPorFunil } from '../features/painel/funis'
import { Cartao } from '../features/painel/ui/base'
import { BarrasHorizontais } from '../features/painel/ui/graficos'
import { combinarVendas, filtrarVendas, MESES_ROTULO as MESES, rotuloMes, somaInformada, type VendaPainel } from '../features/vendas/vendasPainel'

/**
 * Aba Vendas. Fonte principal: /api/indicadores/sales (mesmo formato de docs/data_sales.json,
 * montado do Neon: vendedor, tipo de negócio, status, origem, UF/cidade, valores, mês/ano).
 * Comissão, ciclo, kit e lucro vêm da venda gravada (/api/raw/vendas), casados pelo código.
 */
export function VendasPage() {
  const sales = useRawData('indicadores-sales', api.getSalesIndicadores)
  const vendasRaw = useRawData('vendas', api.getVendasRaw)
  const projetos = useRawData('projetos', api.getProjetosRaw)
  const { values, onChange, onClear } = useFilters()
  const [busca, setBusca] = useState('')
  const [vendaSelecionada, setVendaSelecionada] = useState<VendaPainel | null>(null)
  const [grupoSelecionado, setGrupoSelecionado] = useState<{ titulo: string; vendas: VendaPainel[] } | null>(null)

  // Sem a lista de sales (erro), a aba segue com as vendas gravadas, no mesmo formato.
  const carregando = sales.loading || (vendasRaw.loading && !sales.data)
  const vendas = useMemo(
    () => (sales.data || vendasRaw.data ? combinarVendas(sales.data, vendasRaw.data) : null),
    [sales.data, vendasRaw.data],
  )

  const filtros: FilterDef[] = useMemo(() => {
    if (!vendas) return []
    const lista: FilterDef[] = [
      { key: 'ano', label: 'Ano', options: uniqueSorted(vendas.map((v) => (v.ano ? String(v.ano) : null))).reverse() },
      { key: 'mes', label: 'Mês', options: MESES },
      { key: 'vendedor', label: 'Vendedor', options: uniqueSorted(vendas.map((v) => v.vendedor)) },
      { key: 'tipoNegocio', label: 'Tipo de negócio', options: uniqueSorted(vendas.map((v) => v.tipoNegocio)) },
      { key: 'origem', label: 'Origem', options: uniqueSorted(vendas.map((v) => v.origemContato)) },
      { key: 'uf', label: 'Estado', options: uniqueSorted(vendas.map((v) => v.uf)) },
      { key: 'statusVenda', label: 'Status da venda', options: uniqueSorted(vendas.map((v) => v.statusVenda)) },
    ]
    // Campo que ainda não chega do banco (lista vazia) não vira filtro.
    return lista.filter((f) => f.options.length > 0)
  }, [vendas])

  const filtradas = useMemo(() => (vendas ? filtrarVendas(vendas, { ...values, busca }) : []), [vendas, values, busca])

  const valorPorFunil = useMemo(() => agruparPorFunil(projetos.data ?? []).filter((f) => f.valor > 0), [projetos.data])

  if (carregando) return <p className="p-10 text-center text-[var(--text-secondary)]">Carregando vendas…</p>
  if (!vendas) return <p className="p-10 text-center text-red-600 dark:text-red-400">{sales.error ?? vendasRaw.error ?? 'Não foi possível carregar as vendas.'}</p>

  const valorTotal = filtradas.reduce((s, v) => s + v.valorTotal, 0)
  const ticketMedio = filtradas.length ? valorTotal / filtradas.length : 0
  const composicao = (['valorProduto', 'valorServico', 'valorEntrada', 'valorFinanciado'] as const).map((campo) => ({ campo, ...somaInformada(filtradas, campo) }))
  const ROTULO_VALOR = { valorProduto: 'Valor de produto', valorServico: 'Valor de serviço', valorEntrada: 'Valor de entrada', valorFinanciado: 'Valor financiado' }

  const porTipo = agrupar(filtradas, (v) => v.tipoNegocio ?? 'Não informado')
  const porStatusNegocio = agrupar(filtradas, (v) => v.statusNegocio ?? 'Não informado')
  const porOrigem = agrupar(filtradas, (v) => v.origemContato ?? 'Não informado')
  const porVendedor = agrupar(filtradas, (v) => v.vendedor ?? 'Não informado')
  const porMes = agrupar(filtradas, rotuloMes)
  const porAno = agrupar(filtradas, (v) => (v.ano ? String(v.ano) : '—'))
  const porEstado = agrupar(filtradas, (v) => v.uf ?? 'Não informado')
  const porFornecedor = agrupar(filtradas, (v) => (v.fornecedor ? v.fornecedor.trim().toUpperCase() : 'Não informado'))
  const temTipo = filtradas.some((v) => v.tipoNegocio)
  const temStatusNegocio = filtradas.some((v) => v.statusNegocio)

  const valorPorCidade = new Map<string, { cidade: string; estado: string; quantidade: number; valorTotal: number; vendas: VendaPainel[] }>()
  for (const v of filtradas) {
    const cidade = v.cidade ?? 'Não informado'
    const chave = `${cidade}/${v.uf ?? ''}`
    const cur = valorPorCidade.get(chave) ?? { cidade, estado: v.uf ?? '—', quantidade: 0, valorTotal: 0, vendas: [] }
    cur.quantidade += 1
    cur.valorTotal += v.valorTotal
    cur.vendas.push(v)
    valorPorCidade.set(chave, cur)
  }
  const topCidades = [...valorPorCidade.values()].sort((a, b) => b.valorTotal - a.valorTotal).slice(0, 15)

  const valorPorMes = new Map<string, number>()
  for (const v of filtradas) {
    const chave = v.ano && v.mes ? `${v.ano}-${String(v.mes).padStart(2, '0')}` : '—'
    valorPorMes.set(chave, (valorPorMes.get(chave) ?? 0) + v.valorTotal)
  }
  const valorPorMesData = [...valorPorMes.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([mes, value]) => ({ name: mes, value }))

  const porDia = new Map<string, { dia: string; quantidade: number; valorTotal: number; vendas: VendaPainel[] }>()
  for (const v of filtradas) {
    const dia = v.dataVenda?.slice(0, 10) ?? '—'
    const cur = porDia.get(dia) ?? { dia, quantidade: 0, valorTotal: 0, vendas: [] }
    cur.quantidade += 1
    cur.valorTotal += v.valorTotal
    cur.vendas.push(v)
    porDia.set(dia, cur)
  }
  const diasOrdenados = [...porDia.values()].sort((a, b) => b.dia.localeCompare(a.dia))
  const dataCurta = (d: string | null) => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—')
  const valorOuTraco = (n: number | null | undefined) => (n != null ? currency.format(n) : '—')

  return (
    <div>
      {sales.error && (
        <p role="alert" className="mb-4 rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Não foi possível ler a lista de vendas dos indicadores ({sales.error}); mostrando as vendas gravadas, sem tipo de negócio e composição do valor.
        </p>
      )}

      <FilterBar filters={filtros} values={values} onChange={onChange} onClear={onClear} />

      <div className="mb-4 max-w-xs">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome do cliente…"
          className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--input-bg)] px-3 py-1.5 text-sm text-[var(--text-primary)] focus:border-icf-green focus:outline-none"
        />
      </div>

      <section className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Quantidade de vendas" value={number.format(filtradas.length)} />
        <KpiCard label="Soma de valor total" value={currency.format(valorTotal)} />
        <KpiCard label="Ticket médio" value={currency.format(ticketMedio)} />
      </section>

      <section className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4" aria-label="Composição do valor">
        {composicao.map((c) => (
          <KpiCard
            key={c.campo}
            label={ROTULO_VALOR[c.campo]}
            value={c.informadas ? currency.format(c.soma) : '—'}
            hint={`${number.format(c.informadas)} de ${number.format(filtradas.length)} vendas informam`}
          />
        ))}
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DonutChart title="Tipo de negócio" data={porTipo} />
        <DonutChart title="Origem do negócio" data={porOrigem} />
        <DonutChart title="Visão por vendedor" data={porVendedor} />
      </section>
      {!temTipo && (
        <p className="-mt-4 mb-6 text-xs text-[var(--text-muted)]">
          Tipo e status do negócio ainda não chegam do banco: dependem do projeto da venda, que passa a ser gravado na próxima carga diária de vendas.
        </p>
      )}

      <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <BarChartGeneric title="Vendas por mês (quantidade)" data={[...porMes].sort((a, b) => MESES.indexOf(a.name) - MESES.indexOf(b.name))} ordenarPorValor={false} />
        <BarChartGeneric title="Ano da venda" data={porAno} layout="vertical" />
        <DonutChart title="Vendas por estado" data={porEstado} />
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4">
        <BarChartGeneric
          title="Valor vendido por mês"
          subtitle="Últimos 12 meses com venda (ano-mês)"
          data={valorPorMesData.slice(-12)}
          layout="vertical"
          formatValue={reaisCurto}
          ordenarPorValor={false}
        />
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4">
        <Cartao
          titulo="Valor por funil (R$)"
          subtitulo="Soma, em cada funil do Groner, do valor da venda de cada card; sem venda, o da proposta aceita. Todos os cards cadastrados (não segue os filtros acima); funis sem valor não aparecem."
          colunas={['Funil', 'Valor', 'Cards']}
          linhas={valorPorFunil.map((f) => ({ nome: f.funil, valores: [currency.format(f.valor), number.format(f.cards)] }))}
        >
          {projetos.error && !projetos.data ? (
            <p role="alert" className="py-6 text-center text-xs text-[var(--text-muted)]">Não foi possível carregar os cards: {projetos.error}.</p>
          ) : !projetos.data ? (
            <p role="status" className="py-6 text-center text-xs text-[var(--text-muted)]">Carregando os cards…</p>
          ) : (
            <BarrasHorizontais dados={valorPorFunil.map((f) => ({ nome: f.funil, valor: f.valor }))} formatar={reaisCurto} rotuloValor="Valor" larguraNomes={260} />
          )}
        </Cartao>
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {temStatusNegocio && <DonutChart title="Status do negócio" data={porStatusNegocio} />}
        <DonutChart title="Fornecedor do kit" data={porFornecedor} />
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4">
        <DataTable
          title="Top cidades"
          rows={topCidades}
          maxHeight={320}
          onRowClick={(r) => setGrupoSelecionado({ titulo: `${r.cidade} / ${r.estado}`, vendas: r.vendas })}
          columns={[
            { key: 'cidade', label: 'Cidade', render: (r) => `${r.cidade} / ${r.estado}` },
            { key: 'quantidade', label: 'Qtd', align: 'right', render: (r) => number.format(r.quantidade) },
            { key: 'valorTotal', label: 'Valor total', align: 'right', render: (r) => currency.format(r.valorTotal) },
          ]}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DataTable
          title="Vendas diárias"
          rows={diasOrdenados}
          maxHeight={320}
          onRowClick={(r) => setGrupoSelecionado({ titulo: dataCurta(r.dia), vendas: r.vendas })}
          columns={[
            { key: 'dia', label: 'Dia', render: (r) => dataCurta(r.dia) },
            { key: 'quantidade', label: 'Qtd', align: 'right', render: (r) => number.format(r.quantidade) },
            { key: 'valorTotal', label: 'Valor total', align: 'right', render: (r) => currency.format(r.valorTotal) },
          ]}
        />
        <DataTable
          title="Extrato"
          rows={filtradas.slice().sort((a, b) => (b.dataVenda ?? '').localeCompare(a.dataVenda ?? ''))}
          maxHeight={320}
          onRowClick={setVendaSelecionada}
          columns={[
            { key: 'vendedor', label: 'Vendedor', render: (r) => r.vendedor ?? '—' },
            { key: 'nome', label: 'Nome', render: (r) => r.nome ?? '—' },
            { key: 'tipoNegocio', label: 'Tipo', render: (r) => r.tipoNegocio ?? '—' },
            { key: 'cidade', label: 'Cidade/UF', render: (r) => (r.cidade ? `${r.cidade}/${r.uf ?? '—'}` : '—') },
            { key: 'valorTotal', label: 'Valor', align: 'right', render: (r) => currency.format(r.valorTotal) },
          ]}
        />
      </section>

      {vendaSelecionada && (
        <Modal title={vendaSelecionada.nome ?? `Venda ${vendaSelecionada.codigo}`} onClose={() => setVendaSelecionada(null)}>
          <DetailRow label="Código" value={String(vendaSelecionada.codigo)} />
          <DetailRow label="Vendedor" value={vendaSelecionada.vendedor} />
          <DetailRow label="Tipo de negócio" value={vendaSelecionada.tipoNegocio} />
          <DetailRow label="Etapa do negócio" value={vendaSelecionada.etapaNegocio} />
          <DetailRow label="Status do negócio" value={vendaSelecionada.statusNegocio} />
          <DetailRow label="Status da venda" value={vendaSelecionada.statusVenda ?? vendaSelecionada.statusNome} />
          <DetailRow label="Valor total" value={currency.format(vendaSelecionada.valorTotal)} />
          <DetailRow label="Valor de produto" value={valorOuTraco(vendaSelecionada.valorProduto)} />
          <DetailRow label="Valor de serviço" value={valorOuTraco(vendaSelecionada.valorServico)} />
          <DetailRow label="Entrada / financiado" value={`${valorOuTraco(vendaSelecionada.valorEntrada)} / ${valorOuTraco(vendaSelecionada.valorFinanciado)}`} />
          <DetailRow label="Comissão" value={valorOuTraco(vendaSelecionada.valorComissao)} />
          <DetailRow label="Data da venda" value={dataCurta(vendaSelecionada.dataVenda)} />
          <DetailRow label="Ciclo de venda" value={vendaSelecionada.cicloVenda != null ? `${Math.round(vendaSelecionada.cicloVenda)} dias` : '—'} />
          <DetailRow label="Origem" value={vendaSelecionada.origemContato} />
          <DetailRow label="Cidade/UF" value={vendaSelecionada.cidade ? `${vendaSelecionada.cidade}/${vendaSelecionada.uf ?? '—'}` : '—'} />
          <DetailRow label="Bairro" value={vendaSelecionada.bairro} />
          <DetailRow label="Fornecedor do kit" value={vendaSelecionada.fornecedor} />
          <DetailRow label="Placa" value={vendaSelecionada.placa} />
          <DetailRow label="Inversor" value={vendaSelecionada.inversor} />
          <DetailRow label="Lucro" value={valorOuTraco(vendaSelecionada.lucro)} />
        </Modal>
      )}

      {grupoSelecionado && (
        <Modal title={grupoSelecionado.titulo} onClose={() => setGrupoSelecionado(null)}>
          <DataTable
            title={`${grupoSelecionado.vendas.length} venda(s)`}
            rows={grupoSelecionado.vendas}
            maxHeight={400}
            onRowClick={(v) => {
              setGrupoSelecionado(null)
              setVendaSelecionada(v)
            }}
            columns={[
              { key: 'nome', label: 'Cliente', render: (r) => r.nome ?? '—' },
              { key: 'vendedor', label: 'Vendedor', render: (r) => r.vendedor ?? '—' },
              { key: 'valorTotal', label: 'Valor', align: 'right', render: (r) => currency.format(r.valorTotal) },
            ]}
          />
        </Modal>
      )}
    </div>
  )
}

function agrupar<T>(items: T[], keyFn: (item: T) => string) {
  const map = new Map<string, number>()
  for (const item of items) {
    const key = keyFn(item)
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  return [...map.entries()].map(([name, value]) => ({ name, value }))
}
