import { useCallback, useMemo, useState } from 'react'
import { api } from '../../api/client'
import { Dashboard } from '../../pages/Dashboard'
import { IndicadorTarefasPage } from '../../pages/IndicadorTarefasPage'
import { MonitoramentoSolarPage } from '../../pages/MonitoramentoSolarPage'
import { PietaPage } from '../../pages/PietaPage'
import { ValidacaoCadastroPage } from '../../pages/ValidacaoCadastroPage'
import { VendasPage } from '../../pages/VendasPage'
import { useRawData } from '../../api/useRawData'
import { currency, number } from '../../lib/palette'
import { useEngenharia } from '../engenharia/useEngenharia'
import { calcularPainel, opcoesFiltros, type Filtros } from './calculos'
import { ConteudoDetalhe, type Detalhe } from './detalhes'
import { PERIODOS, type PeriodoKey } from './periodo'
import { Cartao, Gaveta, Kpi } from './ui/base'
import { BarrasHorizontais, BarrasVerticais, EmpilhadoStatus, GeracaoPrognostico } from './ui/graficos'

const CHAVE_FILTROS = 'painel:filtros'
const PADRAO: Filtros = { periodo: '12m', vendedor: '', uf: '' }

function lerFiltros(): Filtros {
  try { return { ...PADRAO, ...JSON.parse(window.localStorage.getItem(CHAVE_FILTROS) ?? '{}') } } catch { return PADRAO }
}

const mil = (v: number) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi` : Math.abs(v) >= 1e3 ? `${Math.round(v / 1e3).toLocaleString('pt-BR')} mil` : number.format(Math.round(v)))
const reais = (v: number) => `R$ ${mil(v)}`

/**
 * Painel único: um filtro para tudo, KPIs das quatro áreas e gráficos lado a
 * lado. Qualquer KPI ou gráfico abre o detalhe numa gaveta, sem trocar de tela.
 */
export function PainelPage({ onModoReuniao }: { onModoReuniao: () => void }) {
  const [filtros, setFiltrosState] = useState<Filtros>(lerFiltros)
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null)
  const setFiltro = <K extends keyof Filtros>(k: K, v: Filtros[K]) => {
    const novo = { ...filtros, [k]: v }
    setFiltrosState(novo)
    try { window.localStorage.setItem(CHAVE_FILTROS, JSON.stringify(novo)) } catch { /* sem armazenamento local */ }
  }

  const vendas = useRawData('vendas', api.getVendasRaw)
  const propostas = useRawData('propostas', api.getPropostasRaw)
  const projetos = useRawData('projetos', api.getProjetosRaw)
  const tarefas = useRawData('tarefas', api.getTarefasRaw)
  const usinas = useRawData('usinas', api.getUsinasRaw)
  const eng = useEngenharia()

  const fontes = useMemo(() => ({
    vendas: vendas.data, propostas: propostas.data, projetos: projetos.data, tarefas: tarefas.data,
    usinas: usinas.data?.usinas ?? null, engenharia: eng.dados,
  }), [vendas.data, propostas.data, projetos.data, tarefas.data, usinas.data, eng.dados])
  const painel = useMemo(() => calcularPainel(fontes, filtros), [fontes, filtros])
  const opcoes = useMemo(() => opcoesFiltros(fontes), [fontes])
  const fechar = useCallback(() => setDetalhe(null), [])

  const carregando = [vendas, propostas, projetos, tarefas, usinas].filter((x) => x.loading).length + (eng.carregando ? 1 : 0)
  const erros = [vendas.error, propostas.error, projetos.error, tarefas.error, usinas.error, eng.erro].filter(Boolean)
  const { kpis, series } = painel
  const periodoTxt = PERIODOS.find((p) => p.k === filtros.periodo)?.rotulo.toLowerCase()
  const escopo = [filtros.vendedor, filtros.uf].filter(Boolean).join(' · ')
  const select = 'rounded-lg border border-[var(--border-strong)] bg-[var(--input-bg)] px-2.5 py-1.5 text-sm text-[var(--text-primary)] focus:border-icf-green focus:outline-none'

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      {/* Filtro único, acima de tudo o que ele recorta */}
      <div className="sticky top-0 z-20 -mx-6 flex flex-wrap items-end gap-3 border-b border-[var(--border)] bg-[var(--bg)]/95 px-6 py-3 backdrop-blur md:-mx-10 md:px-10">
        <label className="grid gap-1 text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
          Período
          <select className={select} value={filtros.periodo} onChange={(e) => setFiltro('periodo', e.target.value as PeriodoKey)}>
            {PERIODOS.map((p) => <option key={p.k} value={p.k}>{p.rotulo}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
          Vendedor
          <select className={`${select} min-w-[180px]`} value={filtros.vendedor} onChange={(e) => setFiltro('vendedor', e.target.value)}>
            <option value="">Todos</option>
            {opcoes.vendedores.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
          UF
          <select className={select} value={filtros.uf} onChange={(e) => setFiltro('uf', e.target.value)}>
            <option value="">Todas</option>
            {opcoes.ufs.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        {(filtros.vendedor || filtros.uf || filtros.periodo !== PADRAO.periodo) && (
          <button type="button" onClick={() => { setFiltrosState(PADRAO); try { window.localStorage.removeItem(CHAVE_FILTROS) } catch { /* */ } }} className="rounded-lg border border-[var(--border-strong)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:border-icf-green">
            Limpar filtros
          </button>
        )}
        <span className="ml-auto self-center text-xs text-[var(--text-muted)]">
          {carregando ? `Carregando ${carregando} fonte${carregando > 1 ? 's' : ''}…` : 'Atualiza sozinho a cada minuto'}
        </span>
      </div>

      {erros.length > 0 && (
        <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
          Algumas fontes não carregaram: {erros.join(' · ')}. O resto do painel segue com o que chegou.
        </p>
      )}

      {/* KPIs das quatro áreas */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi area="Comercial" rotulo={`Vendido · ${periodoTxt}`} valor={reais(kpis.vendido)} variacao={kpis.vendidoVar} contexto={kpis.vendidoVar != null ? 'contra o período anterior' : escopo || undefined} onAbrir={() => setDetalhe({ tipo: 'vendas', titulo: `Vendas · ${periodoTxt}` })} />
        <Kpi area="Comercial" rotulo="Vendas e ticket médio" valor={number.format(kpis.qtdVendas)} variacao={kpis.qtdVendasVar} contexto={`ticket médio ${currency.format(kpis.ticket)}`} onAbrir={() => setDetalhe({ tipo: 'vendas', titulo: `Vendas · ${periodoTxt}` })} />
        <Kpi area="Comercial" rotulo="Propostas aceitas" valor={kpis.conversao != null ? `${kpis.conversao}%` : '—'} contexto={`${number.format(kpis.aceitas)} de ${number.format(kpis.propostas)} propostas do período`} onAbrir={() => setDetalhe({ tipo: 'propostas', titulo: `Propostas · ${periodoTxt}` })} />
        <Kpi area="Tarefas" rotulo="Tarefas atrasadas" valor={number.format(kpis.tarefasAtrasadas)} tom={kpis.tarefasAtrasadas ? 'atrasado' : 'ok'} contexto="estado atual, todos os responsáveis" onAbrir={() => setDetalhe({ tipo: 'tarefas', titulo: 'Tarefas atrasadas' })} />
        <Kpi area="Engenharia" rotulo="Cards atrasados" valor={number.format(kpis.engAtrasados)} tom={kpis.engAtrasados ? 'atrasado' : 'ok'} contexto={`de ${kpis.engAtivos} ativos · ${kpis.engSemPlano} sem plano`} onAbrir={() => setDetalhe({ tipo: 'engenharia', titulo: 'Engenharia · atrasados', somenteAtrasados: true })} />
        <Kpi area="Engenharia" rotulo={`Obras além de ${kpis.meta} dias da venda`} valor={number.format(kpis.obrasAlemMeta)} tom={kpis.obrasAlemMeta ? 'risco' : 'ok'} contexto={`de ${kpis.obras} obras em andamento`} onAbrir={() => setDetalhe({ tipo: 'engenharia', titulo: `Obras além de ${kpis.meta} dias`, alemDaMeta: true })} />
        <Kpi area="Usinas" rotulo="Desempenho médio (3 meses)" valor={kpis.desempenhoUsinas != null ? `${kpis.desempenhoUsinas}%` : '—'} contexto={`${kpis.usinas} usinas · ${kpis.usinasCriticas} em estado crítico`} onAbrir={() => setDetalhe({ tipo: 'usinas', titulo: 'Usinas' })} />
        <Kpi area="Engenharia" rotulo="Carteira em implantação" valor={`${mil(eng.dados?.painel.porMomento.imp.kwp ?? 0)} kWp`} contexto={`${eng.dados?.painel.porMomento.imp.n ?? 0} obras · total ativo ${mil(eng.dados?.painel.kwpAtivo ?? 0)} kWp`} onAbrir={onModoReuniao} />
      </div>

      {/* Gráficos */}
      <div className="grid gap-4 lg:grid-cols-12">
        <Cartao
          className="lg:col-span-8"
          titulo={`Vendido por ${painel.intervalo.porDia ? 'dia' : 'mês'}`}
          subtitulo={`R$ · ${periodoTxt}${escopo ? ` · ${escopo}` : ''}`}
          colunas={['Período', 'Valor', 'Vendas']}
          linhas={series.vendasTempo.map((b) => ({ nome: b.nome, valores: [currency.format(b.valor), b.extra ?? 0] }))}
          onDetalhe={() => setDetalhe({ tipo: 'vendas', titulo: `Vendas · ${periodoTxt}` })}
        >
          <BarrasVerticais dados={series.vendasTempo} formatar={reais} rotuloValor="Vendido" altura={330} />
        </Cartao>
        <Cartao
          className="lg:col-span-4"
          titulo="Funil comercial"
          subtitulo="Projetos por etapa do funil · posição atual"
          nota={filtros.periodo !== 'tudo' ? 'O período não se aplica: é a posição de hoje.' : undefined}
          colunas={['Etapa', 'Projetos']}
          linhas={series.funil.map((b) => ({ nome: b.nome, valores: [number.format(b.valor)] }))}
          onDetalhe={() => setDetalhe({ tipo: 'analise', titulo: 'Visão geral do funil', pagina: 'geral' })}
        >
          <BarrasHorizontais dados={series.funil} formatar={(v) => number.format(v)} rotuloValor="Projetos" />
        </Cartao>

        <Cartao
          className="lg:col-span-8"
          titulo="Engenharia · cards por marco"
          subtitulo="16 marcos, do criar projeto ao dossiê · clique numa barra para ver os cards"
          nota={filtros.periodo !== 'tudo' ? 'O período não se aplica: é a situação de hoje.' : undefined}
          colunas={['Marco', 'Atrasado', 'Em risco', 'No prazo']}
          linhas={series.engMarcos.filter((m) => m.atrasado + m.risco + m.ok > 0).map((m) => ({ nome: m.titulo, valores: [m.atrasado, m.risco, m.ok] }))}
          onDetalhe={onModoReuniao}
        >
          <EmpilhadoStatus dados={series.engMarcos} onClicar={(marco) => setDetalhe({ tipo: 'engenharia', titulo: `Engenharia · marco ${marco}`, marco })} />
        </Cartao>
        <Cartao
          className="lg:col-span-4"
          titulo="Ranking de vendedores"
          subtitulo={`R$ vendido · ${periodoTxt} · clique para ver as vendas`}
          colunas={['Vendedor', 'Valor', 'Vendas']}
          linhas={series.vendedores.map((b) => ({ nome: b.nome, valores: [currency.format(b.valor), b.extra ?? 0] }))}
          onDetalhe={() => setDetalhe({ tipo: 'analise', titulo: 'Análise de vendas', pagina: 'vendas' })}
        >
          <BarrasHorizontais dados={series.vendedores} formatar={reais} rotuloValor="Vendido" onClicar={(nome) => setDetalhe({ tipo: 'vendas', titulo: `Vendas de ${nome}`, vendedor: nome })} />
        </Cartao>

        <Cartao
          className="lg:col-span-4"
          titulo="Vendas por UF"
          subtitulo={`R$ vendido · ${periodoTxt}`}
          colunas={['UF', 'Valor', 'Vendas']}
          linhas={series.ufs.map((b) => ({ nome: b.nome, valores: [currency.format(b.valor), b.extra ?? 0] }))}
        >
          <BarrasHorizontais dados={series.ufs} formatar={reais} rotuloValor="Vendido" onClicar={(uf) => setDetalhe({ tipo: 'vendas', titulo: `Vendas · ${uf}`, uf })} />
        </Cartao>
        <Cartao
          className="lg:col-span-4"
          titulo="Homologação por concessionária"
          subtitulo="Cards entre protocolo e vistoria (marcos 5 a 12)"
          colunas={['Concessionária', 'Cards']}
          linhas={series.concessionarias.map((b) => ({ nome: b.nome, valores: [b.valor] }))}
        >
          <BarrasHorizontais dados={series.concessionarias} formatar={(v) => number.format(v)} rotuloValor="Cards" onClicar={(c) => setDetalhe({ tipo: 'engenharia', titulo: `Homologação · ${c}`, concessionaria: c })} />
        </Cartao>
        <Cartao
          className="lg:col-span-4"
          titulo="Tarefas atrasadas por responsável"
          subtitulo="Estado atual"
          nota={filtros.vendedor || filtros.uf ? 'Vendedor e UF não se aplicam a tarefas.' : undefined}
          colunas={['Responsável', 'Atrasadas']}
          linhas={series.tarefasResponsavel.map((b) => ({ nome: b.nome, valores: [b.valor] }))}
          onDetalhe={() => setDetalhe({ tipo: 'analise', titulo: 'Indicador de tarefas', pagina: 'tarefas' })}
        >
          <BarrasHorizontais dados={series.tarefasResponsavel} formatar={(v) => number.format(v)} rotuloValor="Atrasadas" onClicar={(r) => setDetalhe({ tipo: 'tarefas', titulo: `Tarefas atrasadas · ${r}`, responsavel: r })} />
        </Cartao>

        <Cartao
          className="lg:col-span-8"
          titulo="Usinas · geração real contra prognóstico"
          subtitulo={`kWh por mês em 2026${filtros.uf ? ` · ${filtros.uf}` : ''}`}
          nota={filtros.vendedor ? 'Vendedor não se aplica a usinas.' : undefined}
          colunas={['Mês', 'Geração (kWh)', 'Prognóstico (kWh)']}
          linhas={series.geracao.map((b) => ({ nome: b.nome, valores: [number.format(b.valor), number.format(b.extra ?? 0)] }))}
          onDetalhe={() => setDetalhe({ tipo: 'analise', titulo: 'Monitoramento solar', pagina: 'monitoramento' })}
        >
          <GeracaoPrognostico dados={series.geracao} formatar={mil} />
        </Cartao>
        <Cartao
          className="lg:col-span-4"
          titulo="Usinas por status de desempenho"
          subtitulo="Média dos últimos 3 meses"
          colunas={['Status', 'Usinas']}
          linhas={series.statusUsinas.map((b) => ({ nome: b.nome, valores: [b.valor] }))}
        >
          <BarrasHorizontais dados={series.statusUsinas} formatar={(v) => number.format(v)} rotuloValor="Usinas" onClicar={(s) => setDetalhe({ tipo: 'usinas', titulo: `Usinas · ${s}`, status: s })} />
        </Cartao>
      </div>

      {detalhe && detalhe.tipo !== 'analise' && (
        <Gaveta titulo={detalhe.titulo} onFechar={fechar}>
          <ConteudoDetalhe detalhe={detalhe} painel={painel} onModoReuniao={() => { fechar(); onModoReuniao() }} />
        </Gaveta>
      )}
      {detalhe?.tipo === 'analise' && <AnaliseCompleta pagina={detalhe.pagina} titulo={detalhe.titulo} onFechar={fechar} />}
    </div>
  )
}

// Análises completas (as telas antigas), abertas na gaveta larga em vez de abas.
export type PaginaAnalise = 'geral' | 'vendas' | 'cadastro' | 'tarefas' | 'monitoramento' | 'pieta'
export const ANALISES: { k: PaginaAnalise; rotulo: string }[] = [
  { k: 'geral', rotulo: 'Visão geral do funil' },
  { k: 'vendas', rotulo: 'Análise de vendas' },
  { k: 'cadastro', rotulo: 'Validação de cadastro' },
  { k: 'tarefas', rotulo: 'Indicador de tarefas' },
  { k: 'monitoramento', rotulo: 'Monitoramento solar' },
  { k: 'pieta', rotulo: 'Pieta (PIEP)' },
]

export function AnaliseCompleta({ pagina, titulo, onFechar }: { pagina: PaginaAnalise; titulo: string; onFechar: () => void }) {
  return (
    <Gaveta titulo={titulo} largura="larga" onFechar={onFechar}>
      {pagina === 'geral' && <Dashboard />}
      {pagina === 'vendas' && <VendasPage />}
      {pagina === 'cadastro' && <ValidacaoCadastroPage />}
      {pagina === 'tarefas' && <IndicadorTarefasPage />}
      {pagina === 'monitoramento' && <MonitoramentoSolarPage />}
      {pagina === 'pieta' && <PietaPage />}
    </Gaveta>
  )
}
