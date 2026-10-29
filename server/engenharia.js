/**
 * Visão da Engenharia (Pauta Diária + Painel), calculada a partir dos
 * projetos já normalizados por `mapProjeto`. Funções puras: recebem os dados
 * e a data de referência, não fazem I/O.
 *
 * Regras herdadas da Pauta Diária (HTML do Fabio):
 * - Atrasado: passou do prazo do marco, a obra passou da meta de entrega, ou
 *   a ação combinada na reunião venceu.
 * - Em risco: nos últimos 30% do prazo do marco, projeção de entrega acima da
 *   meta, ou ação vencendo hoje/amanhã.
 * - Projeção de entrega: dias desde a venda + o que falta do marco atual + os
 *   prazos dos marcos seguintes até a troca do relógio (marco 12).
 */
import { LIMITES_PARADO, MARCOS, META_ENTREGA_PADRAO, MOMENTOS, estaFinalizadoNaInstalacao, momentoDoMarco } from '../shared/engenharia.js'
import { marcoDoStatus, nomeDePessoa, normalizarDataGroner } from './mappers.js'

const DIA = 86_400_000
const MAX_DIAS_NO_MARCO = 3650
const RANK = { ok: 0, risco: 1, atrasado: 2 }
const MK = Object.fromEntries(MARCOS.map((m, i) => [m.k, { ...m, i }]))
/** Marcos que entram na conta de entrega (venda → relógio), sem a trilha paralela. */
const SEQ_ENTREGA = MARCOS.filter((m) => (m.mom === 'imp' || m.k === 'G6') && !m.paralelo)

/** Data AAAA-MM-DD no fuso de São Paulo. */
export function hojeSP(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora)
}

function ts(value) {
  if (!value) return NaN
  const texto = String(value)
  return Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(texto) ? `${texto}T12:00:00-03:00` : normalizarDataGroner(texto))
}

function diasEntre(fim, inicio) {
  const a = ts(fim)
  const b = ts(inicio)
  return Number.isFinite(a) && Number.isFinite(b) ? Math.floor((a - b) / DIA) : null
}

const pior = (...estados) => estados.reduce((w, x) => (RANK[x] > RANK[w] ? x : w), 'ok')
const mediana = (xs) => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b)
  if (!v.length) return null
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}
const pct = (n, d) => (d ? Math.round((100 * n) / d) : 0)
const preenchido = (v) => v != null && v !== '' && !(typeof v === 'number' && Number.isNaN(v))

/** Prazos em vigor: o salvo na configuração ou a proposta inicial do modelo. */
export function prazosEfetivos(config) {
  const sla = Object.fromEntries(MARCOS.map((m) => [m.k, Number(config?.sla?.[m.k]) > 0 ? Number(config.sla[m.k]) : m.sla]))
  const metaEntrega = Number(config?.metaEntrega) > 0 ? Number(config.metaEntrega) : META_ENTREGA_PADRAO
  return { sla, metaEntrega }
}

/**
 * Entrada no marco atual. Usa o histórico de status gravado pela
 * sincronização: volta enquanto os status continuam no mesmo marco. Sem uma
 * transição vinda de outro marco, a data é estimada pela do último status.
 */
export function entradaNoMarco(projeto, hoje = hojeSP()) {
  const marco = projeto.marco
  const historico = Array.isArray(projeto.historicoStatus) ? projeto.historicoStatus : []
  const valida = dataDeEntradaValida(projeto, hoje)
  let desde = null
  let exato = false
  for (let i = historico.length - 1; i >= 0; i--) {
    const mov = historico[i]
    if (marcoDoStatus(mov.statusNovo) !== marco) break
    desde = mov.em
    if (marcoDoStatus(mov.statusAnterior) !== marco) { exato = true; break }
  }
  if (exato && valida(desde)) return { desde, estimado: false }
  // Sem transição exata: a melhor data válida, na ordem de confiança.
  const candidata = [projeto.dataUltimoStatus, projeto.dataEntradaStatus, projeto.dataUltimaAtualizacao, projeto.dataInclusao].find(valida)
  return { desde: candidata ?? null, estimado: true }
}

/**
 * Data de entrada utilizável: data de verdade (não 0001-01-01 nem ano < 1950),
 * não posterior a amanhã e não anterior ao cadastro do projeto (1 dia de folga
 * para fuso). Sem cadastro válido, só as duas primeiras regras valem.
 */
function dataDeEntradaValida(projeto, hoje) {
  const cadastro = ts(projeto.dataInclusao)
  const limiteCadastro = Number.isFinite(cadastro) && new Date(cadastro).getUTCFullYear() >= 1950 ? cadastro - DIA : -Infinity
  const limiteFuturo = ts(hoje) + DIA
  return (valor) => {
    const t = ts(valor)
    return Number.isFinite(t) && new Date(t).getUTCFullYear() >= 1950 && t >= limiteCadastro && !(t > limiteFuturo)
  }
}

/** Passagens pelos marcos, a partir do histórico (mais recente primeiro). */
function passagens(projeto) {
  const historico = Array.isArray(projeto.historicoStatus) ? projeto.historicoStatus : []
  const out = []
  for (let i = 0; i < historico.length; i++) {
    const mov = historico[i]
    const de = marcoDoStatus(mov.statusAnterior)
    const para = marcoDoStatus(mov.statusNovo)
    if (de === para) continue
    out.push({ de: de ?? null, para: para ?? null, statusNovo: mov.statusNovo, em: mov.em })
  }
  return out.reverse().slice(0, 16)
}

export function classificarCard(projeto, { prazos, acao, hoje }) {
  const m = MK[projeto.marco]
  const { desde, estimado } = entradaNoMarco(projeto, hoje)
  const diasBrutos = diasEntre(hoje, desde)
  // Sem data válida conta 0 (não vira atrasado só por falta de data); nunca negativo nem mais de 10 anos.
  const dias = Math.min(MAX_DIAS_NO_MARCO, Math.max(0, diasBrutos ?? 0))
  const L = prazos.sla[projeto.marco] ?? 7
  const margem = Math.max(1, Math.round(L * 0.3))
  const motivos = []
  // Sem data de entrada válida, não dá para medir o tempo no marco: avisa em vez de parecer recém-chegado.
  if (diasBrutos == null) motivos.push('Sem data de entrada no marco no Groner')

  let sMarco = 'ok'
  if (dias > L) { sMarco = 'atrasado'; motivos.push(`${dias} dias no marco, prazo ${L}`) } else if (dias >= L - margem) { sMarco = 'risco'; motivos.push(`${dias} de ${L} dias no marco`) }

  let sEntrega = 'ok'
  let diasDesdeVenda = null
  let projecao = null
  if (projeto.dataVenda && m && (m.mom === 'imp' || m.k === 'G6')) {
    diasDesdeVenda = Math.max(0, diasEntre(hoje, projeto.dataVenda) ?? 0)
    // Marco paralelo (kit) não está na sequência: conta a partir do marco seguinte a ele no fluxo.
    let idx = SEQ_ENTREGA.findIndex((x) => x.k === projeto.marco)
    if (idx < 0) idx = SEQ_ENTREGA.findIndex((x) => MK[x.k].i > m.i) - 1
    const resto = Math.max(0, L - dias) + SEQ_ENTREGA.slice(idx + 1).reduce((a, x) => a + (prazos.sla[x.k] ?? x.sla), 0)
    projecao = diasDesdeVenda + resto
    if (diasDesdeVenda > prazos.metaEntrega) { sEntrega = 'atrasado'; motivos.push(`Entrega: dia ${diasDesdeVenda} desde a venda, meta ${prazos.metaEntrega}`) } else if (projecao > prazos.metaEntrega) { sEntrega = 'risco'; motivos.push(`Projeção de entrega no dia ${projecao}, meta ${prazos.metaEntrega}`) }
  }

  let sAcao = 'ok'
  const plano = acao && !acao.feita ? acao : null
  if (plano?.prazo) {
    const faltam = diasEntre(plano.prazo, hoje)
    if (faltam != null && faltam < 0) { sAcao = 'atrasado'; motivos.unshift(`Ação combinada venceu em ${plano.prazo.slice(8, 10)}/${plano.prazo.slice(5, 7)}`) } else if (faltam != null && faltam <= 1) { sAcao = 'risco'; motivos.push(`Ação combinada vence ${faltam === 0 ? 'hoje' : 'amanhã'}`) }
  }

  return {
    id: projeto.id,
    marco: projeto.marco,
    momento: momentoDoMarco(projeto.marco),
    status: projeto.etapa,
    funil: projeto.funil,
    cidade: projeto.cidade ?? null,
    estado: projeto.estado ?? null,
    concessionaria: projeto.concessionaria ?? null,
    kwp: projeto.kwp ?? null,
    dono: projeto.donoNominal ?? null,
    vendedor: nomeDePessoa(projeto.vendedorResponsavel),
    dataVenda: projeto.dataVenda ?? null,
    dataUltimaAtualizacao: projeto.dataUltimaAtualizacao ?? null,
    diasSemAtualizacao: projeto.diasSemAtualizacao ?? null,
    desde,
    estimado,
    dias,
    prazo: L,
    diasDesdeVenda,
    projecao,
    cor: pior(sMarco, sEntrega, sAcao),
    motivos,
    acao: plano,
    acaoAnterior: acao?.feita ? acao : null,
    acaoVencida: sAcao === 'atrasado',
    semDono: !projeto.donoNominal,
    passagens: passagens(projeto),
  }
}

/** Ordem da pauta: ação vencida, atrasado sem plano, atrasado com plano, resto; depois o mais estourado. */
export function prioridade(card) {
  const grupo = card.acaoVencida ? 0 : card.cor === 'atrasado' && !card.acao ? 1 : card.cor === 'atrasado' ? 2 : 3
  return grupo * 1e5 - (card.dias - card.prazo) * 10 - (card.kwp || 0) / 100
}

function semaforoParado(dias) {
  if (dias == null) return 'vermelho'
  if (dias <= LIMITES_PARADO.verde) return 'verde'
  if (dias <= LIMITES_PARADO.amarelo) return 'amarelo'
  return 'vermelho'
}

const CAMPOS_PREENCHIMENTO = [
  ['dataVenda', 'Data da venda', 'cheio'], ['dataAceiteProposta', 'Data de aceite da proposta', 'cheio'],
  ['previsaoFechamento', 'Previsão de fechamento', 'cheio'], ['kwp', 'Potência (kWp)', 'cheio'],
  ['geracaoMensalPrevista', 'Geração prevista mensal', 'cheio'], ['valorPrePropostaAceita', 'Valor da proposta aceita', 'cheio'],
  ['concessionaria', 'Concessionária', 'cheio'], ['uc', 'Código da UC', 'cheio'], ['tipoTelhado', 'Tipo de telhado', 'cheio'],
  ['faseEnergetica', 'Fase energética', 'cheio'], ['tipoEdificacao', 'Tipo de edificação', 'cheio'],
  ['tecnico', 'Técnico', 'vazio'], ['projetista', 'Projetista', 'vazio'], ['homologador', 'Homologador', 'vazio'],
  ['dataInicioInstalacao', 'Início da instalação', 'vazio'], ['dataTerminoInstalacao', 'Término da instalação', 'vazio'],
  ['dataAssinaturaContrato', 'Assinatura do contrato', 'vazio'], ['urlMonitoramento', 'URL do monitoramento', 'vazio'],
  ['modeloMonitoramento', 'Modelo do monitoramento', 'vazio'], ['dataTerminoGarantia', 'Fim da garantia da instalação', 'vazio'],
]

/** Indicadores do Painel da Engenharia, calculados ao vivo. */
export function montarPainel(universo, todos, hoje) {
  const ativos = universo.filter((p) => p.marco !== 'FIM')
  const encerrados = universo.length - ativos.length
  const historico = todos.filter((p) => /^06\./.test(p.funil ?? '') && /VENDA REALIZADA/i.test(p.etapa ?? '')).length
  const soma = (xs, f) => Math.round(xs.reduce((a, x) => a + (Number(f(x)) || 0), 0) * 10) / 10
  const porMomento = Object.fromEntries(Object.keys(MOMENTOS).map((k) => {
    const g = ativos.filter((p) => momentoDoMarco(p.marco) === k)
    return [k, { n: g.length, kwp: soma(g, (p) => p.kwp) }]
  }))

  const cores = ativos.map((p) => semaforoParado(p.diasSemAtualizacao))
  const vermelho = cores.filter((c) => c === 'vermelho').length
  const amarelo = cores.filter((c) => c === 'amarelo').length

  const fluxo = MARCOS.map((m) => {
    const g = ativos.filter((p) => p.marco === m.k)
    const c = g.map((p) => semaforoParado(p.diasSemAtualizacao))
    const status = {}
    g.forEach((p) => { status[p.etapa] = (status[p.etapa] || 0) + 1 })
    return { marco: m.k, nome: m.nome, momento: m.mom, verde: c.filter((x) => x === 'verde').length, amarelo: c.filter((x) => x === 'amarelo').length, vermelho: c.filter((x) => x === 'vermelho').length, kwp: soma(g, (p) => p.kwp), diasMediana: mediana(g.map((p) => p.diasSemAtualizacao)), status }
  })

  const fila = ativos.filter((p) => ['1', '2', '3'].includes(p.marco))
  const comProposta = universo.filter((p) => Number(p.qtdPrePropostas) >= 1)
  const obras = ativos.filter((p) => momentoDoMarco(p.marco) === 'imp' && p.dataVenda)
  // Finalizados do Funil 11 viram FIM, mas posRelogio/monitoradas usam o marco ORIGINAL (ex.: "INSTALAÇÃO APP MONITORAMENTO" é o 13, ainda sem monitoramento).
  const marcoReal = (p) => p.marcoOriginal ?? p.marco
  const posRelogio = universo.filter((p) => ['13', '14', '15', '16', 'FIM'].includes(marcoReal(p)))
  const monitoradas = posRelogio.filter((p) => marcoReal(p) !== '13')
  const usinas = posRelogio
  const comDono = ativos.filter((p) => p.donoNominal)
  const prazoFuturo = ativos.filter((p) => p.previsaoFechamento && diasEntre(p.previsaoFechamento, hoje) >= 0)
  const prazoVencido = ativos.filter((p) => p.previsaoFechamento && diasEntre(p.previsaoFechamento, hoje) < 0)
  const gestaoCompleta = ativos.filter((p) => p.donoNominal && p.previsaoFechamento && diasEntre(p.previsaoFechamento, hoje) >= 0)

  const homolog = ativos.filter((p) => ['5', '6', '7', '9', '10', '11', '12'].includes(p.marco))
  const conc = {}
  homolog.forEach((p) => { const n = p.concessionaria || 'Não informada'; conc[n] = (conc[n] || 0) + 1 })

  const meses = []
  const [ano, mes] = hoje.split('-').map(Number)
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(ano, mes - 1 - i, 1))
    meses.push(d.toISOString().slice(0, 7))
  }
  const vendas = meses.map((m) => {
    const g = universo.filter((p) => String(p.dataVenda ?? '').slice(0, 7) === m)
    return { mes: m, n: g.length, kwp: soma(g, (p) => p.kwp) }
  })
  // Encerrados (FIM) por mês da última mudança de status no Groner: a data em que o card saiu do fluxo.
  const dataConclusao = (p) => String(p.dataUltimoStatus ?? p.dataUltimaAtualizacao ?? '').slice(0, 7)
  const encerradosLista = universo.filter((p) => p.marco === 'FIM')
  const concluidosPorMes = meses.map((m) => ({ mes: m, n: encerradosLista.filter((p) => dataConclusao(p) === m).length }))

  return {
    ativos: ativos.length,
    encerrados,
    historicoContrato: historico,
    universo: universo.length,
    kwpAtivo: soma(ativos, (p) => p.kwp),
    valorAtivo: soma(ativos, (p) => p.valorPrePropostaAceita),
    porMomento,
    parados: { vermelho, amarelo, verde: ativos.length - vermelho - amarelo, pct: pct(vermelho, ativos.length) },
    fila: { n: fila.length, pendenciaTecnica: fila.filter((p) => /PEND/i.test(p.etapa ?? '')).length, maisAntigo: Math.max(0, ...fila.map((p) => p.diasSemAtualizacao ?? 0)) },
    retrabalho: { pct: pct(comProposta.filter((p) => Number(p.qtdPrePropostas) > 1).length, comProposta.length), base: comProposta.length },
    obra: { idadeMediana: mediana(obras.map((p) => diasEntre(hoje, p.dataVenda))), n: obras.length },
    monitoramento: { pct: pct(monitoradas.length, posRelogio.length), base: posRelogio.length, relogioSemMonitoramento: posRelogio.length - monitoradas.length },
    usina: { geracaoPrevistaPct: pct(usinas.filter((p) => preenchido(p.geracaoMensalPrevista)).length, usinas.length), ucPct: pct(usinas.filter((p) => preenchido(p.uc)).length, usinas.length), geracaoPrevistaMWh: Math.round(soma(usinas, (p) => p.geracaoMensalPrevista) / 100) / 10 },
    gestao: { completaPct: pct(gestaoCompleta.length, ativos.length), donoPct: pct(comDono.length, ativos.length), prazoFuturoPct: pct(prazoFuturo.length, ativos.length), prazoVencido: prazoVencido.length, semPrazo: ativos.filter((p) => !p.previsaoFechamento).length, semDono: ativos.length - comDono.length },
    fluxo,
    concessionarias: Object.entries(conc).map(([nome, n]) => ({ nome, n })).sort((a, b) => b.n - a.n).slice(0, 10),
    homologacao: homolog.length,
    vendas,
    concluidosPorMes,
    preenchimento: CAMPOS_PREENCHIMENTO.map(([campo, rotulo, grupo]) => ({ campo, rotulo, grupo, pct: pct(universo.filter((p) => preenchido(p[campo])).length, universo.length) })),
  }
}

/**
 * Completa kWp, geração prevista e valor com a proposta aceita do projeto
 * (PreProposta ligada por projetoId) quando o projeto não traz esses campos.
 * Com mais de uma aceita, vale a alterada por último.
 */
export function completarComPropostas(projetos, propostas = []) {
  const quando = (pp) => {
    const t = ts(pp.dataAlteracao ?? pp.dataInclusao)
    return Number.isFinite(t) ? t : -Infinity
  }
  const aceitas = new Map()
  for (const pp of propostas) {
    if (!pp?.aceita || pp.projetoId == null) continue
    const chave = String(pp.projetoId)
    const atual = aceitas.get(chave)
    if (!atual || quando(pp) > quando(atual)) aceitas.set(chave, pp)
  }
  return projetos.map((p) => {
    const pp = aceitas.get(String(p.id))
    if (!pp) return p
    return {
      ...p,
      kwp: p.kwp ?? pp.kwP ?? null,
      geracaoMensalPrevista: p.geracaoMensalPrevista ?? (Number(pp.geracaoAnual) > 0 ? Math.round(Number(pp.geracaoAnual) / 12) : null),
      valorPrePropostaAceita: p.valorPrePropostaAceita || pp.preco || null,
    }
  })
}

/**
 * Monta a resposta de GET /api/engenharia.
 * @param projetos todos os projetos normalizados (com histórico, se houver)
 * @param acoes mapa id do card → ação combinada
 * @param config prazos salvos ({ sla, metaEntrega, em, por })
 */
export function montarEngenharia({ projetos: brutos, propostas = [], acoes = {}, config = null, agora = new Date(), fonte = null }) {
  const hoje = hojeSP(agora)
  const prazos = prazosEfetivos(config)
  const projetos = completarComPropostas(brutos, propostas)
  // Funil 11 com status já entregue (ver STATUS_FINALIZADOS_INSTALACAO): finalizado, tratado como FIM.
  const universo = projetos
    .filter((p) => p.noFluxoEngenharia && p.marco)
    .map((p) => (estaFinalizadoNaInstalacao(p.funil, p.etapa) ? { ...p, marcoOriginal: p.marco, finalizado: true, marco: 'FIM', momento: 'encerrado' } : p))
  const cards = universo
    .filter((p) => p.marco !== 'FIM' && MK[p.marco])
    .map((p) => classificarCard(p, { prazos, acao: acoes[String(p.id)], hoje }))
    .sort((a, b) => prioridade(a) - prioridade(b))

  return {
    geradoEm: agora.toISOString(),
    hoje,
    fonte,
    prazos: { ...prazos, salvoEm: config?.em ?? null, proposta: !config },
    cards,
    painel: montarPainel(universo, projetos, hoje),
  }
}
