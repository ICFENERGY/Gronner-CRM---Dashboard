import { useMemo, useState } from 'react'
import { api } from '../api/client'
import { useRawData } from '../api/useRawData'
import { DataTable } from '../components/DataTable'
import { DetailRow, Modal } from '../components/Modal'
import { DonutChart } from '../components/DonutChart'
import { FilterBar, type FilterDef } from '../components/FilterBar'
import { KpiCard } from '../components/KpiCard'
import type { PietaProjetoDetalhe } from '../api/types'
import { useFilters, uniqueSorted } from '../hooks/useFilters'
import { currency, number } from '../lib/palette'
import { Cartao, Kpi } from '../features/painel/ui/base'
import { BarrasHorizontais } from '../features/painel/ui/graficos'
import type { PietaMetricas } from '../api/types'

const dias = (v: number | null | undefined) => (v == null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} d`)

/** KPIs de prazo, pendência e tempo por etapa, calculados no servidor a partir dos detalhes guardados. */
function MetricasPieta({ metricas, loading }: { metricas: PietaMetricas | null; loading: boolean }) {
  if (loading) return <p className="mb-6 text-sm text-[var(--text-secondary)]">Carregando métricas…</p>
  if (!metricas || metricas.vazio) {
    return (
      <section className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--text-secondary)]">
        <p className="font-medium text-[var(--text-primary)]">Métricas de prazo e tempo por etapa ainda sem dados</p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">{metricas?.aviso ?? 'Não foi possível carregar as métricas.'}</p>
      </section>
    )
  }
  const { prazoVencido, comPendencia, tempoDesdePagamento, medidorSubstituido, alteracoes, tempoPorEtapa = [], cobertura } = metricas
  const barras = tempoPorEtapa.filter((e) => e.mediaDias != null).map((e) => ({ nome: e.etapa, valor: e.mediaDias as number }))
  const linhas = tempoPorEtapa.map((e) => ({ nome: e.etapa, valores: [dias(e.mediaDias), dias(e.medianaDias), e.projetos] }))
  return (
    <>
      <section className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi area="Engenharia" rotulo="Prazo vencido" valor={number.format(prazoVencido?.quantidade ?? 0)} contexto={`de ${number.format(metricas.ativos ?? 0)} projetos ativos`} tom={prazoVencido?.quantidade ? 'atrasado' : 'ok'} />
        <Kpi area="Engenharia" rotulo="Com pendência" valor={number.format(comPendencia?.quantidade ?? 0)} contexto={comPendencia?.pendenciasFrequentes[0] ? `mais comum: ${comPendencia.pendenciasFrequentes[0].pendencia}` : undefined} tom={comPendencia?.quantidade ? 'risco' : 'ok'} />
        <Kpi area="Engenharia" rotulo="Tempo desde o pagamento" valor={dias(tempoDesdePagamento?.finalizados.mediaDias)} contexto={`finalizados · em andamento: ${dias(tempoDesdePagamento?.emAndamento.mediaDias)}`} />
        <Kpi area="Engenharia" rotulo="Medidor substituído" valor={number.format(medidorSubstituido?.quantidade ?? 0)} contexto={`criação até a troca: ${dias(medidorSubstituido?.tempoMedioCriacaoAteTrocaDias)}`} />
        <Kpi area="Financeiro" rotulo="Valor das alterações" valor={currency.format(alteracoes?.valorTotal ?? 0)} contexto={`em ${number.format(alteracoes?.projetosComAlteracao ?? 0)} projetos`} />
      </section>
      {cobertura && cobertura.totalNoResumo != null && cobertura.armazenados < cobertura.totalNoResumo && (
        <p className="mb-4 text-xs text-[var(--text-muted)]">Métricas de {number.format(cobertura.armazenados)} de {number.format(cobertura.totalNoResumo)} projetos; o restante entra nas próximas cargas.</p>
      )}
      <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Cartao titulo="Tempo médio por etapa (dias)" subtitulo="Soma das visitas de cada projeto à etapa; a etapa atual conta até hoje" colunas={['Etapa', 'Média', 'Mediana', 'Projetos']} linhas={linhas}>
          <BarrasHorizontais dados={barras} formatar={(v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} rotuloValor="Média (dias)" />
        </Cartao>
        <Cartao
          titulo="Projetos com prazo vencido"
          subtitulo="Mais atrasados primeiro"
          colunas={['Projeto', 'Status', 'Atraso']}
          linhas={(prazoVencido?.projetos ?? []).map((p) => ({ nome: `#${p.projectId} ${p.clientName ?? ''}`.trim(), valores: [p.status, `${p.diasAtraso} d`] }))}
        >
          <ul className="max-h-[300px] space-y-1 overflow-auto text-sm">
            {(prazoVencido?.projetos ?? []).map((p) => (
              <li key={p.projectId} className="flex justify-between gap-3 border-t border-[var(--border)] py-1 first:border-t-0">
                <span className="truncate text-[var(--text-primary)]">#{p.projectId} {p.clientName}</span>
                <span className="shrink-0 text-[var(--text-secondary)]">{p.status} · {p.diasAtraso} d</span>
              </li>
            ))}
          </ul>
        </Cartao>
      </section>
    </>
  )
}

export function PietaPage() {
  const { data: resumo, loading, error } = useRawData('pieta-resumo', api.getPietaResumo)
  const { data: metricas, loading: carregandoMetricas } = useRawData('pieta-metricas', api.getPietaMetricas)
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
        <p className="text-xs uppercase tracking-wide text-[var(--accent-text)]">Pieta — Plataforma PIEP</p>
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

      <MetricasPieta metricas={metricas} loading={carregandoMetricas} />

      <section className="mb-6 grid grid-cols-1 gap-4">
        <DonutChart title="Projetos por fase" data={porFase} maxSlices={12} />
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4">
        <DataTable
          title="Projetos (clique para ver detalhes)"
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
            { key: 'createdAt', label: 'Criado em', render: (r) => new Date(r.createdAt).toLocaleDateString('pt-BR') },
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
                <DetailRow label="Criado em" value={new Date(detalhe.createdAt).toLocaleDateString('pt-BR')} />
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
