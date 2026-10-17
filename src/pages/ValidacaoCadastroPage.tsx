import { useMemo, useState } from 'react'
import { api } from '../api/client'
import { useRawData } from '../api/useRawData'
import type { PropostaRaw } from '../api/types'
import { DonutChart } from '../components/DonutChart'
import { DataTable } from '../components/DataTable'
import { DetailRow, Modal } from '../components/Modal'
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
  const [propostaSelecionada, setPropostaSelecionada] = useState<PropostaRaw | null>(null)

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
        <DonutChart title="Negócios por tipo de negócio" data={porTipo} />
        <DonutChart title="Contato origem" data={porOrigem} />
        <DonutChart title="Negócios por vendedor" data={porVendedor} />
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PivotDiaMes title="Card x mês x dia (data de cadastro)" items={filtradas} />
        <FunilStatusTree
          title="Card x etapa x status"
          items={filtradas.map((p) => ({ funil: p.etapaProjeto, etapa: p.statusProjeto }))}
        />
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MultiYearBarChart title="Cards em aberto por mês" items={naoAprovadas} />
        <DonutChart title="Cards por status" data={porStatus} />
      </section>

      <section className="grid grid-cols-1 gap-4">
        <DataTable
          title="Propostas (clique para ver detalhes)"
          rows={filtradas.slice().sort((a, b) => b.dataInclusao.localeCompare(a.dataInclusao))}
          maxHeight={400}
          onRowClick={setPropostaSelecionada}
          columns={[
            { key: 'lead', label: 'Cliente', render: (r) => r.lead ?? r.projeto ?? '—' },
            { key: 'etapaProjeto', label: 'Etapa', render: (r) => r.etapaProjeto ?? '—' },
            { key: 'statusProjeto', label: 'Status', render: (r) => r.statusProjeto ?? '—' },
            { key: 'vendedorNome', label: 'Vendedor', render: (r) => r.vendedorNome ?? '—' },
            { key: 'preco', label: 'Valor (R$)', align: 'right', render: (r) => (r.preco != null ? currency.format(r.preco) : '—') },
            { key: 'dataInclusao', label: 'Criado em', render: (r) => new Date(r.dataInclusao).toLocaleDateString('pt-BR') },
          ]}
        />
      </section>

      {propostaSelecionada && (
        <Modal title={propostaSelecionada.lead ?? propostaSelecionada.projeto ?? `Proposta #${propostaSelecionada.id}`} onClose={() => setPropostaSelecionada(null)}>
          <DetailRow label="Título" value={propostaSelecionada.titulo} />
          <DetailRow label="Tipo de negócio" value={propostaSelecionada.projetoTipo} />
          <DetailRow label="Etapa" value={propostaSelecionada.etapaProjeto} />
          <DetailRow label="Status" value={propostaSelecionada.statusProjeto} />
          <DetailRow label="Origem" value={propostaSelecionada.origem} />
          <DetailRow label="Vendedor" value={propostaSelecionada.vendedorNome} />
          <DetailRow label="Aceita" value={propostaSelecionada.aceita ? 'Sim' : 'Não'} />
          <DetailRow label="Potência (kWp)" value={propostaSelecionada.kwP != null ? decimal.format(propostaSelecionada.kwP) : '—'} />
          <DetailRow label="Consumo" value={propostaSelecionada.consumo != null ? decimal.format(propostaSelecionada.consumo) : '—'} />
          <DetailRow label="Geração anual" value={propostaSelecionada.geracaoAnual != null ? `${decimal.format(propostaSelecionada.geracaoAnual)} kWh` : '—'} />
          <DetailRow label="Valor" value={propostaSelecionada.preco != null ? currency.format(propostaSelecionada.preco) : '—'} />
          <DetailRow label="Valor original" value={propostaSelecionada.precoOriginal != null ? currency.format(propostaSelecionada.precoOriginal) : '—'} />
          <DetailRow label="Retorno do investimento" value={propostaSelecionada.anoRetornoInvestimento != null ? `${decimal.format(propostaSelecionada.anoRetornoInvestimento)} anos` : '—'} />
          <DetailRow label="Criado em" value={new Date(propostaSelecionada.dataInclusao).toLocaleString('pt-BR')} />
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
