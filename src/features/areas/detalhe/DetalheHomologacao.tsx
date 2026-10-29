import { useMemo, useState } from 'react'
import { api } from '../../../api/client'
import type { PietaProjetoDetalhe, PietaResumo } from '../../../api/types'
import { DataTable } from '../../../components/DataTable'
import { DetailRow, Modal } from '../../../components/Modal'
import { FilterBar, type FilterDef } from '../../../components/FilterBar'
import { useFilters, uniqueSorted } from '../../../hooks/useFilters'
import { currency } from '../../../lib/palette'
import { dataCurtaBr } from '../../../lib/datas'

/** Lista de detalhe da aba Pieta: todos os projetos da PIETA, com a ficha de cada um. */
export function DetalheHomologacao({ resumo }: { resumo: PietaResumo }) {
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

      <section className="mb-6 grid grid-cols-1 gap-4">
        <DataTable
          title={`Projetos na PIETA (${projetosFiltrados.length} de ${resumo.projects.length}) · clique para ver a ficha`}
          rows={projetosFiltrados}
          maxHeight={360}
          onRowClick={(r) => abrirProjeto(r.projectId)}
          columns={[
            {
              key: 'projectId',
              label: 'ID',
              render: (r) => <span className="text-[var(--accent-text)] hover:underline">{r.projectId}</span>,
            },
            { key: 'clientName', label: 'Cliente', render: (r) => r.clientName },
            { key: 'status', label: 'Status', render: (r) => r.status },
            { key: 'power', label: 'Potência (kWp)', align: 'right', render: (r) => (r.power != null ? r.power.toFixed(2) : '—') },
            { key: 'powerDistributor', label: 'Distribuidora', render: (r) => r.powerDistributor },
            { key: 'createdAt', label: 'Criado em', render: (r) => dataCurtaBr(r.createdAt) },
          ]}
        />
      </section>

      {selecionado && (
        <Modal title={`Projeto #${selecionado}`} onClose={() => setSelecionado(null)}>
          {carregandoDetalhe && <p className="text-sm text-[var(--text-secondary)]">Carregando…</p>}
          {erroDetalhe && <p className="text-sm text-red-600 dark:text-red-400">{erroDetalhe}</p>}
          {detalhe && (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <DetailRow label="Cliente" value={detalhe.clientName} />
                <DetailRow label="Status" value={detalhe.status} />
                <DetailRow label="Potência" value={detalhe.power != null ? `${detalhe.power.toFixed(2)} kWp` : '—'} />
                <DetailRow label="Distribuidora" value={`${detalhe.powerDistributor} (${detalhe.powerDistributorState})`} />
                <DetailRow label="Contato principal" value={detalhe.mainContact?.name ?? '—'} />
                <DetailRow label="Criado em" value={dataCurtaBr(detalhe.createdAt)} />
                <DetailRow label="Dias desde a criação" value={detalhe.daysSinceCreated ?? '—'} />
                <DetailRow label="Tempo total (dias)" value={detalhe.tempoTotalDias ?? '—'} />
                <DetailRow label="Valor total" value={detalhe.totalValue != null ? currency.format(detalhe.totalValue) : '—'} />
                {detalhe.pendencies.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-1 text-xs text-[var(--text-muted)]">Pendências</p>
                    <ul className="list-inside list-disc text-sm text-amber-700 dark:text-amber-300">
                      {detalhe.pendencies.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  </div>
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
        </Modal>
      )}
    </div>
  )
}
