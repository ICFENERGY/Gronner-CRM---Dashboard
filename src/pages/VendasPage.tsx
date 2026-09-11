import { useMemo, useState } from 'react'
import { api } from '../api/client'
import { useRawData } from '../api/useRawData'
import type { VendaRaw } from '../api/types'
import { BarChartGeneric } from '../components/BarChartGeneric'
import { DataTable } from '../components/DataTable'
import { DetailRow, Modal } from '../components/Modal'
import { DonutChart } from '../components/DonutChart'
import { FilterBar, type FilterDef } from '../components/FilterBar'
import { KpiCard } from '../components/KpiCard'
import { useFilters, uniqueSorted } from '../hooks/useFilters'
import { currency, number } from '../lib/palette'

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export function VendasPage() {
  const { data: vendas, loading, error } = useRawData('vendas', api.getVendasRaw)
  const { values, onChange, onClear } = useFilters()
  const [busca, setBusca] = useState('')
  const [vendaSelecionada, setVendaSelecionada] = useState<VendaRaw | null>(null)
  const [grupoSelecionado, setGrupoSelecionado] = useState<{ titulo: string; vendas: VendaRaw[] } | null>(null)

  const filtros: FilterDef[] = useMemo(() => {
    if (!vendas) return []
    return [
      { key: 'ano', label: 'Ano', options: uniqueSorted(vendas.map((v) => v.dataVenda?.slice(0, 4))).reverse() },
      {
        key: 'mes',
        label: 'Mês',
        options: MESES,
      },
      { key: 'vendedor', label: 'Vendedor', options: uniqueSorted(vendas.map((v) => v.vendedor)) },
      { key: 'origemNome', label: 'Origem', options: uniqueSorted(vendas.map((v) => v.origemNome)) },
      { key: 'estado', label: 'Estado', options: uniqueSorted(vendas.map((v) => v.estado)) },
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendas])

  const filtradas = useMemo(() => {
    if (!vendas) return []
    return vendas.filter((v) => {
      if (values.ano && v.dataVenda?.slice(0, 4) !== values.ano) return false
      if (values.mes) {
        const mesIdx = Number(v.dataVenda?.slice(5, 7)) - 1
        if (MESES[mesIdx] !== values.mes) return false
      }
      if (values.vendedor && v.vendedor !== values.vendedor) return false
      if (values.origemNome && v.origemNome !== values.origemNome) return false
      if (values.estado && v.estado !== values.estado) return false
      if (busca && !v.nome.toLowerCase().includes(busca.toLowerCase())) return false
      return true
    })
  }, [vendas, values, busca])

  if (loading) return <p className="p-10 text-center text-[var(--text-secondary)]">Carregando vendas…</p>
  if (error) return <p className="p-10 text-center text-red-600 dark:text-red-400">{error}</p>

  const valorTotal = filtradas.reduce((s, v) => s + v.valorTotal, 0)
  const ticketMedio = filtradas.length ? valorTotal / filtradas.length : 0

  const porOrigem = agrupar(filtradas, (v) => v.origemNome ?? 'Não informado')
  const porVendedor = agrupar(filtradas, (v) => v.vendedor)
  const porMes = agrupar(filtradas, (v) => MESES[Number(v.dataVenda?.slice(5, 7)) - 1] ?? '—')
  const porAno = agrupar(filtradas, (v) => v.dataVenda?.slice(0, 4) ?? '—')
  const porEstado = agrupar(filtradas, (v) => v.estado ?? 'Não informado')
  const porFornecedor = agrupar(filtradas, (v) => (v.fornecedor ? v.fornecedor.trim().toUpperCase() : 'Não informado'))

  const valorPorCidade = new Map<string, { cidade: string; estado: string; quantidade: number; valorTotal: number; vendas: VendaRaw[] }>()
  for (const v of filtradas) {
    const cidade = v.cidade ?? 'Não informado'
    const chave = `${cidade}/${v.estado ?? ''}`
    const cur = valorPorCidade.get(chave) ?? { cidade, estado: v.estado ?? '—', quantidade: 0, valorTotal: 0, vendas: [] }
    cur.quantidade += 1
    cur.valorTotal += v.valorTotal
    cur.vendas.push(v)
    valorPorCidade.set(chave, cur)
  }
  const topCidades = [...valorPorCidade.values()].sort((a, b) => b.valorTotal - a.valorTotal).slice(0, 15)

  const valorPorMes = new Map<string, number>()
  for (const v of filtradas) {
    const chave = v.dataVenda?.slice(0, 7) ?? '—'
    valorPorMes.set(chave, (valorPorMes.get(chave) ?? 0) + v.valorTotal)
  }
  const valorPorMesData = [...valorPorMes.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([mes, value]) => ({ name: mes, value }))

  const porDia = new Map<string, { dia: string; quantidade: number; valorTotal: number; vendas: VendaRaw[] }>()
  for (const v of filtradas) {
    const dia = v.dataVenda?.slice(0, 10) ?? '—'
    const cur = porDia.get(dia) ?? { dia, quantidade: 0, valorTotal: 0, vendas: [] }
    cur.quantidade += 1
    cur.valorTotal += v.valorTotal
    cur.vendas.push(v)
    porDia.set(dia, cur)
  }
  const diasOrdenados = [...porDia.values()].sort((a, b) => b.dia.localeCompare(a.dia))

  return (
    <div>
      <FilterBar filters={filtros} values={values} onChange={onChange} onClear={onClear} />

      <div className="mb-4 max-w-xs">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome do cliente…"
          className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--input-bg)] px-3 py-1.5 text-sm text-[var(--text-primary)] focus:border-icf-green focus:outline-none"
        />
      </div>

      <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Quantidade de vendas" value={number.format(filtradas.length)} />
        <KpiCard label="Soma de valor total" value={currency.format(valorTotal)} />
        <KpiCard label="Ticket médio" value={currency.format(ticketMedio)} />
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DonutChart title="Origem do negócio" data={porOrigem} />
        <DonutChart title="Visão por vendedor" data={porVendedor} />
        <DonutChart title="Venda mensal (%)" data={porMes} />
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarChartGeneric title="Ano da venda" data={porAno} layout="vertical" />
        <BarChartGeneric title="Valor vendido por mês" data={valorPorMesData} layout="vertical" formatValue={(v) => currency.format(v)} />
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarChartGeneric title="Vendas por estado" data={porEstado} layout="vertical" />
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
          onRowClick={(r) => setGrupoSelecionado({ titulo: new Date(r.dia).toLocaleDateString('pt-BR'), vendas: r.vendas })}
          columns={[
            { key: 'dia', label: 'Dia', render: (r) => new Date(r.dia).toLocaleDateString('pt-BR') },
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
            { key: 'vendedor', label: 'Vendedor', render: (r) => r.vendedor },
            { key: 'nome', label: 'Nome', render: (r) => r.nome },
            { key: 'cidade', label: 'Cidade/UF', render: (r) => (r.cidade ? `${r.cidade}/${r.estado}` : '—') },
            { key: 'valorTotal', label: 'Valor', align: 'right', render: (r) => currency.format(r.valorTotal) },
          ]}
        />
      </section>

      {vendaSelecionada && (
        <Modal title={vendaSelecionada.nome} onClose={() => setVendaSelecionada(null)}>
          <DetailRow label="Vendedor" value={vendaSelecionada.vendedor} />
          <DetailRow label="Valor total" value={currency.format(vendaSelecionada.valorTotal)} />
          <DetailRow label="Comissão" value={currency.format(vendaSelecionada.valorComissao)} />
          <DetailRow label="Data da venda" value={vendaSelecionada.dataVenda ? new Date(vendaSelecionada.dataVenda).toLocaleString('pt-BR') : '—'} />
          <DetailRow label="Ciclo de venda" value={vendaSelecionada.cicloVenda != null ? `${Math.round(vendaSelecionada.cicloVenda)} dias` : '—'} />
          <DetailRow label="Origem" value={vendaSelecionada.origemNome} />
          <DetailRow label="Status" value={vendaSelecionada.statusNome} />
          <DetailRow label="Cidade/UF" value={vendaSelecionada.cidade ? `${vendaSelecionada.cidade}/${vendaSelecionada.estado}` : '—'} />
          <DetailRow label="Bairro" value={vendaSelecionada.bairro} />
          <DetailRow label="Fornecedor do kit" value={vendaSelecionada.fornecedor} />
          <DetailRow label="Placa" value={vendaSelecionada.placa} />
          <DetailRow label="Inversor" value={vendaSelecionada.inversor} />
          <DetailRow label="Lucro" value={vendaSelecionada.lucro != null ? currency.format(vendaSelecionada.lucro) : '—'} />
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
              { key: 'nome', label: 'Cliente', render: (r) => r.nome },
              { key: 'vendedor', label: 'Vendedor', render: (r) => r.vendedor },
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
