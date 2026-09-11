import { useMemo, useState } from 'react'
import { api } from '../api/client'
import { useRawData } from '../api/useRawData'
import { BarChartGeneric } from '../components/BarChartGeneric'
import { DataTable } from '../components/DataTable'
import { DonutChart } from '../components/DonutChart'
import { FilterBar, type FilterDef } from '../components/FilterBar'
import { KpiCard } from '../components/KpiCard'
import { useFilters, uniqueSorted } from '../hooks/useFilters'
import { currency, decimal, number } from '../lib/palette'

export function IndicadorTarefasPage() {
  const { data: tarefas, loading: loadingTarefas, error: errorTarefas } = useRawData('tarefas', api.getTarefasRaw)
  const { data: propostas, loading: loadingPropostas, error: errorPropostas } = useRawData('propostas', api.getPropostasRaw)
  const { values, onChange, onClear } = useFilters()
  const [busca, setBusca] = useState('')

  const filtros: FilterDef[] = useMemo(() => {
    if (!tarefas) return []
    return [
      { key: 'status', label: 'Status', options: uniqueSorted(tarefas.map((t) => t.status)) },
      { key: 'responsavel', label: 'Responsáveis', options: uniqueSorted(tarefas.flatMap((t) => t.responsaveis)) },
      { key: 'criadoPorNome', label: 'Vendedor', options: uniqueSorted(tarefas.map((t) => t.criadoPorNome)) },
      { key: 'tipo', label: 'Tipo da tarefa', options: uniqueSorted(tarefas.map((t) => t.tipo)) },
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tarefas])

  const [somenteAtrasadas, setSomenteAtrasadas] = useState(false)

  const filtradas = useMemo(() => {
    if (!tarefas) return []
    return tarefas.filter((t) => {
      if (values.status && t.status !== values.status) return false
      if (values.responsavel && !t.responsaveis.includes(values.responsavel)) return false
      if (values.criadoPorNome && t.criadoPorNome !== values.criadoPorNome) return false
      if (values.tipo && t.tipo !== values.tipo) return false
      if (somenteAtrasadas && !t.atrasada) return false
      if (busca && !(t.lead ?? t.projeto ?? '').toLowerCase().includes(busca.toLowerCase())) return false
      return true
    })
  }, [tarefas, values, busca, somenteAtrasadas])

  if (loadingTarefas || loadingPropostas) return <p className="p-10 text-center text-[var(--text-secondary)]">Carregando tarefas…</p>
  if (errorTarefas || errorPropostas) return <p className="p-10 text-center text-red-600 dark:text-red-400">{errorTarefas || errorPropostas}</p>

  const projetoIdsFiltrados = new Set(filtradas.map((t) => t.projetoId).filter(Boolean))
  const propostasAceitasRelacionadas = (propostas ?? []).filter((p) => p.aceita && projetoIdsFiltrados.has(p.projetoId))
  const somaKwh = propostasAceitasRelacionadas.reduce((s, p) => s + (p.kwP ?? 0), 0)
  const somaValor = propostasAceitasRelacionadas.reduce((s, p) => s + (p.preco ?? 0), 0)
  const somaRoi = propostasAceitasRelacionadas.reduce((s, p) => s + (p.anoRetornoInvestimento ?? 0), 0)

  const porStatus = agrupar(filtradas, (t) => t.status ?? 'Sem status')
  const porDono = agrupar(filtradas, (t) => t.criadoPorNome ?? 'Sem responsável')
  const porResponsavel = agrupar(
    filtradas.flatMap((t) => (t.responsaveis.length ? t.responsaveis : ['Sem responsável'])),
    (nome) => nome,
  )
  const porPrioridade = agrupar(filtradas, (t) => t.prioridade || 'Nenhuma')
  const porTipo = agrupar(filtradas, (t) => t.tipo ?? 'Sem tipo')

  const atrasadas = filtradas
    .filter((t) => t.atrasada)
    .map((t) => ({ ...t, diasAtraso: Math.floor((Date.now() - new Date(t.dataEntrega!).getTime()) / 86_400_000) }))
    .sort((a, b) => b.diasAtraso - a.diasAtraso)

  const porDataMap = new Map<string, number>()
  for (const t of filtradas) {
    const dia = t.dataInclusao?.slice(0, 10)
    if (!dia) continue
    porDataMap.set(dia, (porDataMap.get(dia) ?? 0) + 1)
  }
  const porData = [...porDataMap.entries()].sort((a, b) => b[0].localeCompare(a[0]))

  return (
    <div>
      <FilterBar filters={filtros} values={values} onChange={onChange} onClear={onClear} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por cliente…"
          className="w-full max-w-xs rounded-lg border border-[var(--border-strong)] bg-[var(--input-bg)] px-3 py-1.5 text-sm text-[var(--text-primary)] focus:border-icf-green focus:outline-none"
        />
        <button
          onClick={() => setSomenteAtrasadas((v) => !v)}
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
            somenteAtrasadas
              ? 'border-red-700 bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300'
              : 'border-[var(--border-strong)] text-[var(--text-secondary)] hover:border-red-300 dark:border-red-800 hover:text-red-700 dark:text-red-300'
          }`}
        >
          {somenteAtrasadas ? '✓ ' : ''}Somente atrasadas
        </button>
      </div>

      <section className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard label="Contagem de tarefas" value={number.format(filtradas.length)} />
        <KpiCard
          label="Tarefas atrasadas"
          value={number.format(atrasadas.length)}
          hint={filtradas.length ? `${((atrasadas.length / filtradas.length) * 100).toFixed(0)}% do total filtrado` : undefined}
        />
        <KpiCard label="Proposta aceita — kWp" value={decimal.format(somaKwh)} hint="Projetos das tarefas filtradas" />
        <KpiCard label="Proposta aceita — valor" value={currency.format(somaValor)} />
        <KpiCard label="Proposta aceita — soma anos ROI" value={decimal.format(somaRoi)} />
      </section>

      {atrasadas.length > 0 && (
        <section className="mb-6 grid grid-cols-1 gap-4">
          <DataTable
            title={`⚠ Alertas — ${atrasadas.length} tarefa${atrasadas.length === 1 ? '' : 's'} atrasada${atrasadas.length === 1 ? '' : 's'}`}
            rows={atrasadas}
            maxHeight={320}
            columns={[
              { key: 'id', label: 'Código', render: (r) => r.id },
              { key: 'titulo', label: 'Tarefa', render: (r) => r.titulo ?? '—' },
              { key: 'cliente', label: 'Cliente', render: (r) => r.lead ?? r.projeto ?? '—' },
              { key: 'responsaveis', label: 'Responsáveis', render: (r) => r.responsaveis.join(', ') || '—' },
              { key: 'dataEntrega', label: 'Prazo', render: (r) => new Date(r.dataEntrega!).toLocaleDateString('pt-BR') },
              {
                key: 'diasAtraso',
                label: 'Dias de atraso',
                align: 'right',
                render: (r) => <span className="font-medium text-red-600 dark:text-red-400">{r.diasAtraso}</span>,
              },
            ]}
          />
        </section>
      )}

      <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DataTable
          title="Data do cadastro"
          rows={porData}
          maxHeight={300}
          columns={[
            { key: 'data', label: 'Data', render: ([dia]) => new Date(dia).toLocaleDateString('pt-BR') },
            { key: 'qtd', label: 'Contagem', align: 'right', render: ([, qtd]) => number.format(qtd) },
          ]}
        />
        <DonutChart title="Status geral" data={porStatus} />
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DonutChart title="Dono da tarefa" data={porDono} />
        <DonutChart title="Responsável" data={porResponsavel} />
        <DonutChart title="Prioridade" data={porPrioridade} />
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4">
        <BarChartGeneric title="Tarefas por tipo" data={porTipo} layout="vertical" maxBars={15} />
      </section>

      <section className="grid grid-cols-1 gap-4">
        <DataTable
          title="Visão detalhada"
          rows={filtradas.slice().sort((a, b) => b.dataInclusao.localeCompare(a.dataInclusao))}
          maxHeight={360}
          columns={[
            { key: 'id', label: 'Código', render: (r) => r.id },
            { key: 'status', label: 'Status', render: (r) => r.status ?? '—' },
            { key: 'dataInclusao', label: 'Data cadastro', render: (r) => new Date(r.dataInclusao).toLocaleDateString('pt-BR') },
            { key: 'dataConclusao', label: 'Data conclusão', render: (r) => (r.dataConclusao ? new Date(r.dataConclusao).toLocaleDateString('pt-BR') : '—') },
            { key: 'responsaveis', label: 'Responsáveis', render: (r) => r.responsaveis.join(', ') || '—' },
            { key: 'lead', label: 'Cliente', render: (r) => r.lead ?? r.projeto ?? '—' },
          ]}
        />
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
