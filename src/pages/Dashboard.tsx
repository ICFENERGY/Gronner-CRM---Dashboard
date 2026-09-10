import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Summary } from '../api/types'
import { BarChartGeneric } from '../components/BarChartGeneric'
import { CategoriaLegend } from '../components/CategoriaLegend'
import { DonutChart } from '../components/DonutChart'
import { FunilPipeline } from '../components/FunilPipeline'
import { KpiCard } from '../components/KpiCard'
import { PivotFunilAnoTable } from '../components/PivotFunilAnoTable'
import { SalesTrendChart } from '../components/SalesTrendChart'
import { TopVendedores } from '../components/TopVendedores'

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const number = new Intl.NumberFormat('pt-BR')

export function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  function load(refresh = false) {
    const setBusy = refresh ? setRefreshing : setLoading
    setBusy(true)
    setError(null)
    api
      .getSummary(refresh)
      .then(setSummary)
      .catch((err) => setError(err.message))
      .finally(() => setBusy(false))
  }

  useEffect(() => {
    load(false)
  }, [])

  if (loading) {
    return <p className="p-10 text-center text-slate-400">Carregando dados do Groner CRM…</p>
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-red-900 bg-red-950/40 p-6 text-red-200">
        <p className="font-medium">Não foi possível carregar os dados.</p>
        <p className="mt-2 text-sm text-red-300">{error}</p>
        <button
          onClick={() => load(false)}
          className="mt-4 rounded-lg bg-red-800 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          Tentar novamente
        </button>
      </div>
    )
  }

  if (!summary) return null

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <p className="text-xs text-slate-500">Atualizado em {new Date(summary.geradoEm).toLocaleString('pt-BR')}</p>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="rounded-lg border border-icf-green bg-icf-green/10 px-4 py-2 text-sm font-medium text-icf-greenLight hover:bg-icf-green/20 disabled:opacity-50"
        >
          {refreshing ? 'Atualizando…' : 'Atualizar dados'}
        </button>
      </div>

      <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Leads" value={number.format(summary.leads.total)} />
        <KpiCard
          label="Projetos"
          value={number.format(summary.projetos.total)}
          hint={`Amostra analisada: ${number.format(summary.projetos.amostra)}`}
        />
        <KpiCard
          label="Vendas realizadas"
          value={number.format(summary.vendas.total)}
          hint={`Ticket médio: ${currency.format(summary.vendas.ticketMedio)}`}
        />
        <KpiCard label="Valor total vendido" value={currency.format(summary.vendas.valorTotal)} />
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Comissões totais" value={currency.format(summary.vendas.comissaoTotal)} />
        <KpiCard label="Pré-propostas" value={number.format(summary.prepropostas.total)} />
        <KpiCard
          label="Pré-propostas aceitas"
          value={number.format(summary.prepropostas.aceitas)}
          hint={currency.format(summary.prepropostas.valorTotalAceita)}
        />
        <KpiCard label="Valor total em propostas" value={currency.format(summary.prepropostas.valorTotalGeral)} />
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4">
        <CategoriaLegend data={summary.projetos.porCategoria} />
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4">
        <FunilPipeline data={summary.projetos.porFunil} />
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4">
        <PivotFunilAnoTable data={summary.projetos.pivotFunilAno} />
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SalesTrendChart data={summary.vendas.porMes} />
        <TopVendedores data={summary.vendas.porVendedor} />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarChartGeneric title="Projetos por estado" data={summary.projetos.porEstado} layout="vertical" />
        <DonutChart title="Projetos por concessionária" data={summary.projetos.porConcessionaria} />
      </section>
    </div>
  )
}
