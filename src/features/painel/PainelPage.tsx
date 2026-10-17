import { useCallback, useMemo, useState } from 'react'
import { api } from '../../api/client'
import { Dashboard } from '../../pages/Dashboard'
import { useRawData } from '../../api/useRawData'
import { currency, number } from '../../lib/palette'
import { CHAVE_FILTROS_PAINEL, ErrorBoundary } from '../../components/ErrorBoundary'
import { useEngenharia } from '../engenharia/useEngenharia'
import { calcularPainel, filtrosValidos, opcoesFiltros, type Filtros } from './calculos'
import { ConteudoDetalhe, type Detalhe } from './detalhes'
import { PERIODOS, type PeriodoKey } from './periodo'
import { Cartao, Gaveta, Kpi } from './ui/base'
import { BarrasVerticais, EmpilhadoStatus, GeracaoPrognostico } from './ui/graficos'
import { CartaoRosca } from './ui/Rosca'

const CHAVE_FILTROS = CHAVE_FILTROS_PAINEL
const PADRAO: Filtros = { periodo: '12m', vendedor: '', uf: '' }

function lerFiltros(): Filtros {
  try { return filtrosValidos(JSON.parse(window.localStorage.getItem(CHAVE_FILTROS) ?? '{}'), PADRAO) } catch { return PADRAO }
}

const mil = (v: number) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi` : Math.abs(v) >= 1e3 ? `${Math.round(v / 1e3).toLocaleString('pt-BR')} mil` : number.format(Math.round(v)))
const reais = (v: number) => `R$ ${mil(v)}`

/**
 * Painel único: um filtro para tudo, KPIs das quatro áreas e gráficos lado a
 * lado. Qualquer KPI ou gráfico abre o detalhe numa gaveta, sem trocar de tela.
 */
const SEMAFORO_USINAS = { 'Dentro do esperado': 'ok', Atenção: 'risco', Crítico: 'atrasado' } as const
const SEMAFORO_PRAZO = { 'No prazo': 'ok', 'Em risco': 'risco', Atrasado: 'atrasado' } as const

export function PainelPage({ onModoReuniao, onAba }: { onModoReuniao: () => void; onAba: (k: string) => void }) {
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
        <Kpi area="Tarefas" rotulo="Tarefas atrasadas" valor={number.format(kpis.tarefasAtrasadas)} tom={kpis.tarefasAtrasadas ? 'atrasado' : 'ok'} pctTotal={kpis.tarefasTotal ? (100 * kpis.tarefasAtrasadas) / kpis.tarefasTotal : null} contexto={`de ${number.format(kpis.tarefasTotal)} tarefas`} onAbrir={() => setDetalhe({ tipo: 'tarefas', titulo: 'Tarefas atrasadas' })} />
        <Kpi area="Engenharia" rotulo="Cards atrasados" valor={number.format(kpis.engAtrasados)} tom={kpis.engAtrasados ? 'atrasado' : 'ok'} pctTotal={kpis.engAtivos ? (100 * kpis.engAtrasados) / kpis.engAtivos : null} contexto={`de ${kpis.engAtivos} ativos · ${kpis.engSemPlano} sem plano`} onAbrir={() => setDetalhe({ tipo: 'engenharia', titulo: 'Engenharia · atrasados', somenteAtrasados: true })} />
        <Kpi area="Engenharia" rotulo={`Obras além de ${kpis.meta} dias da venda`} valor={number.format(kpis.obrasAlemMeta)} tom={kpis.obrasAlemMeta ? 'risco' : 'ok'} pctTotal={kpis.obras ? (100 * kpis.obrasAlemMeta) / kpis.obras : null} contexto={`de ${kpis.obras} obras em andamento`} onAbrir={() => setDetalhe({ tipo: 'engenharia', titulo: `Obras além de ${kpis.meta} dias`, alemDaMeta: true })} />
        <Kpi area="Usinas" rotulo="Desempenho médio (3 meses)" valor={kpis.desempenhoUsinas != null ? `${kpis.desempenhoUsinas}%` : '—'} pctTotal={kpis.usinas ? (100 * kpis.usinasCriticas) / kpis.usinas : null} contexto={`${kpis.usinas} usinas · ${kpis.usinasCriticas} em estado crítico`} onAbrir={() => setDetalhe({ tipo: 'usinas', titulo: 'Usinas' })} />
        <Kpi area="Engenharia" rotulo="Carteira em implantação" valor={`${mil(eng.dados?.painel.porMomento.imp.kwp ?? 0)} kWp`} contexto={`${eng.dados?.painel.porMomento.imp.n ?? 0} obras · total ativo ${mil(eng.dados?.painel.kwpAtivo ?? 0)} kWp`} onAbrir={onModoReuniao} />
      </div>

      {/* Gráficos: séries no tempo em barras/linha; partes de um todo em rosca */}
      <div className="grid gap-4 lg:grid-cols-12">
        <Cartao
          className="lg:col-span-8"
          titulo={`Vendido por ${painel.intervalo.porDia ? 'dia' : 'mês'}`}
          subtitulo={`R$ · ${periodoTxt}${escopo ? ` · ${escopo}` : ''}`}
          colunas={['Período', 'Valor', 'Vendas']}
          linhas={series.vendasTempo.map((b) => ({ nome: b.nome, valores: [currency.format(b.valor), b.extra ?? 0] }))}
          onDetalhe={() => setDetalhe({ tipo: 'vendas', titulo: `Vendas · ${periodoTxt}` })}
        >
          <BarrasVerticais dados={series.vendasTempo} formatar={reais} rotuloValor="Vendido" altura={300} />
        </Cartao>
        <CartaoRosca
          className="lg:col-span-4"
          titulo="Funil comercial"
          subtitulo="Projetos por etapa do funil · posição atual"
          nota={filtros.periodo !== 'tudo' ? 'O período não se aplica: é a posição de hoje.' : undefined}
          dados={series.funil}
          colunaValor="Projetos"
          rotuloTotal="projetos"
          onDetalhe={() => setDetalhe({ tipo: 'analise', titulo: 'Visão geral do funil', pagina: 'geral' })}
        />

        <Cartao
          className="lg:col-span-8"
          titulo="Engenharia · cards por marco"
          subtitulo="16 marcos, do criar projeto ao dossiê · clique numa barra para ver os cards"
          nota={filtros.periodo !== 'tudo' ? 'O período não se aplica: é a situação de hoje.' : undefined}
          colunas={['Marco', 'Atrasado', 'Em risco', 'No prazo']}
          linhas={series.engMarcos.filter((m) => m.atrasado + m.risco + m.ok > 0).map((m) => ({ nome: m.titulo, valores: [m.atrasado, m.risco, m.ok] }))}
          onDetalhe={() => onAba('engenharia')}
        >
          <EmpilhadoStatus dados={series.engMarcos} onClicar={(marco) => setDetalhe({ tipo: 'engenharia', titulo: `Engenharia · marco ${marco}`, marco })} />
        </Cartao>
        <CartaoRosca
          className="lg:col-span-4"
          titulo="Participação por vendedor"
          subtitulo={`R$ vendido · ${periodoTxt} · clique para ver as vendas`}
          dados={series.vendedores}
          formatar={reais}
          formatarTabela={(v) => currency.format(v)}
          colunaValor="Vendido"
          rotuloTotal="vendido"
          onClicar={(nome) => setDetalhe({ tipo: 'vendas', titulo: `Vendas de ${nome}`, vendedor: nome })}
          onDetalhe={() => onAba('vendas')}
        />

        <CartaoRosca
          className="lg:col-span-4"
          titulo="Vendas por UF"
          subtitulo={`R$ vendido · ${periodoTxt}`}
          dados={series.ufs}
          formatar={reais}
          formatarTabela={(v) => currency.format(v)}
          colunaValor="Vendido"
          rotuloTotal="vendido"
          onClicar={(uf) => setDetalhe({ tipo: 'vendas', titulo: `Vendas · ${uf}`, uf })}
        />
        <CartaoRosca
          className="lg:col-span-4"
          titulo="Homologação por concessionária"
          subtitulo="Cards entre protocolo e vistoria (marcos 5 a 12)"
          dados={series.concessionarias}
          colunaValor="Cards"
          rotuloTotal="cards"
          onClicar={(c) => setDetalhe({ tipo: 'engenharia', titulo: `Homologação · ${c}`, concessionaria: c })}
        />
        <CartaoRosca
          className="lg:col-span-4"
          titulo="Tarefas atrasadas por responsável"
          subtitulo="Estado atual"
          nota={filtros.vendedor || filtros.uf ? 'Vendedor e UF não se aplicam a tarefas.' : undefined}
          dados={series.tarefasResponsavel}
          colunaValor="Atrasadas"
          rotuloTotal="atrasadas"
          onClicar={(r) => setDetalhe({ tipo: 'tarefas', titulo: `Tarefas atrasadas · ${r}`, responsavel: r })}
          onDetalhe={() => onAba('tarefas')}
        />

        <Cartao
          className="lg:col-span-8"
          titulo="Usinas · geração real contra prognóstico"
          subtitulo={`kWh por mês em 2026${filtros.uf ? ` · ${filtros.uf}` : ''}`}
          nota={filtros.vendedor ? 'Vendedor não se aplica a usinas.' : undefined}
          colunas={['Mês', 'Geração (kWh)', 'Prognóstico (kWh)']}
          linhas={series.geracao.map((b) => ({ nome: b.nome, valores: [number.format(b.valor), number.format(b.extra ?? 0)] }))}
          onDetalhe={() => onAba('monitoramento')}
        >
          <GeracaoPrognostico dados={series.geracao} formatar={mil} />
        </Cartao>
        <CartaoRosca
          className="lg:col-span-4"
          titulo="Usinas por status de desempenho"
          subtitulo="Média dos últimos 3 meses"
          dados={series.statusUsinas}
          semaforo={SEMAFORO_USINAS}
          colunaValor="Usinas"
          rotuloTotal="usinas"
          onClicar={(st) => setDetalhe({ tipo: 'usinas', titulo: `Usinas · ${st}`, status: st })}
        />

        <CartaoRosca
          className="lg:col-span-6"
          titulo="Cards de engenharia por situação"
          subtitulo="Prazo de cada card ativo · posição atual"
          dados={series.engSituacao}
          semaforo={SEMAFORO_PRAZO}
          colunaValor="Cards"
          rotuloTotal="cards"
          onDetalhe={() => onAba('engenharia')}
        />
        <CartaoRosca
          className="lg:col-span-6"
          titulo="Tarefas por status"
          subtitulo="Todas as tarefas · estado atual"
          dados={series.tarefasStatus}
          colunaValor="Tarefas"
          rotuloTotal="tarefas"
          onDetalhe={() => onAba('tarefas')}
        />
      </div>

      {detalhe && detalhe.tipo !== 'analise' && (
        <Gaveta titulo={detalhe.titulo} onFechar={fechar}>
          <ErrorBoundary variante="cartao">
            <ConteudoDetalhe detalhe={detalhe} painel={painel} onModoReuniao={() => { fechar(); onModoReuniao() }} />
          </ErrorBoundary>
        </Gaveta>
      )}
      {detalhe?.tipo === 'analise' && <AnaliseCompleta titulo={detalhe.titulo} onFechar={fechar} />}
    </div>
  )
}

// Funil geral (tela antiga de projetos por etapa), aberto na gaveta larga.
export function AnaliseCompleta({ titulo, onFechar }: { titulo: string; onFechar: () => void }) {
  return (
    <Gaveta titulo={titulo} largura="larga" onFechar={onFechar}>
      <Dashboard />
    </Gaveta>
  )
}
