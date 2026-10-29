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
import { GeracaoPrognostico } from '../features/painel/ui/graficos'
import { serieGeracaoUsinas } from '../features/painel/calculos'
import { useFilters, uniqueSorted } from '../hooks/useFilters'
import { currency, decimal, number } from '../lib/palette'

const STATUS_DESEMPENHO_COR: Record<string, string> = {
  Crítico: '#EF4444',
  Atenção: '#F59E0B',
  'Dentro do esperado': '#22C55E',
  'Sem dado': '#94a3b8',
}

const STATUS_MONITORAMENTO_LABEL: Record<string, string> = { OK: 'Operando normalmente', ALERTA: 'Alerta', CRITICO: 'Crítico' }

function pct(v: number | null | undefined) {
  return v != null ? `${(v * 100).toFixed(0)}%` : '—'
}

/** Faixas do status de desempenho (mesmas do servidor): até 50% crítico, até 70% atenção, 71% ou mais dentro do esperado. */
function corDesempenho(v: number | null | undefined) {
  if (v == null) return undefined
  const p = Math.round(v * 100)
  return p <= 50 ? STATUS_DESEMPENHO_COR.Crítico : p <= 70 ? STATUS_DESEMPENHO_COR.Atenção : STATUS_DESEMPENHO_COR['Dentro do esperado']
}

/** Farol de monitoramento (conectividade) a partir de status.status da Open API: OK, ALERTA, CRITICO, DESCONHECIDO. */
function rotuloFarol(s: string | null | undefined) {
  const v = (s ?? '').toUpperCase()
  return v === 'OK' ? 'Normal' : v === 'ALERTA' ? 'Com alerta' : v === 'CRITICO' ? 'Crítico' : 'Desconhecido'
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const serieMensal = (u: UsinaRaw) => u.mensal ?? u.mensal2026 ?? []
const dataBr = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—')

export function MonitoramentoSolarPage() {
  const { data: usinasResponse, loading, error } = useRawData('usinas', api.getUsinasRaw)
  const usinas = usinasResponse?.usinas ?? null
  const avisoIntegracaoSolarZ = usinasResponse?.avisoIntegracaoSolarZ ?? null
  const origem = usinasResponse?.origemDados ?? null
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

  const aviso = avisoIntegracaoSolarZ && (
    <div className="mb-6 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm text-amber-800 dark:text-amber-200">
      ⚠️ {avisoIntegracaoSolarZ}
    </div>
  )

  const avisoOrigem = origem && (
    <div className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--text-secondary)]">
      {origem.usinasSolarz > 0
        ? `Dados ao vivo da SolarZ (Open API) para ${origem.usinasSolarz} usinas, atualizados em ${dataBr(origem.solarzAtualizadoEm)}. `
        : 'Sem dados ao vivo da SolarZ no banco; exibindo o relatório importado. '}
      {origem.usinasRelatorio > 0 && `As outras ${origem.usinasRelatorio} usinas (sem monitoramento premium) mantêm o último levantamento${origem.relatorioExtraidoEm ? ` de ${new Date(origem.relatorioExtraidoEm).toLocaleDateString('pt-BR')}` : ''}. `}
      O mês de referência é o último mês fechado; o mês corrente aparece como parcial.
    </div>
  )

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

  const serieGeracao = serieGeracaoUsinas(filtradas)
  const anoSerie = Math.max(0, ...filtradas.map((u) => (serieMensal(u).length ? u.anoMensal ?? 2026 : 0))) || 2026

  const ticketsDisponiveis = filtradas.some((u) => u.ticketsAbertos != null)
  const ticketsTotal = filtradas.reduce((s, u) => s + (u.ticketsAbertos ?? 0), 0)
  const ticketsPorTipo = new Map<string, number>()
  for (const u of filtradas) for (const [tipo, n] of Object.entries(u.ticketsAbertosPorTipo ?? {})) ticketsPorTipo.set(tipo, (ticketsPorTipo.get(tipo) ?? 0) + n)
  const ticketsPorTipoData = [...ticketsPorTipo.entries()].map(([name, value]) => ({ name, value }))
  const comUc = filtradas.filter((u) => (u.unidadesConsumidoras?.length ?? 0) > 0).length

  const monitoradas = filtradas.filter((u) => u.statusMonitoramento != null)
  const farol = agrupar(monitoradas, (u) => rotuloFarol(u.statusMonitoramento))
  const emAlerta = monitoradas.filter((u) => ['Com alerta', 'Crítico'].includes(rotuloFarol(u.statusMonitoramento)))
  const farolHistorico = origem?.farolHistorico ?? []

  const porAnoInstalacao = new Map<string, number>()
  const porMesInstalacao = new Map<string, number>()
  for (const u of filtradas) {
    const d = u.dataInstalacao
    if (!d || !/^\d{4}-\d{2}/.test(d)) {
      porAnoInstalacao.set('Sem data', (porAnoInstalacao.get('Sem data') ?? 0) + 1)
      continue
    }
    porAnoInstalacao.set(d.slice(0, 4), (porAnoInstalacao.get(d.slice(0, 4)) ?? 0) + 1)
    const mesAno = `${d.slice(5, 7)}/${d.slice(0, 4)}`
    porMesInstalacao.set(mesAno, (porMesInstalacao.get(mesAno) ?? 0) + 1)
  }
  const semDataInstalacao = porAnoInstalacao.get('Sem data') ?? 0
  const instalacaoAnoData = [...porAnoInstalacao.entries()].sort(([a], [b]) => (a === 'Sem data' ? 1 : b === 'Sem data' ? -1 : a.localeCompare(b))).map(([name, value]) => ({ name: name === 'Sem data' ? 'Sem data de instalação informada' : name, value }))
  const instalacaoMesData = [...porMesInstalacao.entries()].sort(([a], [b]) => a.slice(3).localeCompare(b.slice(3)) || a.localeCompare(b)).map(([name, value]) => ({ name, value }))

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
      {aviso}
      {avisoOrigem}
      <FilterBar filters={filtros} values={values} onChange={onChange} onClear={onClear} />

      <div className="mb-4 max-w-xs">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome da usina…"
          className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--input-bg)] px-3 py-1.5 text-sm text-[var(--text-primary)] focus:border-icf-green focus:outline-none"
        />
      </div>

      <section className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-7">
        <KpiCard label="Usinas" value={number.format(filtradas.length)} />
        <KpiCard label="Potência instalada" value={`${decimal.format(potenciaTotal)} kWp`} />
        <KpiCard label="Total investido" value={currency.format(investidoTotal)} hint="Coluna manual do relatório" />
        <KpiCard label="Geração do mês" value={`${decimal.format(geracaoMesTotal)} kWh`} />
        <KpiCard label="Desempenho médio (3M)" value={pct(desempenhoMedio)} />
        <KpiCard label="Tickets abertos" value={ticketsDisponiveis ? number.format(ticketsTotal) : '—'} hint={ticketsPorTipoData.length ? ticketsPorTipoData.map((t) => `${t.name}: ${t.value}`).join(' · ') : ticketsDisponiveis ? 'Nenhum ticket aberto' : 'Carga da SolarZ pendente'} />
        <KpiCard label="Usinas com UC" value={number.format(comUc)} hint="Unidade consumidora (Open API)" />
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h3 className="mb-2 text-sm font-medium text-[var(--text-secondary)]">{`Geração real × prognóstico ${anoSerie} (kWh)`}</h3>
          {serieGeracao.length === 0 ? (
            <p className="py-10 text-center text-xs text-[var(--text-muted)]">Sem dados para os filtros selecionados.</p>
          ) : (
            <GeracaoPrognostico dados={serieGeracao} formatar={(v) => decimal.format(v)} />
          )}
        </div>
        <DonutChart title="Status de desempenho (méd. 3 meses)" data={porStatusDesempenho} semaforo={{ "Dentro do esperado": "ok", Atenção: "risco", Crítico: "atrasado" }} />
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DonutChart title="Farol de monitoramento (conectividade)" data={farol} semaforo={{ Normal: 'ok', 'Com alerta': 'risco', Crítico: 'atrasado' }} />
        <DonutChart title="Tickets abertos por tipo" data={ticketsPorTipoData} />
        <BarChartGeneric title="Usinas por ano de instalação" data={instalacaoAnoData} ordenarPorValor={false} />
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarChartGeneric title={`Usinas por mês/ano de instalação (sem data: ${semDataInstalacao})`} data={instalacaoMesData} layout="vertical" maxBars={36} ordenarPorValor={false} />
        <div className="grid gap-4">
          <DataTable
            title={`Usinas com alerta ou críticas (${emAlerta.length}) — farol de monitoramento`}
            rows={emAlerta}
            maxHeight={260}
            onRowClick={setUsinaSelecionada}
            columns={[
              { key: 'nome', label: 'Usina', render: (r) => r.nome },
              { key: 'cliente', label: 'Cliente', render: (r) => r.cliente ?? '—' },
              { key: 'cidade', label: 'Cidade/UF', render: (r) => (r.cidade ? `${r.cidade}/${r.estado}` : '—') },
              { key: 'potencia', label: 'kWp', align: 'right', render: (r) => decimal.format(r.potenciaKwp ?? 0) },
              { key: 'ref', label: 'Mês ref.', render: (r) => r.mesAnoRecente ?? '—' },
              { key: 'des', label: 'Desemp. mês', align: 'right', render: (r) => <span style={{ color: corDesempenho(r.desempenhoMesPct) }}>{pct(r.desempenhoMesPct)}</span> },
              { key: 'st', label: 'Status', render: (r) => <span style={{ color: STATUS_DESEMPENHO_COR[r.statusDesempenho ?? ''] }}>{r.statusDesempenho ?? '—'}</span> },
            ]}
          />
          <DataTable
            title="Histórico diário do farol (contagens)"
            rows={farolHistorico.slice().reverse()}
            maxHeight={200}
            columns={[
              { key: 'data', label: 'Data', render: (r) => new Date(`${r.data}T12:00:00`).toLocaleDateString('pt-BR') },
              { key: 'n', label: 'Normal', align: 'right', render: (r) => number.format(r.contagens.Normal ?? 0) },
              { key: 'a', label: 'Com alerta', align: 'right', render: (r) => number.format(r.contagens['Com alerta'] ?? 0) },
              { key: 'c', label: 'Crítico', align: 'right', render: (r) => number.format(r.contagens['Crítico'] ?? 0) },
              { key: 'd', label: 'Desconhecido', align: 'right', render: (r) => number.format(r.contagens.Desconhecido ?? 0) },
            ]}
          />
        </div>
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DonutChart title="Usinas por estado" data={porEstado} />
        <DonutChart title="Usinas por concessionária" data={porConcessionaria} />
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
            { key: 'uc', label: 'UC', render: (r) => (r.unidadesConsumidoras?.length ? r.unidadesConsumidoras.join(', ') : '—') },
            { key: 'geracaoMes', label: 'Geração do mês (kWh)', align: 'right', render: (r) => (r.geracaoKwhMes != null ? decimal.format(r.geracaoKwhMes) : '—') },
            {
              key: 'statusDesempenho',
              label: 'Status (desempenho)',
              render: (r) => <span style={{ color: STATUS_DESEMPENHO_COR[r.statusDesempenho ?? ''] ?? undefined }}>{r.statusDesempenho ?? '—'}</span>,
            },
          ]}
        />
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4">
        <DataTable
          title="Detalhe por usina"
          rows={filtradas.slice().sort((a, b) => a.nome.localeCompare(b.nome))}
          maxHeight={480}
          onRowClick={setUsinaSelecionada}
          columns={[
            { key: 'nome', label: 'Usina', render: (r) => r.nome },
            { key: 'cliente', label: 'Cliente', render: (r) => r.cliente ?? '—' },
            { key: 'inv', label: 'Total investido', align: 'right', render: (r) => (r.totalInvestido != null ? currency.format(r.totalInvestido) : '—') },
            { key: 'conc', label: 'Concessionária', render: (r) => r.concessionaria ?? '—' },
            { key: 'cid', label: 'Cidade', render: (r) => r.cidade ?? '—' },
            { key: 'uf', label: 'UF', render: (r) => r.estado ?? '—' },
            { key: 'classe', label: 'Classe', render: (r) => r.classe ?? '—' },
            { key: 'plano', label: 'Plano', render: (r) => r.plano ?? '—' },
            { key: 'kwp', label: 'kWp', align: 'right', render: (r) => decimal.format(r.potenciaKwp ?? 0) },
            { key: 'ref', label: 'Mês/Ano (ref.)', render: (r) => r.mesAnoRecente ?? '—' },
            { key: 'prog', label: 'Prognóstico (kWh/mês)', align: 'right', render: (r) => (r.prognosticoKwhMes != null ? decimal.format(r.prognosticoKwhMes) : '—') },
            { key: 'ger', label: 'Geração (kWh/mês)', align: 'right', render: (r) => (r.geracaoKwhMes != null ? decimal.format(r.geracaoKwhMes) : '—') },
            { key: 'dmes', label: 'Desemp. mês', align: 'right', render: (r) => <span style={{ color: corDesempenho(r.desempenhoMesPct) }}>{pct(r.desempenhoMesPct)}</span> },
            { key: 'd30', label: '30D', align: 'right', render: (r) => <span style={{ color: corDesempenho(r.desempenho30dPct) }}>{pct(r.desempenho30dPct)}</span> },
            { key: 'd12', label: '12M', align: 'right', render: (r) => <span style={{ color: corDesempenho(r.desempenho12mPct) }}>{pct(r.desempenho12mPct)}</span> },
            { key: 'd3', label: 'Média 3M', align: 'right', render: (r) => <span style={{ color: corDesempenho(r.desempenhoMedio3mPct) }}>{pct(r.desempenhoMedio3mPct)}</span> },
            { key: 'st', label: 'Status (média 3M)', render: (r) => <span style={{ color: STATUS_DESEMPENHO_COR[r.statusDesempenho ?? ''] }}>{r.statusDesempenho ?? '—'}</span> },
            { key: 'inst', label: 'Instalação', render: (r) => (r.dataInstalacao ? new Date(r.dataInstalacao).toLocaleDateString('pt-BR') : '—') },
            ...MESES.flatMap((mes, i) => [
              { key: `g${i}`, label: `Ger. ${mes}`, align: 'right' as const, render: (r: UsinaRaw) => { const m = serieMensal(r)[i]; return m?.geracaoKwh != null ? decimal.format(m.geracaoKwh) + (m.parcial ? '*' : '') : '' } },
              { key: `p${i}`, label: `Desemp. ${mes}`, align: 'right' as const, render: (r: UsinaRaw) => { const m = serieMensal(r)[i]; return <span style={{ color: corDesempenho(m?.desempenhoPct) }}>{m?.desempenhoPct != null ? pct(m.desempenhoPct) : ''}</span> } },
            ]),
            { key: 'obs', label: 'Observação', render: (r) => r.observacao ?? '' },
          ]}
          footer={<p className="mt-2 text-xs text-[var(--text-muted)]">* mês corrente, parcial (sem desempenho). Desempenho = geração ÷ prognóstico; acima de 100% é válido; sem prognóstico fica em branco.</p>}
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
              <DetailRow label="Fonte dos dados" value={usinaSelecionada.fonte === 'solarz' ? `SolarZ ao vivo (${dataBr(usinaSelecionada.dadoEm)})` : 'Relatório importado'} />
              <DetailRow label="UC" value={usinaSelecionada.unidadesConsumidoras?.length ? usinaSelecionada.unidadesConsumidoras.join(', ') : '—'} />
              <DetailRow label="Tickets abertos" value={usinaSelecionada.ticketsAbertos != null ? String(usinaSelecionada.ticketsAbertos) : '—'} />
              <DetailRow label="Mês de referência" value={usinaSelecionada.mesAnoRecente ?? '—'} />
              <DetailRow label="Desempenho do mês" value={pct(usinaSelecionada.desempenhoMesPct)} />
              <DetailRow label="Desempenho 12M" value={pct(usinaSelecionada.desempenho12mPct)} />
              {usinaSelecionada.observacao && (
                <div className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-200">{usinaSelecionada.observacao}</div>
              )}
            </div>
            <div>
              <p className="mb-1 text-xs text-[var(--text-muted)]">{`Geração mensal ${usinaSelecionada.anoMensal ?? 2026} (kWh)`}</p>
              <ul className="space-y-1">
                {serieMensal(usinaSelecionada).map((m) => (
                  <li key={m.mes} className="flex justify-between text-xs">
                    <span className="text-[var(--text-secondary)]">{m.mes}/{String(usinaSelecionada.anoMensal ?? 2026).slice(2)}{m.parcial ? ' (parcial)' : ''}</span>
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
