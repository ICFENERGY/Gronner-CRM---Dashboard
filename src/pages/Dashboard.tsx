import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import { useRawData } from '../api/useRawData'
import { BarChartGeneric } from '../components/BarChartGeneric'
import { CategoriaLegend } from '../components/CategoriaLegend'
import { DonutChart } from '../components/DonutChart'
import { DataTable } from '../components/DataTable'
import { FilterBar, type FilterDef } from '../components/FilterBar'
import { FunilPipeline } from '../components/FunilPipeline'
import { KpiCard } from '../components/KpiCard'
import { PivotFunilAnoTable } from '../components/PivotFunilAnoTable'
import { SalesTrendChart } from '../components/SalesTrendChart'
import { TopVendedores } from '../components/TopVendedores'
import { useFilters, uniqueSorted } from '../hooks/useFilters'
import { buildGeografia, buildPivotFunilAno, buildPorCategoria, buildPorFunil } from '../lib/funilAggregations'
import { currency, number } from '../lib/palette'

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export function Dashboard() {
  const { data: projetos, loading: loadingProjetos, error: errorProjetos, reload: recarregarProjetos } = useRawData('projetos', api.getProjetosRaw)
  const { data: vendas, loading: loadingVendas, error: errorVendas, reload: recarregarVendas } = useRawData('vendas', api.getVendasRaw)
  const { data: propostas, loading: loadingPropostas, error: errorPropostas, reload: recarregarPropostas } = useRawData('propostas', api.getPropostasRaw)
  const { data: leadsResumo, reload: recarregarResumo } = useRawData('summary-leads', () => api.getSummary().then((s) => s.leads.total))
  const { values, onChange, onClear } = useFilters()
  const [atualizando, setAtualizando] = useState(false)
  const [syncMeta, setSyncMeta] = useState<{ geradoEm: string; sourceUpdatedAt?: string | null } | null>(null)
  const [buscaProjeto, setBuscaProjeto] = useState('')
  const [paginaProjetos, setPaginaProjetos] = useState(1)

  useEffect(() => {
    let ativo = true
    let ultimoSourceUpdatedAt: string | null = null
    const verificarAtualizacao = () => {
      api.getSummary().then((summary) => {
        if (!ativo) return
        setSyncMeta({ geradoEm: summary.geradoEm, sourceUpdatedAt: summary.sourceUpdatedAt })
        if (ultimoSourceUpdatedAt && summary.sourceUpdatedAt && summary.sourceUpdatedAt !== ultimoSourceUpdatedAt) {
          recarregarProjetos()
          recarregarVendas()
          recarregarPropostas()
          recarregarResumo()
        }
        ultimoSourceUpdatedAt = summary.sourceUpdatedAt ?? null
      }).catch(() => {})
    }
    verificarAtualizacao()
    const timer = window.setInterval(verificarAtualizacao, 60_000)
    return () => {
      ativo = false
      window.clearInterval(timer)
    }
  }, [])

  function atualizarDados() {
    setAtualizando(true)
    api.getSummary(true).then((summary) => {
      setSyncMeta({ geradoEm: summary.geradoEm, sourceUpdatedAt: summary.sourceUpdatedAt })
      recarregarProjetos()
      recarregarVendas()
      recarregarPropostas()
      recarregarResumo()
    }).finally(() => setAtualizando(false))
  }

  const filtros: FilterDef[] = useMemo(() => {
    if (!projetos || !vendas) return []
    return [
      {
        key: 'ano',
        label: 'Ano',
        options: uniqueSorted([
          ...projetos.map((p) => p.dataInclusao?.slice(0, 4)),
          ...vendas.map((v) => v.dataVenda?.slice(0, 4)),
        ]).reverse(),
      },
      {
        key: 'vendedor',
        label: 'Vendedor',
        options: uniqueSorted([...projetos.map((p) => p.vendedorResponsavel), ...vendas.map((v) => v.vendedor)]),
      },
      { key: 'estado', label: 'Estado', options: uniqueSorted([...projetos.map((p) => p.estado), ...vendas.map((v) => v.estado)]) },
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projetos, vendas])

  const projetosFiltrados = useMemo(() => {
    if (!projetos) return []
    return projetos.filter((p) => {
      if (values.ano && p.dataInclusao?.slice(0, 4) !== values.ano) return false
      if (values.vendedor && p.vendedorResponsavel !== values.vendedor) return false
      if (values.estado && p.estado !== values.estado) return false
      return true
    })
  }, [projetos, values])

  const vendasFiltradas = useMemo(() => {
    if (!vendas) return []
    return vendas.filter((v) => {
      if (values.ano && v.dataVenda?.slice(0, 4) !== values.ano) return false
      if (values.vendedor && v.vendedor !== values.vendedor) return false
      if (values.estado && v.estado !== values.estado) return false
      return true
    })
  }, [vendas, values])

  const propostasFiltradas = useMemo(() => {
    if (!propostas) return []
    return propostas.filter((p) => {
      if (values.ano && p.dataInclusao?.slice(0, 4) !== values.ano) return false
      if (values.vendedor && p.vendedorNome !== values.vendedor) return false
      return true
    })
  }, [propostas, values])

  const detalhesProjetos = useMemo(() => {
    const melhorProposta = new Map<number, { valor: number; aceita: boolean }>()
    for (const proposta of propostas ?? []) {
      if (proposta.projetoId == null || proposta.preco == null) continue
      const atual = melhorProposta.get(proposta.projetoId)
      if (!atual || (proposta.aceita && !atual.aceita) || (proposta.aceita === atual.aceita && proposta.preco > atual.valor)) {
        melhorProposta.set(proposta.projetoId, { valor: proposta.preco, aceita: proposta.aceita })
      }
    }
    return projetosFiltrados
      .map((projeto) => {
        const proposta = melhorProposta.get(projeto.id)
        if ((projeto.valorVenda ?? 0) > 0) return { ...projeto, valorProjeto: projeto.valorVenda ?? 0, origemValor: 'Venda' }
        if ((projeto.valorPrePropostaAceita ?? 0) > 0) {
          return { ...projeto, valorProjeto: projeto.valorPrePropostaAceita ?? 0, origemValor: 'Proposta aceita' }
        }
        return {
          ...projeto,
          valorProjeto: proposta?.valor ?? 0,
          origemValor: proposta ? (proposta.aceita ? 'Proposta aceita' : 'Proposta') : 'Sem valor',
        }
      })
      .sort((a, b) => (b.dataUltimaAtualizacao || b.dataInclusao || '').localeCompare(a.dataUltimaAtualizacao || a.dataInclusao || ''))
  }, [projetosFiltrados, propostas])

  const detalhesPesquisados = useMemo(() => {
    const termo = buscaProjeto.trim().toLocaleLowerCase('pt-BR')
    if (!termo) return detalhesProjetos
    return detalhesProjetos.filter((projeto) => [
      projeto.nome,
      projeto.funil,
      projeto.etapa,
      projeto.vendedorResponsavel,
      projeto.cidade,
      projeto.estado,
    ].some((valor) => valor?.toLocaleLowerCase('pt-BR').includes(termo)))
  }, [buscaProjeto, detalhesProjetos])

  const projetosPorPagina = 100
  const totalPaginasProjetos = Math.max(1, Math.ceil(detalhesPesquisados.length / projetosPorPagina))
  const paginaProjetosSegura = Math.min(paginaProjetos, totalPaginasProjetos)
  const projetosDaPagina = detalhesPesquisados.slice(
    (paginaProjetosSegura - 1) * projetosPorPagina,
    paginaProjetosSegura * projetosPorPagina,
  )

  useEffect(() => {
    setPaginaProjetos(1)
  }, [buscaProjeto, values.ano, values.estado, values.vendedor])

  if (loadingProjetos || loadingVendas || loadingPropostas) {
    return <p className="p-10 text-center text-[var(--text-secondary)]">Carregando dados do Groner CRM…</p>
  }

  const erro = errorProjetos || errorVendas || errorPropostas
  if (erro) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-6 text-red-800 dark:text-red-200">
        <p className="font-medium">Não foi possível carregar os dados.</p>
        <p className="mt-2 text-sm text-red-700 dark:text-red-300">{erro}</p>
      </div>
    )
  }

  const valorTotalVendas = vendasFiltradas.reduce((s, v) => s + v.valorTotal, 0)
  const comissaoTotalVendas = vendasFiltradas.reduce((s, v) => s + v.valorComissao, 0)
  const ticketMedio = vendasFiltradas.length ? valorTotalVendas / vendasFiltradas.length : 0

  const porVendedorMap = new Map<string, { vendedor: string; quantidade: number; valorTotal: number }>()
  for (const v of vendasFiltradas) {
    const cur = porVendedorMap.get(v.vendedor) ?? { vendedor: v.vendedor, quantidade: 0, valorTotal: 0 }
    cur.quantidade += 1
    cur.valorTotal += v.valorTotal
    porVendedorMap.set(v.vendedor, cur)
  }
  const porVendedor = [...porVendedorMap.values()].sort((a, b) => b.valorTotal - a.valorTotal)

  const porMesMap = new Map<string, { mes: string; quantidade: number; valorTotal: number }>()
  for (const v of vendasFiltradas) {
    if (!v.dataVenda) continue
    const mes = v.dataVenda.slice(0, 7)
    const cur = porMesMap.get(mes) ?? { mes, quantidade: 0, valorTotal: 0 }
    cur.quantidade += 1
    cur.valorTotal += v.valorTotal
    porMesMap.set(mes, cur)
  }
  const porMes = [...porMesMap.values()].sort((a, b) => a.mes.localeCompare(b.mes))

  const porFunil = buildPorFunil(projetosFiltrados)
  const porCategoria = buildPorCategoria(porFunil)
  const { porEstado, porConcessionaria } = buildGeografia(projetosFiltrados)
  const pivotFunilAno = buildPivotFunilAno(projetosFiltrados)

  const propostasAceitas = propostasFiltradas.filter((p) => p.aceita)
  const valorTotalPropostaAceita = propostasAceitas.reduce((s, p) => s + (p.preco ?? 0), 0)
  const valorTotalPropostaGeral = propostasFiltradas.reduce((s, p) => s + (p.preco ?? 0), 0)

  return (
    <div>
      <div className="mb-4 flex justify-end">
        {syncMeta && (() => {
          const atualizadoEm = syncMeta.sourceUpdatedAt || syncMeta.geradoEm
          const desatualizado = Date.now() - Date.parse(atualizadoEm) > 15 * 60 * 1000
          return <span className={`mr-3 self-center text-xs ${desatualizado ? 'text-amber-600' : 'text-[var(--text-muted)]'}`}>
            {desatualizado ? 'Dados possivelmente atrasados — ' : 'Dados atualizados às '}
            {new Date(atualizadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        })()}
        <button
          onClick={atualizarDados}
          disabled={atualizando}
          className="rounded-lg border border-icf-green bg-icf-green/10 px-4 py-2 text-sm font-medium text-icf-green dark:text-icf-greenLight hover:bg-icf-green/20 disabled:opacity-50"
        >
          {atualizando ? 'Atualizando…' : 'Atualizar dados'}
        </button>
      </div>

      <FilterBar filters={filtros} values={values} onChange={onChange} onClear={onClear} />

      <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Leads (total geral)" value={number.format(leadsResumo ?? 0)} hint="Não filtrado" />
        <KpiCard label="Projetos" value={number.format(projetosFiltrados.length)} />
        <KpiCard
          label="Vendas realizadas"
          value={number.format(vendasFiltradas.length)}
          hint={`Ticket médio: ${currency.format(ticketMedio)}`}
        />
        <KpiCard label="Valor total vendido" value={currency.format(valorTotalVendas)} />
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Comissões totais" value={currency.format(comissaoTotalVendas)} />
        <KpiCard label="Pré-propostas" value={number.format(propostasFiltradas.length)} />
        <KpiCard label="Pré-propostas aceitas" value={number.format(propostasAceitas.length)} hint={currency.format(valorTotalPropostaAceita)} />
        <KpiCard label="Valor total em propostas" value={currency.format(valorTotalPropostaGeral)} />
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4">
        <CategoriaLegend data={porCategoria} />
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4">
        <FunilPipeline data={porFunil} />
      </section>

      <section className="mb-6">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-sm font-medium text-[var(--text-primary)]">Clientes e projetos no funil</h2>
            <p className="text-xs text-[var(--text-muted)]">
              {number.format(detalhesPesquisados.length)} projetos nos filtros atuais. O valor prioriza venda, proposta aceita e depois proposta.
            </p>
          </div>
          <label className="text-xs text-[var(--text-muted)]">
            Buscar cliente ou etapa
            <input
              value={buscaProjeto}
              onChange={(event) => setBuscaProjeto(event.target.value)}
              placeholder="Nome, funil, etapa, vendedor…"
              className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-icf-green sm:w-72"
            />
          </label>
        </div>
        <DataTable
          title="Posição atual de cada projeto"
          maxHeight={520}
          rows={projetosDaPagina}
          columns={[
            { key: 'cliente', label: 'Cliente / projeto', render: (row) => row.nome || `Projeto #${row.id}` },
            { key: 'funil', label: 'Funil', render: (row) => row.funil || 'Sem funil' },
            { key: 'etapa', label: 'Etapa atual', render: (row) => row.etapa || 'Sem etapa' },
            { key: 'vendedor', label: 'Responsável', render: (row) => row.vendedorResponsavel || 'Não informado' },
            {
              key: 'valor',
              label: 'Valor do projeto',
              align: 'right',
              render: (row) => (
                <span title={row.origemValor}>
                  {row.valorProjeto > 0 ? currency.format(row.valorProjeto) : 'Não informado'}
                </span>
              ),
            },
            {
              key: 'atualizacao',
              label: 'Última atualização',
              render: (row) => {
                const data = row.dataUltimaAtualizacao || row.dataInclusao
                return data ? new Intl.DateTimeFormat('pt-BR').format(new Date(data)) : 'Não informada'
              },
            },
          ]}
          footer={
            <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-3 text-xs text-[var(--text-muted)]">
              <span>Página {paginaProjetosSegura} de {totalPaginasProjetos}</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={paginaProjetosSegura === 1}
                  onClick={() => setPaginaProjetos((pagina) => Math.max(1, pagina - 1))}
                  className="rounded border border-[var(--border)] px-3 py-1 disabled:opacity-40"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  disabled={paginaProjetosSegura === totalPaginasProjetos}
                  onClick={() => setPaginaProjetos((pagina) => Math.min(totalPaginasProjetos, pagina + 1))}
                  className="rounded border border-[var(--border)] px-3 py-1 disabled:opacity-40"
                >
                  Próxima
                </button>
              </div>
            </div>
          }
        />
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4">
        <PivotFunilAnoTable data={pivotFunilAno} />
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SalesTrendChart data={porMes} />
        <TopVendedores data={porVendedor} onSelect={(vendedor) => onChange('vendedor', vendedor)} />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarChartGeneric title="Projetos por estado" data={porEstado} layout="vertical" />
        <DonutChart title="Projetos por concessionária" data={porConcessionaria} />
      </section>
    </div>
  )
}
