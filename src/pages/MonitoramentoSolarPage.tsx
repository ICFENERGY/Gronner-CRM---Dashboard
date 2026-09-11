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
import { currency, decimal, number } from '../lib/palette'

const STATUS_DESEMPENHO_COR: Record<string, string> = {
  Crítico: '#EF4444',
  Atenção: '#F59E0B',
  'Dentro do esperado': '#22C55E',
  'Sem dado': '#94a3b8',
}

const STATUS_MONITORAMENTO_LABEL: Record<string, string> = { OK: 'Operando normalmente', ALERTA: 'Alerta', CRITICO: 'Crítico' }

function pct(v: number | null) {
  return v != null ? `${(v * 100).toFixed(0)}%` : '—'
}

export function MonitoramentoSolarPage() {
  const { data: usinas, loading, error } = useRawData('usinas', api.getUsinasRaw)
  const { values, onChange, onClear } = useFilters()
  const [busca, setBusca] = useState('')
  const [usinaSelecionada, setUsinaSelecionada] = useState<UsinaRaw | null>(null)
  const [cidadeSelecionada, setCidadeSelecionada] = useState<{ titulo: string; usinas: UsinaRaw[] } | null>(null)

  const filtros: FilterDef[] = useMemo(() => {
    if (!usinas) return []
    return [
      { key: 'statusDesempenho', label: 'Status (desempenho)', options: uniqueSorted(usinas.map((u) => u.statusDesempenho)) },
      { key: 'estado', label: 'Estado', options: uniqueSorted(usinas.map((u) => u.estado)) },
      { key: 'concessionaria', label: 'Concessionária', options: uniqueSorted(usinas.map((u) => u.concessionaria)) },
      { key: 'plano', label: 'Plano', options: uniqueSorted(usinas.map((u) => u.plano)) },
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usinas])

  const filtradas = useMemo(() => {
    if (!usinas) return []
    return usinas.filter((u) => {
      if (values.statusDesempenho && u.statusDesempenho !== values.statusDesempenho) return false
      if (values.estado && u.estado !== values.estado) return false
      if (values.concessionaria && u.concessionaria !== values.concessionaria) return false
      if (values.plano && u.plano !== values.plano) return false
      if (busca && !(u.nome ?? '').toLowerCase().includes(busca.toLowerCase())) return false
      return true
    })
  }, [usinas, values, busca])

  if (loading) return <p className="p-10 text-center text-[var(--text-secondary)]">Carregando usinas…</p>
  if (error) return <p className="p-10 text-center text-red-600 dark:text-red-400">{error}</p>

  const potenciaTotal = filtradas.reduce((s, u) => s + (u.potenciaKwp ?? 0), 0)
  const investidoTotal = filtradas.reduce((s, u) => s + (u.totalInvestido ?? 0), 0)
  const geracaoMesTotal = filtradas.reduce((s, u) => s + (u.geracaoKwhMes ?? 0), 0)
  const comDesempenho = filtradas.filter((u) => u.desempenhoMedio3mPct != null)
  const desempenhoMedio = comDesempenho.length
    ? comDesempenho.reduce((s, u) => s + (u.desempenhoMedio3mPct ?? 0), 0) / comDesempenho.length
    : null

  const porStatusDesempenho = agrupar(filtradas, (u) => u.statusDesempenho ?? 'Sem dado')
  const porEstado = agrupar(filtradas, (u) => u.estado ?? 'Não informado')
  const porConcessionaria = agrupar(filtradas, (u) => u.concessionaria ?? 'Não informado')
  const porPlano = agrupar(filtradas, (u) => u.plano ?? 'Não informado')

  const geracaoPorMes = new Map<string, number>()
  for (const u of filtradas) {
    for (const m of u.mensal2026 ?? []) {
      if (m.geracaoKwh == null) continue
      geracaoPorMes.set(m.mes, (geracaoPorMes.get(m.mes) ?? 0) + m.geracaoKwh)
    }
  }
  const ORDEM_MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  const geracaoPorMesData = ORDEM_MESES.filter((m) => geracaoPorMes.has(m)).map((m) => ({ name: m, value: geracaoPorMes.get(m)! }))

  const potenciaPorCidade = new Map<string, { cidade: string; estado: string; quantidade: number; potencia: number; usinas: UsinaRaw[] }>()
  for (const u of filtradas) {
    const cidade = u.cidade || 'Não informado'
    const chave = `${cidade}/${u.estado ?? ''}`
    const cur = potenciaPorCidade.get(chave) ?? { cidade, estado: u.estado ?? '—', quantidade: 0, potencia: 0, usinas: [] }
    cur.quantidade += 1
    cur.potencia += u.potenciaKwp ?? 0
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

      <section className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard label="Usinas" value={number.format(filtradas.length)} />
        <KpiCard label="Potência instalada" value={`${decimal.format(potenciaTotal)} kWp`} />
        <KpiCard label="Total investido" value={currency.format(investidoTotal)} hint="Coluna manual do relatório" />
        <KpiCard label="Geração do mês" value={`${decimal.format(geracaoMesTotal)} kWh`} />
        <KpiCard label="Desempenho médio (3M)" value={pct(desempenhoMedio)} />
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarChartGeneric
          title="Geração mensal 2026 (kWh)"
          data={geracaoPorMesData}
          layout="vertical"
          formatValue={(v) => decimal.format(v)}
          ordenarPorValor={false}
        />
        <DonutChart title="Status de desempenho (méd. 3 meses)" data={porStatusDesempenho} />
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <BarChartGeneric title="Usinas por estado" data={porEstado} layout="vertical" />
        <BarChartGeneric title="Usinas por concessionária" data={porConcessionaria} layout="vertical" maxBars={12} />
        <DonutChart title="Usinas por plano" data={porPlano} />
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4">
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
          rows={filtradas.slice().sort((a, b) => (b.potenciaKwp ?? 0) - (a.potenciaKwp ?? 0))}
          maxHeight={420}
          onRowClick={setUsinaSelecionada}
          columns={[
            { key: 'nome', label: 'Usina', render: (r) => r.nome },
            { key: 'cidade', label: 'Cidade/UF', render: (r) => (r.cidade ? `${r.cidade}/${r.estado}` : '—') },
            { key: 'potencia', label: 'Potência (kWp)', align: 'right', render: (r) => decimal.format(r.potenciaKwp ?? 0) },
            { key: 'geracaoMes', label: 'Geração do mês (kWh)', align: 'right', render: (r) => (r.geracaoKwhMes != null ? decimal.format(r.geracaoKwhMes) : '—') },
            {
              key: 'statusDesempenho',
              label: 'Status (desempenho)',
              render: (r) => <span style={{ color: STATUS_DESEMPENHO_COR[r.statusDesempenho ?? ''] ?? undefined }}>{r.statusDesempenho ?? '—'}</span>,
            },
          ]}
        />
      </section>

      {usinaSelecionada && (
        <Modal title={usinaSelecionada.nome} onClose={() => setUsinaSelecionada(null)}>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <DetailRow label="Cliente" value={usinaSelecionada.cliente} />
              <DetailRow label="Classe" value={usinaSelecionada.classe} />
              <DetailRow label="Plano" value={usinaSelecionada.plano} />
              <DetailRow label="Potência" value={`${decimal.format(usinaSelecionada.potenciaKwp ?? 0)} kWp`} />
              <DetailRow label="Total investido" value={usinaSelecionada.totalInvestido != null ? currency.format(usinaSelecionada.totalInvestido) : '—'} />
              <DetailRow label="Concessionária" value={usinaSelecionada.concessionaria} />
              <DetailRow label="Cidade/UF" value={usinaSelecionada.cidade ? `${usinaSelecionada.cidade}/${usinaSelecionada.estado}` : '—'} />
              <DetailRow label="Data de instalação" value={usinaSelecionada.dataInstalacao ? new Date(usinaSelecionada.dataInstalacao).toLocaleDateString('pt-BR') : '—'} />
              <DetailRow
                label="Status de monitoramento (tempo real)"
                value={usinaSelecionada.statusMonitoramento ? STATUS_MONITORAMENTO_LABEL[usinaSelecionada.statusMonitoramento] ?? usinaSelecionada.statusMonitoramento : 'Sem monitoramento premium'}
              />
              <DetailRow
                label="Status de desempenho (méd. 3M)"
                value={<span style={{ color: STATUS_DESEMPENHO_COR[usinaSelecionada.statusDesempenho ?? ''] ?? undefined }}>{usinaSelecionada.statusDesempenho}</span>}
              />
              <DetailRow label="Desempenho do mês" value={pct(usinaSelecionada.desempenhoMesPct)} />
              <DetailRow label="Desempenho 12M" value={pct(usinaSelecionada.desempenho12mPct)} />
              {usinaSelecionada.observacao && (
                <div className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-200">{usinaSelecionada.observacao}</div>
              )}
            </div>
            <div>
              <p className="mb-1 text-xs text-[var(--text-muted)]">Geração mensal 2026 (kWh)</p>
              <ul className="space-y-1">
                {(usinaSelecionada.mensal2026 ?? []).map((m) => (
                  <li key={m.mes} className="flex justify-between text-xs">
                    <span className="text-[var(--text-secondary)]">{m.mes}/26</span>
                    <span className="text-[var(--text-secondary)]">
                      {m.geracaoKwh != null ? `${decimal.format(m.geracaoKwh)} kWh` : '—'}
                      {m.desempenhoPct != null && <span className="ml-2 text-[var(--text-muted)]">({pct(m.desempenhoPct)})</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
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
              { key: 'potencia', label: 'Potência (kWp)', align: 'right', render: (r) => decimal.format(r.potenciaKwp ?? 0) },
              {
                key: 'status',
                label: 'Status',
                render: (r) => <span style={{ color: STATUS_DESEMPENHO_COR[r.statusDesempenho ?? ''] ?? undefined }}>{r.statusDesempenho ?? '—'}</span>,
              },
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
