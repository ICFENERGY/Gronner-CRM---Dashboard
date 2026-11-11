/**
 * Indicadores no formato do painel autônomo "Indicador Engenharia - Groner"
 * (public/indicadores/index.html), montados SÓ com o que já está gravado no Neon
 * (tabela "DASHBOARD-GRONNER-CRM"). Nada aqui chama o Groner.
 *
 * Três listas, cada uma no formato exato do arquivo que o painel usava:
 *   cards       -> docs/data_cards.json       (um item por projeto)
 *   eng_resumo  -> docs/data_eng_resumo.json  (projetos nos funis 08, 09, 10, 11, 13 e 14)
 *   sales       -> docs/data_sales.json       (um item por venda)
 * Campo que o Neon não tem sai null e é listado em LACUNAS.
 *
 * Privacidade: cep e logradouro da venda nunca saem (sempre null); `cliente` do
 * resumo da engenharia também não (o painel não usa).
 */
import { normalizarDataGroner } from './mappers.js'

const DIA_MS = 86400000

export const LACUNAS = {
  cards: [
    { campo: 'atraso', motivo: 'Prazo da etapa não é gravado pela sincronização; vem de server/data/sla-etapas.json (deduzido da exportação de 02/11/2026). Etapa sem prazo conhecido sai null.' },
    { campo: 'diasFluxo', motivo: 'Calculado de dataEntradaStatus (entrada no status atual). Sai null se o projeto não tiver essa data.' },
    { campo: 'valor', motivo: 'Valor da venda do card; sem venda, o da proposta aceita (mesma regra da Visão Geral); 0 quando não há nenhum.' },
    { campo: 'uf', motivo: 'Sai como sigla (SP), não por extenso ("São Paulo"); o painel aceita os dois.' },
  ],
  eng_resumo: [
    { campo: 'funil/etapa', motivo: 'O Neon guarda só o status principal do card; o Groner permite um status por funil. Cards de engenharia cujo status principal está em outro funil (ex.: 04) não aparecem até a sincronização guardar os status por funil (statusAtuaisComData).' },
    { campo: 'cliente', motivo: 'Não exposto (privacidade); o painel não usa.' },
    { campo: 'atraso', motivo: 'Mesmo prazo por etapa dos cards (1 = atrasado, 0 = no prazo, null = etapa sem prazo conhecido).' },
  ],
  sales: [
    { campo: 'idNegocio', motivo: 'A venda gravada não tem o projeto (projetoId). Passa a vir na próxima carga diária de vendas (mapVenda já guarda).' },
    { campo: 'tipoNegocio/etapaNegocio/statusNegocio', motivo: 'Vêm da proposta do projeto da venda (projetoTipo, etapaProjeto, statusProjeto); dependem de idNegocio.' },
    { campo: 'statusVenda', motivo: 'Status de aprovação da venda não é gravado (statusNome é outro campo: etapa operacional da venda).' },
    { campo: 'tipoVenda', motivo: 'Não gravado (vazio também na exportação).' },
    { campo: 'valorEntrada/valorFinanciado/valorPago/dataCadastro', motivo: 'Não gravados; entrada, financiamento e cadastro passam a vir na próxima carga diária de vendas. valorPago não tem campo conhecido na API.' },
    { campo: 'valorProduto/valorServico', motivo: 'Da venda quando gravado; senão da planilha server/data/sales-enriquecido.json.' },
    { campo: 'cep/logradouro', motivo: 'Descartados de propósito (endereço do cliente; o painel não usa).' },
    { campo: 'uf', motivo: 'Sai como sigla (SP).' },
  ],
}

/** Funis do resumo da engenharia e a grafia das etapas que o painel espera (mesma ordem do index.html). */
export const ENG_ETAPAS = {
  '08': ['Criar Projeto->Proposta', 'Aprovar Proposta Criada', 'Aprovacao Tecnica - Venda'],
  '09': ['Pedido a Pagar', 'Comp. Enviado ao Distribuidor', 'Pedido Faturado', 'Pedido em Rota de Entrega', 'Pedido Entregue'],
  '10': ['Pieta - Criacao do Projeto', 'Pendencia ICF', 'Pieta - Parecer Solicitado', 'Parecer Emitido', 'Aguardando Vistoria', 'Pendencia Vist. Concessionaria', 'Vistoria Aprovada', 'Fazer Compensacao', 'Relogio Trocado'],
  '11': ['Pendencia de Instalacao', 'Agendar Instalacao', 'Instalador Homologado', 'Instalacao Agendada', 'Diario de Obra / Obra Andamento', 'Pendencia de Obra', 'Instalacao Concluida', 'Instalacao App Monitoramento', 'Dossie', 'Termo de Aceite', 'Dossie Enviado', 'App Monitor Instalado'],
  '13': ['Area Projetos/Engenharia', 'Em Andamento', 'Suporte Cliente', 'Suporte Concluido'],
  '14': ['Relato da Pendencia', 'Orcamento Manutencao', 'Aguardo Aprovacao Cliente', 'Pos Venda Manutencao', 'Manutencao Concluida', 'Servico Descartado'],
  '18': ['Novo Instalador', 'Consulta Base Dados_ Prestador', 'Entrevista', 'Documentos Necessarios', 'Assinar Contrato (Instalador)', 'Aprovado', 'Reprovado'],
}

function semAcentos(value) {
  return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase()
}

/** Só letras e números: "PIETA_CRIACAO DO PROJETO" e "Pieta - Criacao do Projeto" ficam iguais. */
const compacto = (value) => semAcentos(value).replace(/[^A-Z0-9]/g, '')

function texto(value) {
  if (value == null || typeof value === 'object') return null
  const t = String(value).trim()
  return t === '' ? null : t
}

function numero(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'object') return null
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** "04. FUNIL DE VENDAS SOLAR 🏆" -> "04"; sem número, null. */
export function numeroFunil(funil) {
  const m = /^\s*(\d{1,2})\s*\./.exec(String(funil ?? ''))
  return m ? m[1].padStart(2, '0') : null
}

/** Chave da tabela de prazos: "<número do funil>|<etapa sem acento>" (funil sem número entra pelo nome). */
export function chaveEtapa(funil, etapa) {
  const e = semAcentos(etapa)
  if (!e) return null
  return `${numeroFunil(funil) ?? semAcentos(String(funil ?? '').replace(/[^\p{L}\p{N}\s.-]/gu, ''))}|${e}`
}

/** Data gravada (com -03:00 acrescentado pela sincronização) no formato da exportação, sem fuso. */
export function dataSemFuso(value) {
  const t = texto(value)
  if (!t) return null
  return t.replace(/(Z|[+-]\d{2}:\d{2})$/, '')
}

function instante(value) {
  const t = texto(value)
  if (!t) return null
  const ms = Date.parse(normalizarDataGroner(t))
  return Number.isFinite(ms) ? ms : null
}

/** Ano e mês da data como está escrita (horário de Brasília), sem passar por fuso. */
export function anoMes(value) {
  const m = /^(\d{4})-(\d{2})/.exec(texto(value) ?? '')
  return m ? { ano: Number(m[1]), mes: Number(m[2]) } : { ano: null, mes: null }
}

/** 2.98 dias -> "2d 23h 31m" (formato do tempoCard da exportação). */
export function formatarTempoCard(dias) {
  if (dias == null || !Number.isFinite(dias) || dias < 0) return null
  const totalMin = Math.floor(dias * 1440)
  return `${Math.floor(totalMin / 1440)}d ${Math.floor((totalMin % 1440) / 60)}h ${totalMin % 60}m`
}

/** Valor do card: o da venda; sem venda, o da proposta aceita; senão 0 (regra de src/features/painel/funis.ts). */
export function valorDoCard(p) {
  const venda = numero(p?.valorVenda)
  if (venda > 0) return venda
  const aceita = numero(p?.valorPrePropostaAceita)
  return aceita > 0 ? aceita : 0
}

function prazoDaEtapa(prazos, funil, etapa) {
  const v = prazos?.[chaveEtapa(funil, etapa)]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/**
 * Tempo e atraso de um funil do card, na regra do Groner (a etiqueta vermelha "+3d 1h 39m" do quadro):
 * dias desde a entrada na ETAPA menos o prazo da etapa. Os contadores do Groner (tempoMin/atrasoMin) medem o funil
 * inteiro e vêm zerados em parte dos cards, então só valem quando a data de entrada ou o prazo da etapa não existem.
 * @returns {{ dias: number|null, atraso: number|null }} atraso em dias (0 = no prazo); null = sem como calcular
 */
export function tempoDoFluxo(f, { agora = Date.now(), prazos = {} } = {}) {
  const desde = instante(f?.entradaEm)
  const prazo = prazoDaEtapa(prazos, f?.funil, f?.etapa)
  const diasContador = f?.tempoMin == null ? null : f.tempoMin / 1440
  const atrasoContador = f?.atrasoMin == null ? null : f.atrasoMin / 1440
  if (desde == null) return { dias: diasContador, atraso: atrasoContador }
  const dias = Math.max(0, (agora - desde) / DIA_MS)
  return { dias, atraso: prazo == null ? atrasoContador : Math.max(0, dias - prazo) }
}

function tempoNoStatus(p, agora) {
  const desde = instante(p.dataEntradaStatus)
  return desde == null ? null : Math.max(0, (agora - desde) / DIA_MS)
}

/** Projeto gravado no Neon -> item de data_cards.json. */
export function cardDoProjeto(p, { agora = Date.now(), prazos = {} } = {}) {
  const { ano, mes } = anoMes(p.dataInclusao)
  const diasFluxo = tempoNoStatus(p, agora)
  const prazo = prazoDaEtapa(prazos, p.funil, p.etapa)
  return {
    codigo: numero(p.id),
    funil: texto(p.funil),
    etapa: texto(p.etapa),
    nome: texto(p.nome),
    dataAbertura: dataSemFuso(p.dataInclusao),
    ano,
    mes,
    cidade: texto(p.cidade),
    uf: texto(p.estado),
    valor: valorDoCard(p),
    diasFluxo,
    atraso: diasFluxo == null || prazo == null ? null : Math.max(0, diasFluxo - prazo),
    dataAtualizacao: dataSemFuso(p.dataUltimaAtualizacao),
  }
}

/** Etapas que os funis de engenharia têm no Groner mas que a Engenharia não acompanha (o card segue na Visão Geral). */
const ETAPAS_FORA_DA_ENG = { '08': ['Proposta Criada Aprovada'] }

export function foraDaEngenharia(funilNumero, etapa) {
  const alvo = compacto(etapa)
  return (ETAPAS_FORA_DA_ENG[funilNumero] ?? []).some((e) => compacto(e) === alvo)
}

/** Grafia da etapa no painel da engenharia ("PIETA_CRIACAO DO PROJETO" -> "Pieta - Criacao do Projeto"). */
export function etapaEngenharia(funilNumero, etapa) {
  const alvo = compacto(etapa)
  return (ENG_ETAPAS[funilNumero] ?? []).find((e) => compacto(e) === alvo) ?? texto(etapa)
}

/** Projeto gravado no Neon -> item de data_eng_resumo.json, ou null se o status principal não é de engenharia. */
export function engResumoDoProjeto(p, { agora = Date.now(), prazos = {} } = {}) {
  return engResumosDoProjeto(p, { agora, prazos })[0] ?? null
}

/** Uma linha por funil de engenharia (08 a 14) em que o card está. */
export function engResumosDoProjeto(p, { agora = Date.now(), prazos = {} } = {}) {
  const fluxos = Array.isArray(p.fluxos) ? p.fluxos : []
  if (fluxos.length) {
    return fluxos.flatMap((f) => {
      const funil = numeroFunil(f.funil)
      if (!funil || !ENG_ETAPAS[funil] || foraDaEngenharia(funil, f.etapa)) return []
      const { dias, atraso } = tempoDoFluxo(f, { agora, prazos })
      return [{
        codigo: `#${p.id}`, funil, etapa: etapaEngenharia(funil, f.etapa), nome: texto(p.nome), cliente: null,
        valor: valorDoCard(p), atraso: atraso == null ? null : atraso > 0 ? 1 : 0,
        tempoCard: formatarTempoCard(dias), cidade: texto(p.cidade), uf: texto(p.estado),
      }]
    })
  }
  const unico = engResumoPrincipal(p, { agora, prazos })
  return unico ? [unico] : []
}

function engResumoPrincipal(p, { agora = Date.now(), prazos = {} } = {}) {
  const funil = numeroFunil(p.funil)
  if (!funil || !ENG_ETAPAS[funil] || foraDaEngenharia(funil, p.etapa)) return null
  const dias = tempoNoStatus(p, agora)
  const prazo = prazoDaEtapa(prazos, p.funil, p.etapa)
  return {
    codigo: `#${p.id}`,
    funil,
    etapa: etapaEngenharia(funil, p.etapa),
    nome: texto(p.nome),
    cliente: null,
    valor: valorDoCard(p),
    atraso: dias == null || prazo == null ? null : dias > prazo ? 1 : 0,
    tempoCard: formatarTempoCard(dias),
    cidade: texto(p.cidade),
    uf: texto(p.estado),
  }
}

/** Uma proposta por projeto: a aceita; senão a mais recente. */
export function propostaPorProjeto(propostas = []) {
  const mapa = new Map()
  for (const pp of propostas) {
    const id = numero(pp?.projetoId)
    if (id == null) continue
    const atual = mapa.get(id)
    const melhor = !atual
      || (pp.aceita && !atual.aceita)
      || (Boolean(pp.aceita) === Boolean(atual.aceita) && String(pp.dataInclusao ?? '') > String(atual.dataInclusao ?? ''))
    if (melhor) mapa.set(id, pp)
  }
  return mapa
}

/** Venda gravada no Neon -> item de data_sales.json (sem cep/logradouro). */
export function saleDaVenda(v, { propostas = new Map(), enriquecimento = {} } = {}) {
  const idNegocio = numero(v.idNegocio)
  const pp = idNegocio != null ? propostas.get(idNegocio) : null
  const enr = enriquecimento?.[String(v.id)] ?? {}
  const { ano, mes } = anoMes(v.dataVenda)
  return {
    codigo: numero(v.id),
    idNegocio,
    nome: texto(v.nome),
    vendedor: texto(v.vendedor),
    tipoNegocio: texto(v.tipoNegocio) ?? texto(pp?.projetoTipo),
    tipoVenda: texto(v.tipoVenda),
    statusVenda: texto(v.statusVenda),
    etapaNegocio: texto(pp?.etapaProjeto),
    statusNegocio: texto(pp?.statusProjeto),
    origemContato: texto(v.origemNome),
    cidade: texto(v.cidade),
    uf: texto(v.estado),
    cep: null,
    logradouro: null,
    valorTotal: numero(v.valorTotal) ?? 0,
    valorEntrada: numero(v.valorEntrada),
    valorFinanciado: numero(v.valorFinanciado),
    valorProduto: numero(v.valorProduto) ?? numero(enr.valorProduto),
    valorPago: numero(v.valorPago),
    valorServico: numero(v.valorServico) ?? numero(enr.valorServico),
    dataCadastro: dataSemFuso(v.dataCadastro),
    dataVenda: dataSemFuso(v.dataVenda),
    ano,
    mes,
  }
}

/** Uma linha por funil em que o card está (como a exportação); sem `fluxos` gravados, só o status principal. */
export function cardsDoProjeto(p, opcoes) {
  const base = cardDoProjeto(p, opcoes)
  const fluxos = Array.isArray(p.fluxos) ? p.fluxos : []
  if (!fluxos.length) return [base]
  return fluxos.map((f) => {
    // A regra da etapa vale só nos funis da Engenharia; nos demais segue o contador do Groner (ainda não conferido ali).
    const eng = Boolean(ENG_ETAPAS[numeroFunil(f.funil)])
    const { dias, atraso } = eng ? tempoDoFluxo(f, opcoes) : { dias: f.tempoMin == null ? null : f.tempoMin / 1440, atraso: f.atrasoMin == null ? null : f.atrasoMin / 1440 }
    return { ...base, funil: texto(f.funil), etapa: texto(f.etapa), diasFluxo: dias ?? base.diasFluxo, atraso: atraso ?? base.atraso }
  })
}

export function montarCards(projetos, opcoes) {
  return projetos.flatMap((p) => cardsDoProjeto(p, opcoes)).sort((a, b) => (b.codigo ?? 0) - (a.codigo ?? 0))
}

export function montarEngResumo(projetos, opcoes) {
  const ordem = ['08', '09', '10', '11', '13', '14', '18'] // Object.keys poria '10'..'14' antes de '08' (chaves numéricas)
  return projetos
    .flatMap((p) => engResumosDoProjeto(p, opcoes))
    .sort((a, b) => ordem.indexOf(a.funil) - ordem.indexOf(b.funil) || ENG_ETAPAS[a.funil].indexOf(a.etapa) - ENG_ETAPAS[b.funil].indexOf(b.etapa))
}

export function montarSales(vendas, { propostas = [], enriquecimento = {} } = {}) {
  const porProjeto = propostaPorProjeto(propostas)
  return vendas.map((v) => saleDaVenda(v, { propostas: porProjeto, enriquecimento })).sort((a, b) => (a.codigo ?? 0) - (b.codigo ?? 0))
}

// ─── Metas por vendedor ──────────────────────────────────────────────────────

/** Mesmo slug do index.html (slugifyVendedor). */
export function slugVendedor(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'sem_nome'
}

export const ID_META = /^[a-z0-9_]{1,150}_(\d{4})$/

/**
 * Valida a meta enviada pelo painel. `vendedores` = nomes que existem nas vendas:
 * a rota é pública, então só aceita vendedor conhecido (limita o que pode ser gravado).
 */
export function validarMeta(id, corpo, vendedores = []) {
  const erro = (m) => Object.assign(new Error(m), { status: 400 })
  const m = ID_META.exec(String(id ?? ''))
  if (!m) throw erro('Identificador de meta inválido')
  const vendedor = texto(corpo?.vendedor)
  if (!vendedor || vendedor.length > 120) throw erro('Vendedor inválido')
  if (!vendedores.includes(vendedor)) throw erro('Vendedor não encontrado nas vendas')
  const ano = Number(corpo?.ano)
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100 || String(ano) !== m[1]) throw erro('Ano inválido')
  if (`${slugVendedor(vendedor)}_${ano}` !== id) throw erro('Identificador não corresponde ao vendedor e ano')
  const meses = (lista, nome) => {
    if (!Array.isArray(lista) || lista.length !== 12) throw erro(`${nome} precisa de 12 meses`)
    return lista.map((v) => {
      const n = Number(v ?? 0)
      if (!Number.isFinite(n) || n < 0 || n > 1e10) throw erro(`${nome} com valor inválido`)
      return n
    })
  }
  return {
    vendedor,
    ano,
    valorMinimo: meses(corpo.valorMinimo, 'valorMinimo'),
    valorPrevisto: meses(corpo.valorPrevisto, 'valorPrevisto'),
    updatedAt: Date.now(),
  }
}
