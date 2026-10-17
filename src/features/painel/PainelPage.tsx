import { useCallback, useMemo, useState } from 'react'
import { api } from '../../api/client'
import { Dashboard } from '../../pages/Dashboard'
import { useRawData } from '../../api/useRawData'
import { currency, number } from '../../lib/palette'
import { CHAVE_FILTROS_PAINEL, ErrorBoundary } from '../../components/ErrorBoundary'
import { useEngenharia } from '../engenharia/useEngenharia'
import { calcularPainel, FILTROS_PADRAO, filtrosValidos, opcoesFiltros, type Filtros } from './calculos'
import { ConteudoDetalhe, type Detalhe } from './detalhes'
import { anoEspecifico, NOMES_MESES, textoPeriodo } from './periodo'
import { BlocoArea, Cartao, Gaveta, Kpi } from './ui/base'
import { BarrasVerticais, EmpilhadoStatus, GeracaoPrognostico } from './ui/graficos'
import { CartaoRosca } from './ui/Rosca'

const CHAVE_FILTROS = CHAVE_FILTROS_PAINEL
const PADRAO: Filtros = FILTROS_PADRAO

function lerFiltros(): Filtros {
  try { return filtrosValidos(JSON.parse(window.localStorage.getItem(CHAVE_FILTROS) ?? '{}'), PADRAO) } catch { return PADRAO }
}

const mil = (v: number) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi` : Math.abs(v) >= 1e3 ? `${Math.round(v / 1e3).toLocaleString('pt-BR')} mil` : number.format(Math.round(v)))
const reais = (v: number) => `R$ ${mil(v)}`

/**
 * Painel único: um filtro (ano, mês, vendedor, UF) para tudo, painéis em rosca por
 * área, KPIs e gráficos no tempo. Qualquer KPI ou gráfico abre o detalhe numa
 * gaveta, sem trocar de tela.
 */
const SEMAFORO_USINAS = { 'Dentro do esperado': 'ok', Atenção: 'risco', Crítico: 'atrasado' } as const
const SEMAFORO_PRAZO = { 'No prazo': 'ok', 'Em risco': 'risco', Atrasado: 'atrasado' } as const
const MOMENTO_DE: Record<string, string> = { 'Pré-venda': 'pre', Implantação: 'imp', 'Gestão da usina': 'usi' }

export function PainelPage({ onModoReuniao, onAba }: { onModoReuniao: () => void; onAba: (k: string) => void }) {
  const [filtros, setFiltrosState] = useState<Filtros>(lerFiltros)
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null)
  const setFiltro = <K extends keyof Filtros>(k: K, v: Filtros[K]) => {
    const novo = { ...filtros, [k]: v }
    if (k === 'ano' && !anoEspecifico(String(v))) novo.mes = ''
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
  const periodoTxt = textoPeriodo(filtros.ano, filtros.mes)
  const escopo = [filtros.vendedor, filtros.uf].filter(Boolean).join(' · ')
  const sufixoEscopo = escopo ? ` · ${escopo}` : ''
  const notaPosicao = filtros.ano !== 'tudo' ? 'O período não se aplica: é a posição de hoje.' : undefined
  const notaUfProposta = filtros.uf ? 'UF não se aplica a propostas.' : undefined
  const select = 'rounded-lg border border-[var(--border-strong)] bg-[var(--input-bg)] px-2.5 py-1.5 text-sm text-[var(--text-primary)] focus:border-icf-green focus:outline-none'
  const situacaoDe = (nome: string) => SEMAFORO_PRAZO[nome as keyof typeof SEMAFORO_PRAZO]

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      {/* Filtro único, acima de tudo o que ele recorta */}
      <div className="sticky top-0 z-20 -mx-6 flex flex-wrap items-end gap-3 border-b border-[var(--border)] bg-[var(--bg)]/95 px-6 py-3 backdrop-blur md:-mx-10 md:px-10">
        <label className="grid gap-1 text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
          Ano
          <select className={select} value={filtros.ano} onChange={(e) => setFiltro('ano', e.target.value)}>
            <option value="12m">Últimos 12 meses</option>
            <option value="tudo">Todos os anos</option>
            {opcoes.anos.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
          Mês
          <select className={`${select} disabled:opacity-50`} value={filtros.mes} disabled={!anoEspecifico(filtros.ano)} onChange={(e) => setFiltro('mes', e.target.value)} title={anoEspecifico(filtros.ano) ? undefined : 'Escolha um ano para filtrar por mês'}>
            <option value="">Todos</option>
            {NOMES_MESES.map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
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
        {(filtros.vendedor || filtros.uf || filtros.ano !== PADRAO.ano || filtros.mes) && (
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

      {/* Painéis por área: partes de um todo em rosca, todas recortadas pelos filtros */}
      <h2 className="mt-1 text-base font-semibold text-[var(--text-primary)]">Painéis por área</h2>

      <BlocoArea area="Comercial" subtitulo={`Vendas e propostas · ${periodoTxt}${sufixoEscopo}`}>
        <CartaoRosca
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
          titulo="Vendas por origem do lead"
          subtitulo={`Quantidade de vendas · ${periodoTxt}`}
          dados={series.origens}
          colunaValor="Vendas"
          rotuloTotal="vendas"
          onClicar={(origem) => setDetalhe({ tipo: 'vendas', titulo: `Vendas · origem ${origem}`, origem })}
        />
        <CartaoRosca
          titulo="Propostas aceitas e não aceitas"
          subtitulo={`Propostas criadas · ${periodoTxt}`}
          nota={notaUfProposta}
          dados={series.propostasAceitacao}
          colunaValor="Propostas"
          rotuloTotal="propostas"
          onClicar={(nome) => setDetalhe({ tipo: 'propostas', titulo: `Propostas ${nome.toLowerCase()}`, grupo: nome === 'Aceitas' ? 'aceitas' : 'nao-aceitas' })}
        />
        <CartaoRosca
          titulo="Funil comercial"
          subtitulo="Projetos por etapa do funil · posição atual"
          nota={notaPosicao}
          dados={series.funil}
          colunaValor="Projetos"
          rotuloTotal="projetos"
          onDetalhe={() => setDetalhe({ tipo: 'analise', titulo: 'Visão geral do funil', pagina: 'geral' })}
        />
      </BlocoArea>

      <BlocoArea area="Engenharia" subtitulo={`Cards do quadro de engenharia · posição atual${sufixoEscopo}`}>
        <CartaoRosca
          titulo="Cards por momento"
          subtitulo="Pré-venda, implantação e gestão da usina"
          nota={notaPosicao}
          dados={series.engMomento}
          colunaValor="Cards"
          rotuloTotal="cards"
          onClicar={(nome) => setDetalhe({ tipo: 'engenharia', titulo: `Engenharia · ${nome}`, momento: MOMENTO_DE[nome] })}
          onDetalhe={() => onAba('engenharia')}
        />
        <CartaoRosca
          titulo="Cards por situação"
          subtitulo="Prazo de cada card ativo"
          nota={notaPosicao}
          dados={series.engSituacao}
          semaforo={SEMAFORO_PRAZO}
          colunaValor="Cards"
          rotuloTotal="cards"
          onClicar={(nome) => setDetalhe({ tipo: 'engenharia', titulo: `Engenharia · ${nome.toLowerCase()}`, situacao: situacaoDe(nome) })}
          onDetalhe={() => onAba('engenharia')}
        />
        <CartaoRosca
          titulo="Cards por marco"
          subtitulo="Os 5 marcos com mais cards; o resto em Outros"
          nota={notaPosicao}
          dados={series.engMarcosRosca}
          colunaValor="Cards"
          rotuloTotal="cards"
          onClicar={(nome) => { const marco = nome.split(' · ')[0]; setDetalhe({ tipo: 'engenharia', titulo: `Engenharia · marco ${marco}`, marco }) }}
        />
        <CartaoRosca
          titulo="Homologação por concessionária"
          subtitulo="Cards entre protocolo e vistoria (marcos 5 a 12)"
          nota={notaPosicao}
          dados={series.concessionarias}
          colunaValor="Cards"
          rotuloTotal="cards"
          onClicar={(c) => setDetalhe({ tipo: 'engenharia', titulo: `Homologação · ${c}`, concessionaria: c })}
        />
      </BlocoArea>

      <BlocoArea area="Financeiro" subtitulo={`Valor vendido, status e propostas · ${periodoTxt}${sufixoEscopo}`}>
        <CartaoRosca
          titulo="Composição do valor vendido"
          subtitulo={`Lucro, comissão e demais custos · ${periodoTxt}`}
          nota={`Demais custos = valor − lucro − comissão; negativos = 0. Lucro em ${painel.vendas.filter((v) => Number(v.lucro) > 0).length} de ${painel.vendas.length} vendas.`}
          dados={series.finComposicao}
          formatar={reais}
          formatarTabela={(v) => currency.format(v)}
          colunaValor="R$"
          rotuloTotal="vendido"
          onDetalhe={() => setDetalhe({ tipo: 'vendas', titulo: `Vendas · ${periodoTxt}` })}
        />
        <CartaoRosca
          titulo="Vendas por status"
          subtitulo={`R$ vendido · ${periodoTxt} · clique para ver as vendas`}
          dados={series.finStatus}
          formatar={reais}
          formatarTabela={(v) => currency.format(v)}
          colunaValor="Vendido"
          rotuloTotal="vendido"
          onClicar={(status) => setDetalhe({ tipo: 'vendas', titulo: `Vendas · ${status}`, status })}
        />
        <CartaoRosca
          titulo="Projetos no funil Financeiro"
          subtitulo="Por etapa do funil 07. FINANCEIRO · posição atual"
          nota={notaPosicao}
          dados={series.finFunil}
          colunaValor="Projetos"
          rotuloTotal="projetos"
          onClicar={(etapa) => setDetalhe({ tipo: 'projetos', titulo: `Financeiro · ${etapa}`, etapa })}
          onDetalhe={() => setDetalhe({ tipo: 'projetos', titulo: 'Funil Financeiro' })}
        />
        <CartaoRosca
          titulo="Propostas aceitas: vendidas e não vendidas"
          subtitulo={`R$ das propostas aceitas · ${periodoTxt}`}
          nota={`Vendida = projeto com valor de venda ou do funil 06. Contrato em diante.${filtros.uf ? ' UF não se aplica a propostas.' : ''}`}
          dados={series.finPropostas}
          formatar={reais}
          formatarTabela={(v) => currency.format(v)}
          colunaValor="R$"
          rotuloTotal="aceitas"
          onClicar={(nome) => setDetalhe({ tipo: 'propostas', titulo: `Propostas aceitas · ${nome.toLowerCase()}`, grupo: nome === 'Já vendidas' ? 'vendidas' : 'nao-vendidas' })}
        />
      </BlocoArea>

      {/* KPIs das quatro áreas */}
      <h2 className="mt-1 text-base font-semibold text-[var(--text-primary)]">Indicadores</h2>
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

      {/* Séries no tempo e demais áreas */}
      <h2 className="mt-1 text-base font-semibold text-[var(--text-primary)]">Evolução e acompanhamento</h2>
      <div className="grid gap-4 lg:grid-cols-12">
        <Cartao
          className="lg:col-span-8"
          titulo={`Vendido por ${painel.intervalo.porDia ? 'dia' : 'mês'}`}
          subtitulo={`R$ · ${periodoTxt}${sufixoEscopo}`}
          colunas={['Período', 'Valor', 'Vendas']}
          linhas={series.vendasTempo.map((b) => ({ nome: b.nome, valores: [currency.format(b.valor), b.extra ?? 0] }))}
          onDetalhe={() => setDetalhe({ tipo: 'vendas', titulo: `Vendas · ${periodoTxt}` })}
        >
          <BarrasVerticais dados={series.vendasTempo} formatar={reais} rotuloValor="Vendido" altura={300} />
        </Cartao>
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

        <Cartao
          className="lg:col-span-8"
          titulo="Engenharia · cards por marco"
          subtitulo="16 marcos, do criar projeto ao dossiê · clique numa barra para ver os cards"
          nota={notaPosicao}
          colunas={['Marco', 'Atrasado', 'Em risco', 'No prazo']}
          linhas={series.engMarcos.filter((m) => m.atrasado + m.risco + m.ok > 0).map((m) => ({ nome: m.titulo, valores: [m.atrasado, m.risco, m.ok] }))}
          onDetalhe={() => onAba('engenharia')}
        >
          <EmpilhadoStatus dados={series.engMarcos} onClicar={(marco) => setDetalhe({ tipo: 'engenharia', titulo: `Engenharia · marco ${marco}`, marco })} />
        </Cartao>
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
          className="lg:col-span-4"
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
