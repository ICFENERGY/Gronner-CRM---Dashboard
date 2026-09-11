import { useMemo, useState } from 'react'
import { api } from '../api/client'
import { useRawData } from '../api/useRawData'
import { DataTable } from '../components/DataTable'
import { DonutChart } from '../components/DonutChart'
import { FilterBar, type FilterDef } from '../components/FilterBar'
import { KpiCard } from '../components/KpiCard'
import type { PietaProjetoDetalhe } from '../api/types'
import { useFilters, uniqueSorted } from '../hooks/useFilters'
import { currency, number } from '../lib/palette'

export function PietaPage() {
  const { data: resumo, loading, error } = useRawData('pieta-resumo', api.getPietaResumo)
  const { values, onChange, onClear } = useFilters()
  const [busca, setBusca] = useState('')
  const [selecionado, setSelecionado] = useState<number | null>(null)
  const [detalhe, setDetalhe] = useState<PietaProjetoDetalhe | null>(null)
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false)
  const [erroDetalhe, setErroDetalhe] = useState<string | null>(null)

  function abrirProjeto(projectId: number) {
    setSelecionado(projectId)
    setDetalhe(null)
    setErroDetalhe(null)
    setCarregandoDetalhe(true)
    api
      .getPietaProjeto(projectId)
      .then(setDetalhe)
      .catch((e) => setErroDetalhe(e.message))
      .finally(() => setCarregandoDetalhe(false))
  }

  const filtros: FilterDef[] = useMemo(() => {
    if (!resumo) return []
    return [
      { key: 'status', label: 'Status', options: uniqueSorted(resumo.projects.map((p) => p.status)) },
      { key: 'powerDistributor', label: 'Distribuidora', options: uniqueSorted(resumo.projects.map((p) => p.powerDistributor)) },
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumo])

  const projetosFiltrados = useMemo(() => {
    if (!resumo) return []
    return resumo.projects.filter((p) => {
      if (values.status && p.status !== values.status) return false
      if (values.powerDistributor && p.powerDistributor !== values.powerDistributor) return false
      if (busca && !p.clientName.toLowerCase().includes(busca.toLowerCase())) return false
      return true
    })
  }, [resumo, values, busca])

  if (loading) return <p className="p-10 text-center text-[var(--text-secondary)]">Carregando projetos da Pieta…</p>

  if (error) {
    const credenciaisPendentes = error.includes('PIETA_USER')
    return (
      <div className="mx-auto max-w-xl rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-6 text-amber-800 dark:text-amber-200">
        <p className="font-medium">{credenciaisPendentes ? 'Integração Pieta ainda não ativada' : 'Não foi possível carregar os dados da Pieta.'}</p>
        <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
          {credenciaisPendentes
            ? 'Faltam as credenciais PIETA_USER e PIETA_PASSWORD. Assim que a Pieta gerar o usuário/senha da API, adicione no .env (local) e nas variáveis de ambiente da Vercel (produção) para esta página passar a mostrar os projetos reais.'
            : error}
        </p>
      </div>
    )
  }

  if (!resumo) return null

  const porFaseMap = new Map<string, number>()
  for (const p of projetosFiltrados) porFaseMap.set(p.status, (porFaseMap.get(p.status) ?? 0) + 1)
  const porFase = [...porFaseMap.entries()].map(([name, value]) => ({ name, value }))

  return (
    <div>
      <div className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <p className="text-xs uppercase tracking-wide text-icf-green dark:text-icf-greenLight">Pieta — Plataforma PIEP</p>
        <h2 className="text-lg font-medium text-[var(--text-primary)]">{resumo.companyName}</h2>
        <p className="text-xs text-[var(--text-muted)]">
          {resumo.socialName} · {resumo.document}
        </p>
      </div>

      <FilterBar filters={filtros} values={values} onChange={onChange} onClear={onClear} />

      <div className="mb-4 max-w-xs">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por cliente…"
          className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--input-bg)] px-3 py-1.5 text-sm text-[var(--text-primary)] focus:border-icf-green focus:outline-none"
        />
      </div>

      <section className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <KpiCard label="Projetos (filtrado)" value={number.format(projetosFiltrados.length)} hint={`Total geral: ${number.format(resumo.projectsQuantity)}`} />
        <KpiCard label="Último projeto" value={new Date(resumo.lastProject).toLocaleDateString('pt-BR')} />
        <KpiCard label="Fases distintas" value={number.format(porFase.length)} />
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4">
        <DonutChart title="Projetos por fase" data={porFase} maxSlices={12} />
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4">
        <DataTable
          title="Projetos (clique para ver detalhes)"
          rows={projetosFiltrados}
          maxHeight={360}
          columns={[
            {
              key: 'projectId',
              label: 'ID',
              render: (r) => (
                <button onClick={() => abrirProjeto(r.projectId)} className="text-icf-green dark:text-icf-greenLight hover:underline">
                  {r.projectId}
                </button>
              ),
            },
            { key: 'clientName', label: 'Cliente', render: (r) => r.clientName },
            { key: 'status', label: 'Status', render: (r) => r.status },
            { key: 'power', label: 'Potência (kWp)', align: 'right', render: (r) => (r.power != null ? r.power.toFixed(2) : '—') },
            { key: 'powerDistributor', label: 'Distribuidora', render: (r) => r.powerDistributor },
            { key: 'createdAt', label: 'Criado em', render: (r) => new Date(r.createdAt).toLocaleDateString('pt-BR') },
          ]}
        />
      </section>

      {selecionado && (
        <section className="grid grid-cols-1 gap-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium text-[var(--text-secondary)]">Projeto #{selecionado}</h3>
              <button onClick={() => setSelecionado(null)} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
                Fechar ✕
              </button>
            </div>
            {carregandoDetalhe && <p className="text-sm text-[var(--text-secondary)]">Carregando…</p>}
            {erroDetalhe && <p className="text-sm text-red-600 dark:text-red-400">{erroDetalhe}</p>}
            {detalhe && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <p className="text-xs text-[var(--text-muted)]">Cliente</p>
                  <p className="mb-2 text-sm text-[var(--text-primary)]">{detalhe.clientName}</p>
                  <p className="text-xs text-[var(--text-muted)]">Contato principal</p>
                  <p className="mb-2 text-sm text-[var(--text-primary)]">
                    {detalhe.mainContact ? `${detalhe.mainContact.name} · ${detalhe.mainContact.phone}` : '—'}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">Dias desde a criação</p>
                  <p className="mb-2 text-sm text-[var(--text-primary)]">{detalhe.daysSinceCreated ?? '—'}</p>
                  <p className="text-xs text-[var(--text-muted)]">Valor total</p>
                  <p className="mb-2 text-sm text-[var(--text-primary)]">{detalhe.totalValue != null ? currency.format(detalhe.totalValue) : '—'}</p>
                  {detalhe.pendencies.length > 0 && (
                    <>
                      <p className="text-xs text-[var(--text-muted)]">Pendências</p>
                      <ul className="list-inside list-disc text-sm text-amber-700 dark:text-amber-300">
                        {detalhe.pendencies.map((p, i) => (
                          <li key={i}>{p}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
                <div>
                  <p className="mb-1 text-xs text-[var(--text-muted)]">Linha do tempo</p>
                  {detalhe.statusTimeline && detalhe.statusTimeline.length > 0 ? (
                    <ul className="space-y-1">
                      {detalhe.statusTimeline.map((s, i) => (
                        <li key={i} className="flex justify-between text-xs">
                          <span className="text-[var(--text-secondary)]">{s.etapa}</span>
                          <span className="text-[var(--text-secondary)]">{s.tempoNaEtapaDias}d</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-[var(--text-muted)]">Sem histórico disponível.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
