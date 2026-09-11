import { useMemo, useState } from 'react'
import { api } from '../api/client'
import { useRawData } from '../api/useRawData'
import { BarChartGeneric } from '../components/BarChartGeneric'
import { FilterBar, type FilterDef } from '../components/FilterBar'
import { FunilStatusTree } from '../components/FunilStatusTree'
import { KpiCard } from '../components/KpiCard'
import { MultiYearBarChart } from '../components/MultiYearBarChart'
import { PivotDiaMes } from '../components/PivotDiaMes'
import { useFilters, uniqueSorted } from '../hooks/useFilters'
import { currency, decimal, number } from '../lib/palette'

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export function ValidacaoCadastroPage() {
  const { data: propostas, loading, error } = useRawData('propostas', api.getPropostasRaw)
  const { values, onChange, onClear } = useFilters()
  const [busca, setBusca] = useState('')

  const filtros: FilterDef[] = useMemo(() => {
    if (!propostas) return []
    return [
      { key: 'ano', label: 'Ano', options: uniqueSorted(propostas.map((p) => p.dataInclusao?.slice(0, 4))).reverse() },
      { key: 'mes', label: 'Mês', options: MESES },
      { key: 'etapaProjeto', label: 'Etapa', options: uniqueSorted(propostas.map((p) => p.etapaProjeto)) },
      { key: 'statusProjeto', label: 'Status', options: uniqueSorted(propostas.map((p) => p.statusProjeto)) },
      { key: 'vendedorNome', label: 'Vendedor', options: uniqueSorted(propostas.map((p) => p.vendedorNome)) },
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propostas])

  const filtradas = useMemo(() => {
    if (!propostas) return []
    return propostas.filter((p) => {
      if (values.ano && p.dataInclusao?.slice(0, 4) !== values.ano) return false
      if (values.mes && MESES[Number(p.dataInclusao?.slice(5, 7)) - 1] !== values.mes) return false
      if (values.etapaProjeto && p.etapaProjeto !== values.etapaProjeto) return false
      if (values.statusProjeto && p.statusProjeto !== values.statusProjeto) return false
      if (values.vendedorNome && p.vendedorNome !== values.vendedorNome) return false
      if (busca && !(p.lead ?? p.projeto ?? '').toLowerCase().includes(busca.toLowerCase())) return false
      return true
    })
  }, [propostas, values, busca])

  if (loading) return <p className="p-10 text-center text-[var(--text-secondary)]">Carregando propostas…</p>
  if (error) return <p className="p-10 text-center text-red-600 dark:text-red-400">{error}</p>

  const valorPropostaKwh = filtradas.reduce((s, p) => s + (p.kwP ?? 0), 0)
  const valorPropostaRs = filtradas.reduce((s, p) => s + (p.preco ?? 0), 0)
  const aprovadas = filtradas.filter((p) => p.aceita)
  const naoAprovadas = filtradas.filter((p) => !p.aceita)
  const valorAprovadas = aprovadas.reduce((s, p) => s + (p.preco ?? 0), 0)
  const valorNaoAprovadas = naoAprovadas.reduce((s, p) => s + (p.preco ?? 0), 0)
  const ticketMedio = filtradas.length ? valorPropostaRs / filtradas.length : 0

  const porTipo = agrupar(filtradas, (p) => p.projetoTipo ?? 'Não informado')
  const porOrigem = agrupar(filtradas, (p) => p.origem ?? 'Não informado')
  const porVendedor = agrupar(filtradas, (p) => p.vendedorNome ?? 'Não informado')
  const porStatus = agrupar(filtradas, (p) => p.statusProjeto ?? 'Sem status')

  return (
    <div>
      <FilterBar filters={filtros} values={values} onChange={onChange} onClear={onClear} />

      <div className="mb-4 max-w-xs">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por cliente…"
          className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--input-bg)] px-3 py-1.5 text-sm text-[var(--text-primary)] focus:border-icf-green focus:outline-none"
        />
      </div>

      <section className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Quantidade de cards" value={number.format(filtradas.length)} />
        <KpiCard label="Valor proposta (kWp)" value={decimal.format(valorPropostaKwh)} />
        <KpiCard label="Valor proposta (R$)" value={currency.format(valorPropostaRs)} />
        <KpiCard label="Propostas aprovadas" value={currency.format(valorAprovadas)} hint={`${aprovadas.length} cards`} />
        <KpiCard label="Propostas não aprovadas" value={currency.format(valorNaoAprovadas)} hint={`${naoAprovadas.length} cards`} />
        <KpiCard label="Ticket médio (proposta)" value={currency.format(ticketMedio)} />
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <BarChartGeneric title="Negócios por tipo de negócio" data={porTipo} layout="vertical" />
        <BarChartGeneric title="Contato origem" data={porOrigem} />
        <BarChartGeneric title="Negócios por vendedor" data={porVendedor} layout="vertical" />
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PivotDiaMes title="Card x mês x dia (data de cadastro)" items={filtradas} />
        <FunilStatusTree
          title="Card x etapa x status"
          items={filtradas.map((p) => ({ funil: p.etapaProjeto, etapa: p.statusProjeto }))}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MultiYearBarChart title="Cards em aberto por mês" items={naoAprovadas} />
        <BarChartGeneric title="Cards por status" data={porStatus} layout="vertical" maxBars={15} />
      </section>
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
