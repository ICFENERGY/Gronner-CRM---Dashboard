import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../api/client'
import { useRawData } from '../../api/useRawData'
import { CHAVE_FILTROS_PAINEL, ErrorBoundary } from '../../components/ErrorBoundary'
import { Dashboard } from '../../pages/Dashboard'
import { useEngenharia } from '../engenharia/useEngenharia'
import { calcularPainel, opcoesFiltros } from '../painel/calculos'
import { ConteudoDetalhe, type Detalhe } from '../painel/detalhes'
import { NOMES_MESES, hojeSP } from '../painel/periodo'
import { Gaveta } from '../painel/ui/base'
import {
  calcularComercial, calcularEngenharia, calcularHomologacao, calcularUsinas, dataHoraBr, inteiro, itensAtencao, pctTxt, reais,
  type FiltrosVisao, type FontesVisao, type ItemAtencao,
} from './calculos'
import { EtapasPieta, GeracaoMensal, MarcosSemaforo, VendasMensais } from './graficos'
import { Bloco, FaixaAtencao } from './ui'

const CHAVE = CHAVE_FILTROS_PAINEL

function padrao(hoje = hojeSP()): FiltrosVisao {
  return { ano: hoje.slice(0, 4), mes: hoje.slice(5, 7), vendedor: '' }
}

function lerFiltros(): FiltrosVisao {
  const p = padrao()
  try {
    const o = JSON.parse(window.localStorage.getItem(CHAVE) ?? '{}')
    return {
      ano: typeof o.ano === 'string' && /^\d{4}$/.test(o.ano) ? o.ano : p.ano,
      mes: typeof o.mes === 'string' && /^(|0[1-9]|1[0-2])$/.test(o.mes) ? o.mes : p.mes,
      vendedor: typeof o.vendedor === 'string' ? o.vendedor : '',
    }
  } catch {
    return p
  }
}

type Aberto = { detalhe: Detalhe; escopo: 'filtro' | 'agora' } | { funil: true }

/**
 * Visão geral consultiva: o que precisa de atenção agora e um bloco por área
 * (Comercial, Engenharia, Usinas e Homologação), cada um com os KPIs, uma frase
 * de leitura, um gráfico e a fonte com a hora da atualização.
 */
export function VisaoGeralPage({ onAba, onModoReuniao }: { onAba: (k: string) => void; onModoReuniao: () => void }) {
  const [filtros, setFiltrosState] = useState<FiltrosVisao>(lerFiltros)
  const [aberto, setAberto] = useState<Aberto | null>(null)
  const setFiltros = (novo: FiltrosVisao) => {
    setFiltrosState(novo)
    try { window.localStorage.setItem(CHAVE, JSON.stringify(novo)) } catch { /* sem armazenamento local */ }
  }

  const vendas = useRawData('vendas', api.getVendasRaw)
  const propostas = useRawData('propostas', api.getPropostasRaw)
  const projetos = useRawData('projetos', api.getProjetosRaw)
  const tarefas = useRawData('tarefas', api.getTarefasRaw)
  const usinas = useRawData('usinas', api.getUsinasRaw)
  const pietaResumo = useRawData('pieta-resumo', api.getPietaResumo)
  const pietaMetricas = useRawData('pieta-metricas', api.getPietaMetricas)
  const resumo = useRawData('summary', () => api.getSummary())
  const eng = useEngenharia()

  // Hora em que o resumo da Pieta (consulta ao vivo) chegou.
  const pietaChegou = useRef<string | null>(null)
  if (pietaResumo.data && !pietaChegou.current) pietaChegou.current = new Date().toISOString()

  const fontes: FontesVisao = useMemo(() => ({
    vendas: vendas.data, propostas: propostas.data, projetos: projetos.data, tarefas: tarefas.data, usinas: usinas.data,
    engenharia: eng.dados, pietaResumo: pietaResumo.data, pietaMetricas: pietaMetricas.data,
  }), [vendas.data, propostas.data, projetos.data, tarefas.data, usinas.data, eng.dados, pietaResumo.data, pietaMetricas.data])

  const hoje = hojeSP()
  const comercial = useMemo(() => calcularComercial(fontes, filtros, hoje), [fontes, filtros, hoje])
  const engenharia = useMemo(() => calcularEngenharia(fontes, filtros, hoje), [fontes, filtros, hoje])
  const parque = useMemo(() => calcularUsinas(fontes, hoje), [fontes, hoje])
  const homolog = useMemo(() => calcularHomologacao(fontes, hoje), [fontes, hoje])
  const atencao = useMemo(() => itensAtencao(fontes, hoje), [fontes, hoje])

  // Listas da gaveta (reaproveita o detalhe do painel antigo).
  const fontesPainel = useMemo(() => ({ ...fontes, usinas: usinas.data?.usinas ?? null }), [fontes, usinas.data])
  const painelFiltro = useMemo(() => calcularPainel(fontesPainel, { ano: filtros.ano, mes: filtros.mes, vendedor: filtros.vendedor, uf: '' }), [fontesPainel, filtros])
  const painelAgora = useMemo(() => calcularPainel(fontesPainel, { ano: hoje.slice(0, 4), mes: hoje.slice(5, 7), vendedor: '', uf: '' }), [fontesPainel, hoje])
  const opcoes = useMemo(() => opcoesFiltros(fontesPainel), [fontesPainel])
  const fechar = useCallback(() => setAberto(null), [])

  const acaoItem = (i: ItemAtencao) => {
    if (i.acao.alvo.tipo === 'aba') onAba(i.acao.alvo.aba)
    else setAberto({ detalhe: i.acao.alvo.detalhe, escopo: 'agora' })
  }

  const carregando = [vendas, propostas, projetos, tarefas, usinas, pietaResumo].filter((x) => x.loading).length + (eng.carregando ? 1 : 0)
  const select = 'rounded-lg border border-[var(--border-strong)] bg-[var(--input-bg)] px-2.5 py-1.5 text-sm text-[var(--text-primary)] focus:border-icf-green focus:outline-none focus-visible:ring-2 focus-visible:ring-icf-green'
  const anos = opcoes.anos.includes(filtros.ano) ? opcoes.anos : [...opcoes.anos, filtros.ano].sort().reverse()
  const nomePeriodo = filtros.mes ? `${NOMES_MESES[Number(filtros.mes) - 1]}/${filtros.ano}` : filtros.ano
  const emCurso = comercial.iv.fim === hoje && (comercial.iv.inicio ?? '') <= hoje
  const vendedorTxt = filtros.vendedor ? ` · vendedor ${filtros.vendedor}` : ''

  useEffect(() => {
    // Guarda o padrão quando não há nada salvo, para o seletor e a URL não divergirem.
    try { if (!window.localStorage.getItem(CHAVE)) window.localStorage.setItem(CHAVE, JSON.stringify(filtros)) } catch { /* */ }
  }, [filtros])

  const sincVendas = (resumo.data?.syncStatus?.entities?.vendas ?? null) as { finishedAt?: string; lastSuccessfulRunAt?: string } | null
  const origem = usinas.data?.origemDados
  const cobertura = homolog?.cobertura

  return (
    <div className="mx-auto grid max-w-[1600px] grid-cols-[minmax(0,1fr)] gap-4">
      {/* Filtros, acima de tudo o que eles recortam */}
      <div className="sticky top-0 z-20 -mx-6 flex flex-wrap items-end gap-3 border-b border-[var(--border)] bg-[var(--bg)]/95 px-6 py-2.5 backdrop-blur md:-mx-10 md:px-10">
        <label className="grid gap-1 text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
          Ano
          <select className={select} value={filtros.ano} onChange={(e) => setFiltros({ ...filtros, ano: e.target.value, mes: e.target.value === hoje.slice(0, 4) || !filtros.mes || `${e.target.value}-${filtros.mes}` <= hoje.slice(0, 7) ? filtros.mes : '' })}>
            {anos.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
          Mês
          <select className={select} value={filtros.mes} onChange={(e) => setFiltros({ ...filtros, mes: e.target.value })}>
            <option value="">Ano inteiro</option>
            {NOMES_MESES.map((m, i) => { const v = String(i + 1).padStart(2, '0'); return <option key={m} value={v} disabled={`${filtros.ano}-${v}` > hoje.slice(0, 7)}>{m}</option> })}
          </select>
        </label>
        <label className="grid gap-1 text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
          Vendedor
          <select className={`${select} min-w-[190px]`} value={filtros.vendedor} onChange={(e) => setFiltros({ ...filtros, vendedor: e.target.value })}>
            <option value="">Todos</option>
            {opcoes.vendedores.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        {(filtros.vendedor || filtros.ano !== hoje.slice(0, 4) || filtros.mes !== hoje.slice(5, 7)) && (
          <button type="button" onClick={() => setFiltros(padrao())} className="rounded-lg border border-[var(--border-strong)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:border-icf-green focus:outline-none focus-visible:ring-2 focus-visible:ring-icf-green">
            Voltar ao mês atual
          </button>
        )}
        <p className="ml-auto max-w-[420px] self-center text-right text-xs leading-snug text-[var(--text-muted)]">
          Período e vendedor valem para o Comercial; o vendedor também recorta a Engenharia. Engenharia, Usinas e Homologação mostram a posição de hoje.
          {carregando ? ` Carregando ${carregando} fonte${carregando > 1 ? 's' : ''}…` : ''}
        </p>
      </div>

      <ErrorBoundary variante="cartao">
        <FaixaAtencao itens={atencao} carregando={carregando > 0} onAcao={acaoItem} />
      </ErrorBoundary>

      <div className="grid gap-4 lg:grid-cols-2">
        <Bloco
          area="Comercial · Groner"
          escopo={`${nomePeriodo}${emCurso ? ` até ${hoje.slice(8, 10)}/${hoje.slice(5, 7)}` : ''}${vendedorTxt}${comercial.base ? ` · comparação ${comercial.base}` : ''}`}
          rotuloAbrir="Abrir vendas"
          onAbrir={() => onAba('vendas')}
          estado={vendas.loading ? 'carregando' : vendas.error ? 'sem-dados' : !vendas.data?.length ? 'sem-dados' : 'ok'}
          motivo={vendas.error ? `Sem dados do Groner — ${vendas.error}.` : 'Sem dados do Groner — nenhuma venda sincronizada.'}
          kpis={comercial.kpis}
          frase={comercial.frase}
          tituloGrafico="Valor vendido por mês (R$) · últimos 12 meses"
          grafico={<VendasMensais dados={comercial.serie} />}
          tabela={{ colunas: ['Mês', 'Vendido', 'Vendas'], linhas: comercial.serie.map((s) => [`${s.nome}${s.parcial ? ' (em curso)' : ''}`, reais(s.valor), s.vendas]) }}
          extra={{ rotulo: 'Funil por etapa', onClick: () => setAberto({ funil: true }) }}
          rodape={[{ fonte: 'Groner (vendas e propostas)', quando: dataHoraBr(sincVendas?.finishedAt ?? sincVendas?.lastSuccessfulRunAt) }]}
        />

        <Bloco
          area="Engenharia"
          escopo={`Posição de hoje · o período não se aplica${vendedorTxt}`}
          rotuloAbrir="Abrir Engenharia"
          onAbrir={() => onAba('engenharia')}
          estado={!eng.dados && eng.carregando ? 'carregando' : !eng.dados || !engenharia ? 'sem-dados' : !engenharia.cards.length ? 'sem-dados' : 'ok'}
          motivo={eng.erro ? `Sem dados da Engenharia — ${eng.erro}.` : `Sem dados da Engenharia — nenhum card ativo no fluxo${filtros.vendedor ? ` para ${filtros.vendedor}` : ''}.`}
          kpis={engenharia?.kpis}
          frase={engenharia?.frase}
          aviso="Clique numa barra para ver os cards do marco."
          tituloGrafico="Cards ativos por marco · ordem do fluxo"
          grafico={engenharia && <MarcosSemaforo dados={engenharia.marcos} onClicar={(marco) => setAberto({ detalhe: { tipo: 'engenharia', titulo: `Engenharia · marco ${engenharia.marcos.find((m) => m.marco === marco)?.rotulo ?? marco}`, marco }, escopo: 'filtro' })} />}
          tabela={engenharia ? { colunas: ['Marco', 'Atrasado', 'Em risco', 'No prazo', 'Mediana (dias)', 'Prazo'], linhas: engenharia.marcos.map((m) => [m.rotulo, m.atrasado, m.risco, m.ok, m.medianaDias ?? '—', m.prazo]) } : undefined}
          rodape={[{ fonte: 'Groner (quadro da Engenharia)', quando: dataHoraBr(eng.dados?.fonte?.lastSuccessfulRunAt ?? eng.dados?.fonte?.sourceUpdatedAt ?? eng.dados?.geradoEm) }]}
        />

        <Bloco
          area="Usinas · SolarZ"
          escopo="Posição de hoje · período e vendedor não se aplicam"
          rotuloAbrir="Abrir Usinas"
          onAbrir={() => onAba('monitoramento')}
          estado={usinas.loading ? 'carregando' : usinas.error || !parque?.usinas.length ? 'sem-dados' : 'ok'}
          motivo={usinas.error ? `Sem dados da SolarZ — ${usinas.error}.` : 'Sem dados da SolarZ — nenhuma usina cadastrada.'}
          kpis={parque?.kpis}
          frase={parque?.frase}
          aviso={usinas.data?.avisoIntegracaoSolarZ ?? (parque?.serie.length ? `Gráfico só com as usinas ligadas à SolarZ e meses fechados (o mês em curso não entra).` : undefined)}
          tituloGrafico={`Geração real × prognóstico · ${parque?.serie[0]?.chave.slice(0, 4) ?? ''}`}
          grafico={parque?.serie.length ? <GeracaoMensal dados={parque.serie} /> : undefined}
          tabela={parque ? { colunas: ['Mês', 'Geração (kWh)', 'Prognóstico (kWh)', '% do prognóstico', 'Usinas'], linhas: parque.serie.map((s) => [s.nome, inteiro(s.geracao), inteiro(s.prognostico), s.pct != null ? pctTxt(s.pct) : '—', s.usinas]) } : undefined}
          rodape={[
            { fonte: 'SolarZ', quando: dataHoraBr(origem?.solarzAtualizadoEm), extra: origem ? `${inteiro(origem.usinasSolarz)} usinas` : undefined },
            ...(origem?.usinasRelatorio ? [{ fonte: 'relatório importado', quando: dataHoraBr(origem.relatorioExtraidoEm), extra: `${inteiro(origem.usinasRelatorio)} usinas sem SolarZ` }] : []),
          ]}
        />

        <Bloco
          area="Homologação · Pieta"
          escopo="Posição de hoje · período e vendedor não se aplicam"
          rotuloAbrir="Abrir Homologação"
          onAbrir={() => onAba('pieta')}
          estado={pietaResumo.loading ? 'carregando' : pietaResumo.error || !homolog?.projetos.length ? 'sem-dados' : 'ok'}
          motivo={pietaResumo.error ? `Sem dados da Pieta — ${pietaResumo.error}.` : 'Sem dados da Pieta — nenhum projeto no resumo.'}
          kpis={homolog?.kpis}
          frase={homolog?.frase}
          aviso={homolog?.demorada
            ? `Etapa mais demorada na base detalhada: ${homolog.demorada.etapa}, média de ${homolog.demorada.mediaDias!.toLocaleString('pt-BR')} dias (mediana ${homolog.demorada.medianaDias?.toLocaleString('pt-BR') ?? '—'}; ${homolog.demorada.projetos} projetos).${cobertura && cobertura.totalNoResumo && cobertura.armazenados < cobertura.totalNoResumo ? ` Base: ${cobertura.armazenados} de ${cobertura.totalNoResumo} projetos — carga em andamento.` : ''}`
            : undefined}
          tituloGrafico="Projetos em andamento por etapa"
          grafico={homolog?.etapas.length ? <EtapasPieta dados={homolog.etapas} /> : undefined}
          tabela={homolog ? { colunas: ['Etapa', 'Projetos', 'Tempo médio (dias)', 'Base'], linhas: homolog.etapas.map((e) => [e.etapa, e.projetos, e.mediaDias != null ? e.mediaDias.toLocaleString('pt-BR') : '—', e.amostra]) } : undefined}
          rodape={[
            { fonte: 'Pieta (resumo)', quando: dataHoraBr(pietaChegou.current), extra: homolog ? `${inteiro(homolog.projetos.length)} projetos` : undefined },
            ...(pietaMetricas.data && !pietaMetricas.data.vazio ? [{ fonte: 'Pieta (detalhe)', quando: dataHoraBr(pietaMetricas.data.atualizadoEm), extra: cobertura?.totalNoResumo ? `base: ${cobertura.armazenados} de ${cobertura.totalNoResumo} projetos` : undefined }] : []),
          ]}
        />
      </div>

      {aberto && 'detalhe' in aberto && (
        <Gaveta titulo={aberto.detalhe.titulo} onFechar={fechar}>
          <ErrorBoundary variante="cartao">
            <ConteudoDetalhe detalhe={aberto.detalhe} painel={aberto.escopo === 'agora' ? painelAgora : painelFiltro} onModoReuniao={() => { fechar(); onModoReuniao() }} />
          </ErrorBoundary>
        </Gaveta>
      )}
      {aberto && 'funil' in aberto && (
        <Gaveta titulo="Funil comercial por etapa" largura="larga" onFechar={fechar}>
          <Dashboard />
        </Gaveta>
      )}
    </div>
  )
}
