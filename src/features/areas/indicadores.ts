/**
 * Linhas das tabelas de indicadores de cada área: uma linha por indicador,
 * com unidade, valor atual, período anterior, variação (com o sentido do que
 * é melhor) e situação. Cada linha leva a fórmula na definição.
 */
import {
  DIAS_PARADO, calcularComercial, calcularFinanceiro, calcularGeral, calcularHomologacao, calcularUsinas, decimal1, inteiro, pctTxt, reaisExato, rotuloMes,
  type Fontes, type Filtros,
} from './calculos'
import { hojeSP } from '../painel/periodo'

export type Unidade = 'R$' | '%' | 'kWh' | 'kWp' | 'dias' | 'qtd.' | 'mês'
export type Situacao = 'ok' | 'atencao' | 'critico' | null
/** O que é melhor quando o número sobe. */
export type Sentido = 'maior-melhor' | 'menor-melhor' | 'neutro'

export interface Variacao { seta: '↑' | '↓' | '→'; texto: string; tom: 'bom' | 'ruim' | 'neutro'; sentido: Sentido }

export interface Linha {
  id: string
  nome: string
  unidade: Unidade
  atual: string
  anterior: string | null
  variacao: Variacao | null
  /** Indicador da posição de hoje: sem período anterior. */
  posicaoAtual: boolean
  /** Base própria da linha, quando difere da base da tabela (ex.: mês anterior). */
  base?: string
  situacao: Situacao
  definicao: string
  /** Contexto curto ao lado do nome (ex.: "12 projetos"). */
  nota?: string
}
export interface GrupoLinhas { titulo: string; linhas: Linha[] }
export interface Tabela { base: string | null; grupos: GrupoLinhas[] }

// ---------- formatação por unidade ----------
export function formatar(v: number | null | undefined, u: Unidade): string {
  if (v == null || !Number.isFinite(v)) return '—'
  if (u === 'R$') return reaisExato(v)
  if (u === '%') return pctTxt(v)
  if (u === 'kWp' || u === 'dias') return decimal1(v)
  return inteiro(v)
}

const sinal = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '')
function tomDe(v: number, sentido: Sentido): Variacao['tom'] {
  if (v === 0 || sentido === 'neutro') return 'neutro'
  return (v > 0) === (sentido === 'maior-melhor') ? 'bom' : 'ruim'
}

/** Variação percentual; null sem base (anterior zero ou ausente). Taxas (%) variam em pontos percentuais. */
export function variacao(atual: number | null, anterior: number | null, unidade: Unidade, sentido: Sentido): Variacao | null {
  if (atual == null || anterior == null) return null
  if (unidade === '%') {
    const v = Math.round(atual - anterior)
    return { seta: v > 0 ? '↑' : v < 0 ? '↓' : '→', texto: `${sinal(v)}${inteiro(Math.abs(v))} p.p.`, tom: tomDe(v, sentido), sentido }
  }
  if (anterior === 0) return atual === 0 ? { seta: '→', texto: '0%', tom: 'neutro', sentido } : null
  const v = Math.round(((atual - anterior) / anterior) * 100)
  return { seta: v > 0 ? '↑' : v < 0 ? '↓' : '→', texto: `${sinal(v)}${inteiro(Math.abs(v))}%`, tom: tomDe(v, sentido), sentido }
}

const FRASE_SENTIDO: Record<Sentido, string> = { 'maior-melhor': 'Subir é bom.', 'menor-melhor': 'Subir é ruim.', neutro: 'Sem melhor ou pior: é contexto.' }

/** Linha com comparação ao período anterior. */
function comparada(id: string, nome: string, unidade: Unidade, atual: number | null, anterior: number | null, sentido: Sentido, definicao: string, extra: Partial<Linha> = {}): Linha {
  return {
    id, nome, unidade, atual: formatar(atual, unidade), anterior: anterior == null ? null : formatar(anterior, unidade),
    variacao: variacao(atual, anterior, unidade, sentido), posicaoAtual: false, situacao: null,
    definicao: `${definicao} ${FRASE_SENTIDO[sentido]}`, ...extra,
  }
}
/** Linha da posição de hoje (sem comparação possível). */
function posicao(id: string, nome: string, unidade: Unidade, atual: number | string | null, definicao: string, extra: Partial<Linha> = {}): Linha {
  return { id, nome, unidade, atual: typeof atual === 'string' ? atual : formatar(atual, unidade), anterior: null, variacao: null, posicaoAtual: true, situacao: null, definicao, ...extra }
}

/** Faixas do status de desempenho (as mesmas do servidor): até 50% Crítico, até 70% Atenção, acima OK. */
export const situacaoDesempenho = (pct: number | null): Situacao => (pct == null ? null : Math.round(pct) <= 50 ? 'critico' : Math.round(pct) <= 70 ? 'atencao' : 'ok')
/** Contagem que pede ação: zero é OK; acima de zero, a situação dada. */
const situacaoContagem = (n: number | null, acima: Situacao): Situacao => (n == null ? null : n === 0 ? 'ok' : acima)

// ---------- Visão Geral ----------
export function tabelaGeral(f: Fontes, filtros: Filtros, hoje = hojeSP()): Tabela {
  const g = calcularGeral(f, filtros, hoje)
  const c = g.vendas
  const fin = g.financeiro
  const a = c.temAnterior
  // Mesma regra do alerta: queda de 50% ou mais com base mínima de 3 vendas pede atenção.
  const queda = a && c.vendidoAnt && (c.qtdAnt ?? 0) >= 3 ? Math.round((100 * (c.vendidoAnt - c.vendido)) / c.vendidoAnt) : null
  const sitVendido: Situacao = queda == null ? null : queda >= 50 ? 'atencao' : 'ok'
  const pctParados = g.emMovimento ? (100 * g.parados) / g.emMovimento : null
  const qtd = (n: number) => `${inteiro(n)} ${n === 1 ? 'projeto' : 'projetos'}`
  return {
    base: c.base || null,
    grupos: [
      {
        titulo: 'Projetos',
        linhas: [
          posicao('ativos', 'Projetos ativos', 'qtd.', g.temProjetos ? g.ativos : null, 'Projetos hoje nos funis de clientes do Groner (01 a 17), sem os funis de perda (22 e 23) e sem etapas de saída (perdido, desistência, recusado, descartado). O vendedor é o responsável pelo projeto.'),
          comparada('novos', 'Projetos novos (leads)', 'qtd.', c.leads, a ? c.leadsAnt : null, 'maior-melhor', 'Projetos criados no período (data de inclusão) nos funis de clientes; ficam fora parcerias, RH e grupos internos.'),
          posicao('parados', `Parados há mais de ${DIAS_PARADO} dias`, 'qtd.', g.temProjetos ? g.parados : null, `Projetos ativos dos funis 04 (vendas) a 11 (instalação) sem nenhuma atualização no Groner há mais de ${DIAS_PARADO} dias. Metade ou mais parada pede atenção.`, { nota: g.emMovimento ? `${pctTxt(pctParados!)} de ${inteiro(g.emMovimento)} nesses funis` : undefined, situacao: pctParados == null ? null : pctParados >= 50 ? 'atencao' : pctParados === 0 ? 'ok' : null }),
          posicao('kwp', 'Potência em carteira', 'kWp', g.temProjetos ? g.kwpCarteira : null, 'Soma da potência dos projetos ativos dos funis 06 (contrato) a 11 (instalação). Só conta os projetos com potência informada.', { nota: `${inteiro(g.comKwp)} de ${inteiro(g.qtdCarteira)} projetos com kWp informado` }),
          posicao('valor-carteira', 'Valor em carteira', 'R$', g.temProjetos ? g.valorCarteira : null, 'Soma do valor dos projetos ativos dos funis 06 a 11: o valor da venda; sem ele, o da proposta aceita. O detalhe por funil está na aba Financeiro.', { nota: qtd(g.qtdCarteira) }),
        ],
      },
      {
        titulo: 'Funil · posição de hoje',
        linhas: g.categorias.map((cat) => posicao(`funil-${cat.chave}`, cat.nome, 'qtd.', cat.qtd, `Projetos ativos hoje nos funis ${cat.funis.join(', ')} do Groner (categoria “${cat.nome}”). O gráfico abaixo abre cada funil.`, { nota: `funis ${cat.funis.join(', ')}` })),
      },
      {
        titulo: 'Propostas',
        linhas: [
          comparada('propostas', 'Propostas criadas', 'qtd.', c.propostas, a ? c.propostasAnt : null, 'maior-melhor', 'Pré-propostas com data de inclusão no período.'),
          comparada('aceitas', 'Propostas aceitas', 'qtd.', c.aceitas, a ? c.aceitasAnt : null, 'maior-melhor', 'Das propostas criadas no período, as marcadas como aceitas no Groner.'),
          comparada('taxa', 'Taxa de aceite', '%', c.taxaAceite, a ? c.taxaAceiteAnt : null, 'maior-melhor', 'Propostas aceitas ÷ propostas criadas no período. A variação é em pontos percentuais (p.p.).'),
          comparada('aceitas-valor', 'Valor em propostas aceitas', 'R$', fin.aceitas.valor, a ? fin.aceitasAnt!.valor : null, 'maior-melhor', 'Soma do preço das propostas aceitas criadas no período, uma por projeto (a alterada por último).', { nota: qtd(fin.aceitas.qtd) }),
        ],
      },
      {
        titulo: 'Vendas',
        linhas: [
          comparada('qtd', 'Nº de vendas', 'qtd.', c.qtd, a ? c.qtdAnt : null, 'maior-melhor', 'Quantidade de vendas com data de venda no período.'),
          comparada('vendido', 'Valor vendido', 'R$', c.vendido, a ? c.vendidoAnt : null, 'maior-melhor', 'Soma do valor total das vendas com data de venda no período. Queda de 50% ou mais (com 3 vendas ou mais na base) pede atenção.', { situacao: sitVendido }),
          comparada('ticket', 'Ticket médio', 'R$', c.ticket, a ? c.ticketAnt : null, 'maior-melhor', 'Valor vendido ÷ nº de vendas do período.'),
        ],
      },
      {
        titulo: 'Tarefas · posição de hoje',
        linhas: [
          posicao('tarefas-abertas', 'Tarefas abertas', 'qtd.', g.temTarefas ? g.tarefasAbertas : null, 'Tarefas do Groner que não estão finalizadas. Não seguem o período nem o vendedor.', { nota: g.temTarefas ? `de ${inteiro(g.tarefasTotal)} tarefas` : undefined }),
          posicao('tarefas', 'Tarefas atrasadas', 'qtd.', g.temTarefas ? g.tarefasAtrasadas : null, 'Tarefas do Groner, hoje, com a data de entrega vencida e não concluídas. Não seguem o período nem o vendedor.', { situacao: g.tarefasAtrasadas === 0 ? 'ok' : null }),
        ],
      },
    ],
  }
}

// ---------- Vendas (aprofundamento comercial) ----------
export function tabelaVendas(f: Fontes, filtros: Filtros, hoje = hojeSP()): Tabela {
  const c = calcularComercial(f, filtros, hoje)
  const a = c.temAnterior
  const ant = c.ant
  const umaCasa = (v: number | null | undefined) => (v == null ? '—' : decimal1(v))
  return {
    base: c.base || null,
    grupos: [
      {
        titulo: 'Conversão',
        linhas: [
          comparada('conversao', 'Aceitas que viraram venda', '%', c.conversao, a ? c.conversaoAnt : null, 'maior-melhor', 'Projetos com proposta aceita no período que já têm venda (valor de venda ou funil 06. Contrato em diante) ÷ projetos com proposta aceita no período. Variação em p.p.'),
          comparada('propostas-por-venda', 'Propostas por venda', 'qtd.', c.atual.propostasPorVenda, a ? ant?.propostasPorVenda ?? null : null, 'menor-melhor', 'Propostas criadas no período ÷ nº de vendas do período: quantas propostas o time faz para fechar uma venda.', { atual: umaCasa(c.atual.propostasPorVenda), anterior: a ? umaCasa(ant?.propostasPorVenda) : null }),
          comparada('ciclo', 'Ciclo médio de venda', 'dias', c.atual.ciclo, a ? ant?.ciclo ?? null : null, 'menor-melhor', 'Média do ciclo de venda (dias da criação do projeto até a venda, como o Groner registra) das vendas do período.'),
        ],
      },
      {
        titulo: 'Ticket',
        linhas: [
          comparada('mediana-venda', 'Venda mediana', 'R$', c.atual.medianaVenda, a ? ant?.medianaVenda ?? null : null, 'maior-melhor', 'Valor do meio das vendas do período (metade vende mais, metade menos). Pesa menos uma venda grande do que o ticket médio da Visão Geral.'),
          comparada('maior-venda', 'Maior venda', 'R$', c.atual.maiorVenda, a ? ant?.maiorVenda ?? null : null, 'neutro', 'Valor da maior venda do período.'),
        ],
      },
      {
        titulo: 'Vendedores',
        linhas: [
          comparada('vendedores', 'Vendedores com venda', 'qtd.', c.atual.vendedores, a ? ant?.vendedores ?? null : null, 'maior-melhor', 'Vendedores com pelo menos uma venda no período.'),
          comparada('vendedores-proposta', 'Vendedores com proposta', 'qtd.', c.atual.comProposta, a ? ant?.comProposta ?? null : null, 'maior-melhor', 'Vendedores com pelo menos uma proposta criada no período.'),
          comparada('concentracao', 'Peso do maior vendedor', '%', c.atual.concentracao, a ? ant?.concentracao ?? null : null, 'menor-melhor', 'Valor vendido pelo vendedor que mais vendeu ÷ valor vendido no período. Quanto maior, mais o resultado depende de uma pessoa. Variação em p.p.'),
        ],
      },
    ],
  }
}

// ---------- Financeiro ----------
export function tabelaFinanceiro(f: Fontes, filtros: Filtros, hoje = hojeSP()): Tabela {
  const c = calcularFinanceiro(f, filtros, hoje)
  const a = c.temAnterior
  const qtd = (n: number) => `${inteiro(n)} ${n === 1 ? 'projeto' : 'projetos'}`
  const valorProjeto = 'Valor de cada projeto = valor da venda; sem ele, o da proposta aceita.'
  return {
    base: c.base || null,
    grupos: [
      {
        titulo: 'Propostas aceitas no período',
        linhas: [
          comparada('aceitas-valor', 'Valor em propostas aceitas', 'R$', c.aceitas.valor, a ? c.aceitasAnt!.valor : null, 'maior-melhor', 'Soma do preço das propostas aceitas criadas no período, uma por projeto (a alterada por último).', { nota: qtd(c.aceitas.qtd) }),
          comparada('aceitas-vendidas', 'Aceitas já vendidas', 'R$', c.aceitas.vendidas, a ? c.aceitasAnt!.vendidas : null, 'maior-melhor', 'Parte do valor em propostas aceitas cujo projeto tem valor de venda ou já está do funil 06. Contrato em diante.'),
          comparada('aceitas-sem-venda', 'Aceitas ainda sem venda', 'R$', c.aceitas.semVenda, a ? c.aceitasAnt!.semVenda : null, 'neutro', 'Parte do valor em propostas aceitas cujo projeto ainda não virou venda: dinheiro a converter.', { nota: qtd(c.aceitas.qtdSemVenda) }),
        ],
      },
      {
        titulo: 'Resultado das vendas no período',
        linhas: [
          comparada('lucro', 'Lucro registrado', 'R$', c.res.lucro, a ? c.resAnt!.lucro : null, 'maior-melhor', 'Soma do lucro informado nas vendas do período (sem negativos e nunca acima do valor da venda).', { nota: `em ${inteiro(c.res.comLucro)} ${c.res.comLucro === 1 ? 'venda' : 'vendas'}` }),
          comparada('margem', 'Margem registrada', '%', c.res.margem, a ? c.resAnt!.margem : null, 'maior-melhor', 'Lucro registrado ÷ valor das vendas que têm lucro informado. A variação é em pontos percentuais (p.p.).'),
          comparada('cobertura-lucro', 'Vendas com lucro informado', '%', c.res.cobertura, a ? c.resAnt!.cobertura : null, 'maior-melhor', 'Vendas do período com lucro preenchido ÷ todas as vendas do período. Mostra quanto o lucro e a margem representam.'),
          comparada('comissao', 'Comissão registrada', 'R$', c.res.comissao, a ? c.resAnt!.comissao : null, 'neutro', 'Soma do valor de comissão informado nas vendas do período.'),
        ],
      },
      {
        titulo: 'Funil financeiro · posição de hoje',
        linhas: [
          posicao('banco', 'Banco e simulação (funil 05)', 'R$', c.banco.valor, `Projetos hoje no funil 05. Banco/Simulação/Aprovação, sem recusados nem desistências. ${valorProjeto}`, { nota: qtd(c.banco.qtd) }),
          posicao('aguardando-pagamento', 'Aguardando pagamento (funil 07)', 'R$', c.aguardandoPagamento.valor, `Projetos hoje no funil 07. Financeiro nas etapas Aguardando pagamento, Pendente pagamento ou Pagamento em processo. ${valorProjeto}`, { nota: qtd(c.aguardandoPagamento.qtd) }),
          posicao('pagamento-realizado', 'Pagamento realizado (funil 07)', 'R$', c.pagamentoRealizado.valor, `Projetos hoje no funil 07. Financeiro na etapa Pagamento realizado. ${valorProjeto}`, { nota: qtd(c.pagamentoRealizado.qtd) }),
        ],
      },
      {
        titulo: 'Valor em carteira por funil · posição de hoje',
        linhas: [
          ...c.carteira.filter((x) => x.n !== 7).map((x) => posicao(`carteira-${x.n}`, `Funil ${String(x.n).padStart(2, '0')} · ${x.nome}`, 'R$', x.valor, `Projetos hoje no funil ${String(x.n).padStart(2, '0')}. ${x.nome} do Groner, sem etapas de perda. ${valorProjeto}${x.n === 10 ? ' É o funil do Groner, não a base da PIETA (aba Homologação).' : ''}`, { nota: qtd(x.qtd) })),
          posicao('carteira-total', 'Carteira total (funis 06 a 11)', 'R$', c.carteiraTotal.valor, `Soma dos funis 06 a 11, incluindo o funil 07. Financeiro. ${valorProjeto}`, { nota: qtd(c.carteiraTotal.qtd) }),
        ],
      },
    ],
  }
}

// ---------- Usinas ----------
export function tabelaUsinas(f: Fontes, hoje = hojeSP()): Tabela | null {
  const u = calcularUsinas(f, hoje)
  if (!u) return null
  const ul = u.ultimo
  const pn = u.penultimo
  const baseMes = pn ? rotuloMes(pn.chave) : undefined
  const mensal = (id: string, nome: string, unidade: Unidade, atual: number | null, anterior: number | null, sentido: Sentido, def: string, extra: Partial<Linha> = {}) =>
    comparada(id, nome, unidade, atual, anterior, sentido, def, { base: baseMes, ...extra })
  const janela = (id: string, nome: string, d: { valor: number | null; n: number }, def: string) =>
    posicao(id, nome, '%', d.valor, `${def} Faixas: até 50% Crítico, de 51% a 70% Atenção, acima de 70% OK.`, { situacao: situacaoDesempenho(d.valor), nota: `${inteiro(d.n)} usinas com dado` })
  return {
    base: null,
    grupos: [
      {
        titulo: 'Parque',
        linhas: [
          posicao('total', 'Total de usinas', 'qtd.', u.total, 'Usinas cadastradas: as premium (SolarZ ao vivo) mais as do relatório importado.'),
          posicao('premium', 'Premium (SolarZ ao vivo)', 'qtd.', u.premium, 'Usinas com monitoramento premium, lidas da SolarZ pela carga diária.'),
          posicao('nao-premium', 'Não premium (relatório importado)', 'qtd.', u.naoPremium, 'Usinas sem monitoramento premium; os números delas vêm do último relatório importado.'),
          posicao('kwp', 'Potência instalada', 'kWp', u.kwp, 'Soma da potência de todas as usinas.'),
        ],
      },
      {
        titulo: ul ? `Mês de referência · usinas premium` : 'Mês de referência',
        linhas: ul
          ? [
              { ...posicao('mes-ref', 'Mês de referência', 'mês', rotuloMes(ul.chave), 'Último mês fechado com geração e prognóstico na SolarZ. O mês em curso não entra. O período anterior das linhas deste grupo é o mês antes dele.'), posicaoAtual: false, anterior: baseMes ?? null, base: baseMes },
              mensal('geracao', 'Geração do mês', 'kWh', ul.geracao, pn?.geracao ?? null, 'maior-melhor', 'Soma da geração real no mês de referência das usinas premium com geração e prognóstico no mês.', { nota: `${inteiro(ul.usinas)} usinas` }),
              mensal('prognostico', 'Prognóstico do mês', 'kWh', ul.prognostico, pn?.prognostico ?? null, 'neutro', 'Soma do prognóstico de geração das mesmas usinas no mês de referência.'),
              mensal('desempenho-mes', 'Desempenho do mês', '%', ul.pct, pn?.pct ?? null, 'maior-melhor', 'Geração do mês ÷ prognóstico do mês. Variação em pontos percentuais (p.p.). Faixas: até 50% Crítico, de 51% a 70% Atenção, acima de 70% OK.', { situacao: situacaoDesempenho(ul.pct) }),
            ]
          : [posicao('mes-ref', 'Mês de referência', 'mês', '—', 'Sem mês fechado com geração e prognóstico na SolarZ.')],
      },
      {
        titulo: 'Desempenho médio · posição de hoje',
        linhas: [
          janela('d30', 'Desempenho 30 dias', u.d30, 'Média simples, entre as usinas com dado, de geração ÷ prognóstico nos últimos 30 dias.'),
          janela('d3', 'Desempenho 3 meses', u.d3, 'Média simples, entre as usinas com dado, de geração ÷ prognóstico nos últimos 3 meses fechados. É a base do status de desempenho.'),
          janela('d12', 'Desempenho 12 meses', u.d12, 'Média simples, entre as usinas com dado, de geração ÷ prognóstico nos últimos 12 meses.'),
        ],
      },
      {
        titulo: 'Status de desempenho (média de 3 meses)',
        linhas: [
          posicao('st-dentro', 'Dentro do esperado', 'qtd.', u.dentro, 'Usinas com média de 3 meses acima de 70% do prognóstico.'),
          posicao('st-atencao', 'Em atenção', 'qtd.', u.atencao, 'Usinas com média de 3 meses entre 51% e 70% do prognóstico.'),
          posicao('st-criticas', 'Críticas', 'qtd.', u.criticas, 'Usinas com média de 3 meses em até 50% do prognóstico. Acima de zero, pede atenção.', { situacao: situacaoContagem(u.criticas, 'atencao') }),
          posicao('st-sem', 'Sem dado', 'qtd.', u.semDado, 'Usinas sem geração e prognóstico suficientes para a média de 3 meses.'),
        ],
      },
      {
        titulo: 'Farol da SolarZ · hoje',
        linhas: [
          posicao('farol-normal', 'Farol Normal', 'qtd.', u.farolNormal, 'Usinas premium com o farol de monitoramento da SolarZ em Normal (conectadas e gerando).', { nota: `de ${inteiro(u.monitoradas)} monitoradas` }),
          posicao('farol-alerta', 'Farol Com alerta', 'qtd.', u.farolAlerta, 'Usinas premium com o farol da SolarZ em Com alerta.'),
          posicao('farol-critico', 'Farol Crítico', 'qtd.', u.farolCritico, 'Usinas premium com o farol da SolarZ em Crítico. Acima de zero, pede atenção.', { situacao: situacaoContagem(u.farolCritico, 'atencao') }),
          posicao('tickets', 'Tickets abertos', 'qtd.', u.tickets, 'Chamados abertos na SolarZ (carga diária).'),
        ],
      },
    ],
  }
}

// ---------- Homologação ----------
export function tabelaHomologacao(f: Fontes, hoje = hojeSP()): Tabela | null {
  const h = calcularHomologacao(f, hoje)
  if (!h) return null
  return {
    base: null,
    grupos: [
      {
        titulo: 'Projetos',
        linhas: [
          posicao('total', 'Projetos no total', 'qtd.', h.projetos.length, 'Todos os projetos da ICF no resumo da PIETA, em qualquer status.'),
          posicao('andamento', 'Em andamento', 'qtd.', h.ativos.length, 'Projetos da PIETA que não estão Finalizados nem Cancelados.'),
          comparada('finalizados', 'Finalizados no mês', 'qtd.', h.finMes, h.finAnt, 'maior-melhor', 'Projetos que chegaram a Finalizado neste mês (data da última mudança de status), contra o mesmo trecho do mês anterior.', { base: h.baseFin }),
        ],
      },
      {
        titulo: 'Prazos e pendências · posição de hoje',
        linhas: [
          posicao('vencidos', 'Prazo vencido', 'qtd.', h.vencidos.length, 'Projetos em andamento cujo prazo informado pela PIETA já passou. Acima de zero, pede atenção.', { situacao: situacaoContagem(h.vencidos.length, 'atencao'), nota: `de ${inteiro(h.comPrazo.length)} com prazo informado` }),
          posicao('pendencia', 'Em pendência', 'qtd.', h.pendencia.length, 'Projetos em andamento num status de pendência (assinaturas, distribuidora ou vistoria), à espera de uma ação.', { situacao: h.pendencia.length === 0 ? 'ok' : null }),
        ],
      },
      {
        titulo: 'Tempo · base detalhada',
        linhas: [
          posicao('desde-pagamento', 'Tempo médio desde o pagamento', 'dias', h.desdePagamento?.mediaDias ?? null, 'Média do tempo total do projeto na PIETA (contado desde o pagamento) nos projetos finalizados da base detalhada.', { nota: h.desdePagamento ? `${inteiro(h.desdePagamento.projetos)} finalizados` : undefined }),
          posicao('demorada', 'Etapa mais demorada', 'dias', h.demorada?.mediaDias ?? null, 'Etapa com a maior média de dias por projeto na base detalhada (só etapas com 2 projetos ou mais).', { nota: h.demorada ? `${h.demorada.etapa} · ${inteiro(h.demorada.projetos)} projetos` : undefined }),
          posicao('cobertura', 'Cobertura da base detalhada', '%', h.cobertura?.pct ?? null, 'Projetos com detalhe carregado ÷ projetos no resumo da PIETA. Os tempos acima valem para essa base; a carga é gradual.', { nota: h.cobertura ? `${inteiro(h.cobertura.armazenados)} de ${inteiro(h.cobertura.total)} projetos` : undefined }),
        ],
      },
    ],
  }
}
