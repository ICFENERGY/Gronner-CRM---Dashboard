import { useMemo, useState } from 'react'
import { api } from '../api/client'
import { useRawData } from '../api/useRawData'
import type { UsinaRaw } from '../api/types'
import { BarChartGeneric } from '../components/BarChartGeneric'
import { DataTable } from '../components/DataTable'
import { DetailRow, Modal } from '../components/Modal'
import { DonutChart } from '../components/DonutChart'
import { FilterBar, type FilterDef } from '../components/FilterBar'
import { KpiCard } from '../components/KpiCard'
import { useFilters, uniqueSorted } from '../hooks/useFilters'
import { decimal, number } from '../lib/palette'

const STATUS_LABEL: Record<string, string> = { OK: 'Operando normalmente', ALERTA: 'Alerta', CRITICO: 'Crítico' }

export function MonitoramentoSolarPage() {
  const { data: usinas, loading, error } = useRawData('usinas', api.getUsinasRaw)
  const { values, onChange, onClear } = useFilters()
  const [busca, setBusca] = useState('')
  const [usinaSelecionada, setUsinaSelecionada] = useState<UsinaRaw | null>(null)
  const [cidadeSelecionada, setCidadeSelecionada] = useState<{ titulo: string; usinas: UsinaRaw[] } | null>(null)

  const filtros: FilterDef[] = useMemo(() => {
    if (!usinas) return []
    return [
      { key: 'status', label: 'Status', options: uniqueSorted(usinas.map((u) => u.status)) },
      { key: 'estado', label: 'Estado', options: uniqueSorted(usinas.map((u) => u.estado)) },
      { key: 'concessionaria', label: 'Concessionária', options: uniqueSorted(usinas.map((u) => u.concessionaria)) },
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usinas])

  const filtradas = useMemo(() => {
    if (!usinas) return []
    return usinas.filter((u) => {
      if (values.status && u.status !== values.status) return false
      if (values.estado && u.estado !== values.estado) return false
      if (values.concessionaria && u.concessionaria !== values.concessionaria) return false
      if (busca && !(u.nome ?? '').toLowerCase().includes(busca.toLowerCase())) return false
      return true
    })
  }, [usinas, values, busca])

  if (loading) return <p className="p-10 text-center text-[var(--text-secondary)]">Carregando usinas…</p>
  if (error) return <p className="p-10 text-center text-red-600 dark:text-red-400">{error}</p>

  const potenciaTotal = filtradas.reduce((s, u) => s + (u.potenciaInstalada ?? 0), 0)
  const energiaTotal = filtradas.reduce((s, u) => s + (u.energiaGeradaKwh ?? 0), 0)
  const comAlerta = filtradas.filter((u) => u.status === 'ALERTA' || u.status === 'CRITICO').length

  const porStatus = agrupar(filtradas, (u) => STATUS_LABEL[u.status ?? ''] ?? u.status ?? 'Sem status')
  const porEstado = agrupar(filtradas, (u) => u.estado ?? 'Não informado')
  const porConcessionaria = agrupar(filtradas, (u) => u.concessionaria ?? 'Não informado')

  const potenciaPorCidade = new Map<string, { cidade: string; estado: string; quantidade: number; potencia: number; usinas: UsinaRaw[] }>()
  for (const u of filtradas) {
    const cidade = u.cidade || 'Não informado'
    const chave = `${cidade}/${u.estado ?? ''}`
    const cur = potenciaPorCidade.get(chave) ?? { cidade, estado: u.estado ?? '—', quantidade: 0, potencia: 0, usinas: [] }
    cur.quantidade += 1
    cur.potencia += u.potenciaInstalada ?? 0
    cur.usinas.push(u)
    potenciaPorCidade.set(chave, cur)
  }
  const topCidades = [...potenciaPorCidade.values()].sort((a, b) => b.potencia - a.potencia)

  return (
    <div>
      <FilterBar filters={filtros} values={values} onChange={onChange} onClear={onClear} />

      <div className="mb-4 max-w-xs">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome da usina…"
          className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--input-bg)] px-3 py-1.5 text-sm text-[var(--text-primary)] focus:border-icf-green focus:outline-none"
        />
      </div>

      <section className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Usinas monitoradas" value={number.format(filtradas.length)} />
        <KpiCard label="Potência instalada" value={`${decimal.format(potenciaTotal)} kWp`} />
        <KpiCard label="Energia gerada" value={`${decimal.format(energiaTotal)} kWh`} hint="Acumulado histórico" />
        <KpiCard
          label="Usinas com alerta"
          value={number.format(comAlerta)}
          hint={filtradas.length ? `${((comAlerta / filtradas.length) * 100).toFixed(0)}% do total` : undefined}
        />
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarChartGeneric title="Usinas por estado" data={porEstado} layout="vertical" />
        <DonutChart title="Status das usinas" data={porStatus} />
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarChartGeneric title="Usinas por concessionária" data={porConcessionaria} layout="vertical" maxBars={12} />
        <DataTable
          title="Top cidades (por potência instalada)"
          rows={topCidades}
          maxHeight={280}
          onRowClick={(r) => setCidadeSelecionada({ titulo: `${r.cidade} / ${r.estado}`, usinas: r.usinas })}
          columns={[
            { key: 'cidade', label: 'Cidade', render: (r) => `${r.cidade} / ${r.estado}` },
            { key: 'quantidade', label: 'Usinas', align: 'right', render: (r) => number.format(r.quantidade) },
            { key: 'potencia', label: 'Potência (kWp)', align: 'right', render: (r) => decimal.format(r.potencia) },
          ]}
        />
      </section>

      <section className="grid grid-cols-1 gap-4">
        <DataTable
          title="Usinas monitoradas"
          rows={filtradas.slice().sort((a, b) => (b.potenciaInstalada ?? 0) - (a.potenciaInstalada ?? 0))}
          maxHeight={400}
          onRowClick={setUsinaSelecionada}
          columns={[
            { key: 'nome', label: 'Usina', render: (r) => r.nome },
            { key: 'cidade', label: 'Cidade/UF', render: (r) => (r.cidade ? `${r.cidade}/${r.estado}` : '—') },
            { key: 'potencia', label: 'Potência (kWp)', align: 'right', render: (r) => decimal.format(r.potenciaInstalada ?? 0) },
            { key: 'energia', label: 'Energia gerada (kWh)', align: 'right', render: (r) => decimal.format(r.energiaGeradaKwh ?? 0) },
            {
              key: 'status',
              label: 'Status',
              render: (r) => (
                <span
                  className={
                    r.status === 'OK'
                      ? 'text-icf-green dark:text-icf-greenLight'
                      : r.status === 'ALERTA'
                        ? 'text-amber-600 dark:text-amber-400'
                        : r.status === 'CRITICO'
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-[var(--text-secondary)]'
                  }
                >
                  {STATUS_LABEL[r.status ?? ''] ?? r.status ?? '—'}
                </span>
              ),
            },
          ]}
        />
      </section>

      {usinaSelecionada && (
        <Modal title={usinaSelecionada.nome} onClose={() => setUsinaSelecionada(null)}>
          <DetailRow label="Status" value={STATUS_LABEL[usinaSelecionada.status ?? ''] ?? usinaSelecionada.status} />
          <DetailRow label="Potência instalada" value={`${decimal.format(usinaSelecionada.potenciaInstalada ?? 0)} kWp`} />
          <DetailRow label="Energia gerada (acumulado)" value={`${decimal.format(usinaSelecionada.energiaGeradaKwh ?? 0)} kWh`} />
          <DetailRow label="Cliente" value={usinaSelecionada.clienteNome} />
          <DetailRow label="Concessionária" value={usinaSelecionada.concessionaria} />
          <DetailRow label="Cidade/UF" value={usinaSelecionada.cidade ? `${usinaSelecionada.cidade}/${usinaSelecionada.estado}` : '—'} />
          <DetailRow label="CEP" value={usinaSelecionada.cep} />
          <DetailRow label="Data de instalação" value={usinaSelecionada.dataInstalacao ? new Date(usinaSelecionada.dataInstalacao).toLocaleDateString('pt-BR') : '—'} />
          <DetailRow label="Última atualização de status" value={usinaSelecionada.statusEm ? new Date(usinaSelecionada.statusEm).toLocaleString('pt-BR') : '—'} />
        </Modal>
      )}

      {cidadeSelecionada && (
        <Modal title={cidadeSelecionada.titulo} onClose={() => setCidadeSelecionada(null)}>
          <DataTable
            title={`${cidadeSelecionada.usinas.length} usina(s)`}
            rows={cidadeSelecionada.usinas}
            maxHeight={400}
            onRowClick={(u) => {
              setCidadeSelecionada(null)
              setUsinaSelecionada(u)
            }}
            columns={[
              { key: 'nome', label: 'Usina', render: (r) => r.nome },
              { key: 'potencia', label: 'Potência (kWp)', align: 'right', render: (r) => decimal.format(r.potenciaInstalada ?? 0) },
              { key: 'status', label: 'Status', render: (r) => STATUS_LABEL[r.status ?? ''] ?? r.status ?? '—' },
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
