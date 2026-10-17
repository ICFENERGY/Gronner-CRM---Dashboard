/**
 * Exportação "Deals" do Groner (xlsx, aba "Deals", 71 colunas) sob demanda.
 *
 * Este módulo é puro: nada de rede, variável de ambiente ou Express. O cliente
 * do Groner entra por parâmetro (`get(recurso, params)`), o que permite testar
 * sem rede. Contém:
 *   - montarLinha: item da listagem + detalhe -> linha das 71 colunas;
 *   - gerarDeals: lista, filtra, busca o detalhe só dos selecionados e monta;
 *   - gerarXlsx: escreve o arquivo;
 *   - assinarLink / verificarLink: link de download temporário (HMAC-SHA256).
 *
 * A planilha traz dados de contato (e-mail, celular, documento). Por isso o
 * conteúdo nunca é devolvido ao modelo nem registrado em log: o modelo só
 * recebe o link, que é assinado e expira.
 */
import crypto from 'node:crypto'

/** Cabeçalho exato do Deals exportado pelo Groner (71 colunas, na ordem). */
export const COLUNAS = [
  'Código', 'Consumo', 'Tipo', 'Etapa', 'Status', 'Vendedor', 'Loja', 'CEP', 'Nome', 'Contato',
  'Contato E-mail', 'Contato Celular', 'Contato Data de Nascimento', 'Contato Origem',
  'Proposta Aceita Potência', 'Proposta Aceita Geração mensal', 'Proposta Aceita Geração anual',
  'Proposta Aceita Quantidade Placa', 'Proposta Aceita Eficiência Economia', 'Proposta Aceita Economia Anual',
  'Proposta Aceita Economia Mensal', 'Proposta Aceita Incidência Solar', 'Proposta Aceita Peso Total',
  'Proposta Aceita Área Ocupada', 'Proposta Aceita Ano ROI', 'Proposta Aceita Valor kWh',
  'Proposta Aceita Código da Configuração de Dimensionamento', 'Proposta Aceita Valor',
  'Tipo de Telhado', 'Concessionária', 'Data de cadastro', 'Data da venda',
  'Data de término da garantia da instalação', 'Data de início da instalação', 'Data de término da instalação',
  'Data de atualização', 'Logradouro', 'Número', 'Bairro', 'Estado', 'Cidade',
  'URL do monitoramento', 'Modelo do monitoramento', 'Senha do monitoramento',
  'Data de aceite da proposta', 'Previsão de fechamento', 'Última nota', 'Primeira nota',
  'Banco 1', 'Banco 2', 'Valor da renda mensal', 'Valor do patrimônio', 'Qualificação', 'Etiquetas',
  'Quantidade de Vendas', 'Quantidade de propostas', 'Técnico', 'Pré-vendedor', 'Campanha',
  'Conjunto de anúncios', 'Anúncio', 'Contato indicado por', 'Tipo de Contato', 'Documento do Contato',
  'WhatsApp Lid', 'Data de Assinatura do Contrato', 'Fase energética', 'Tipo de Edificação',
  'Homologador', 'Projetista', 'Código da unidade consumidora',
]

/** Colunas de data/hora (as demais datas são só dia). */
const COLUNAS_DATA_HORA = new Set([
  'Data de cadastro', 'Data de atualização', 'Data de aceite da proposta',
])
const COLUNAS_DATA = new Set([
  'Contato Data de Nascimento', 'Data da venda', 'Data de término da garantia da instalação',
  'Data de início da instalação', 'Data de término da instalação', 'Previsão de fechamento',
  'Data de Assinatura do Contrato',
])
const COLUNAS_TEXTO = new Set(['CEP', 'Número'])

export const LIMITE_MAXIMO = 400
export const VALIDADE_LINK_SEGUNDOS = 15 * 60
const TEMPO_MAXIMO_MS = 50_000
const PARALELISMO = 10
const TAMANHO_PAGINA = 100
const PAGINAS_EM_PARALELO = 4
const LIMITE_FALHAS_ABSOLUTO = 20 // mais cards sem detalhe que isto: recusa o arquivo
const LIMITE_FALHAS_PROPORCAO = 0.1 // ou mais de 10% dos cards
const MAX_PAGINAS_SEM_CARDS = 60 // a listagem tem 20 itens por página (~294 páginas no total)

// ─── Conversões ──────────────────────────────────────────────────────────────

/**
 * Data do Groner (horário de Brasília, sem offset) -> Date que carrega a
 * "hora de parede" em UTC, para o Excel mostrar exatamente o mesmo horário.
 * Anos 0001 e 1901 (e anteriores a 1950) significam vazio.
 */
export function converterData(valor) {
  if (!valor) return null
  const m = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?)?/)
  if (!m) return null
  const [, a, mes, d, h = '0', mi = '0', s = '0', frac = '0'] = m
  if (Number(a) < 1950) return null
  // O export do Groner arredonda os segundos (".72" vira o segundo seguinte).
  const data = new Date(Date.UTC(Number(a), Number(mes) - 1, Number(d), Number(h), Number(mi), Number(s) + Math.round(Number(frac))))
  return Number.isNaN(data.getTime()) ? null : data
}

function numero(v) {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function texto(v) {
  if (v === null || v === undefined) return null
  const t = String(v).trim()
  return t === '' ? null : t
}

/** Responsável "Sem Técnico"/"Sem Projetista" (id 0) conta como vazio. */
function responsavel(nome, id) {
  const t = texto(nome)
  if (!t) return null
  if (id === 0 || id === '0') return null
  if (/^sem\s/i.test(t) && (id === undefined || id === null)) return null
  return t
}

function nomeDe(v) {
  if (v && typeof v === 'object') return texto(v.nome)
  return texto(v)
}

function primeiro(...valores) {
  for (const v of valores) if (v !== null && v !== undefined && v !== '') return v
  return null
}

/** Nomes das etiquetas em ordem alfabética, como no export (mantém espaços do cadastro). */
function etiquetas(...fontes) {
  const fonte = fontes.find((f) => Array.isArray(f) && f.length) ?? []
  const nomes = fonte.map((e) => e?.nome ?? e?.etiqueta?.nome).filter((n) => typeof n === 'string' && n.trim() !== '')
  nomes.sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }))
  return nomes.length ? nomes.join(', ') : 'Sem etiquetas'
}

/**
 * O detalhe nem sempre traz `vendas`; card com data de venda válida conta pelo
 * menos 1 (critério observado no export do Groner).
 */
function quantidadeVendas(lista, det) {
  const n = Array.isArray(det.vendas) ? det.vendas.length : 0
  return n === 0 && converterData(lista.dataVenda) ? 1 : n
}

// ─── Linha das 71 colunas ────────────────────────────────────────────────────

/**
 * Monta a linha a partir do item da listagem (`lista`) e do detalhe
 * (`GET /Projeto/{id}`). Devolve um array com 71 valores na ordem de COLUNAS
 * (string, número, Date ou null).
 *
 * Correção deliberada em relação ao export do Groner, que tem colunas
 * deslocadas: "Área Ocupada" trazia o peso e "Ano ROI" trazia a área. Aqui
 * Peso Total = pesoTotal, Área Ocupada = areaMinima e Ano ROI = ano de retorno.
 */
export function montarLinha(lista = {}, det = {}) {
  const lead = det.lead ?? {}
  const end = det.endereco ?? lead.endereco ?? {}
  const aceita = det.prePropostaAceita ?? null
  const sim = aceita?.preProposta?.simulacao ?? null
  const status = det.status ?? {}

  const v = {
    'Código': numero(primeiro(lista.id, det.id)),
    // O export usa o consumo total (lista.consumo); det.consumo pode vir dividido.
    'Consumo': numero(primeiro(lista.consumo, det.consumoTotal, det.consumo)),
    'Tipo': nomeDe(primeiro(det.tipo, lista.tipo)),
    'Etapa': texto(primeiro(status.etapa?.nome, lista.etapa)),
    'Status': texto(primeiro(status.nome, lista.status?.nome, lista.statusnome)),
    'Vendedor': responsavel(primeiro(det.vendedorResponsavel?.nome, lista.vendedorResponsavel), lista.vendedorResponsavelId),
    'Loja': texto(primeiro(lead.loja?.nome, lista.lojaNome, lead.responsavel?.loja?.nome, det.vendedorResponsavel?.loja?.nome)),
    'CEP': texto(primeiro(end.cep, lead.endereco?.cep)),
    'Nome': texto(primeiro(det.nome, lista.nome)),
    'Contato': texto(primeiro(lead.nome, lista.nome)),
    'Contato E-mail': texto(lead.email),
    'Contato Celular': texto(primeiro(lead.celular, lead.celularTratado)),
    'Contato Data de Nascimento': converterData(primeiro(lead.dataNascimento, lista.dataNascimento)),
    'Contato Origem': texto(primeiro(lead.origem?.nome, lista.origemLead?.nome)),
    'Proposta Aceita Potência': numero(sim?.kwP),
    'Proposta Aceita Geração mensal': numero(sim?.geracaoMensal),
    'Proposta Aceita Geração anual': numero(sim?.geracaoAnual),
    'Proposta Aceita Quantidade Placa': numero(sim?.quantidadePlacas),
    'Proposta Aceita Eficiência Economia': numero(sim?.porcentagemEficiencia),
    'Proposta Aceita Economia Anual': numero(sim?.contaEconomiaAno),
    'Proposta Aceita Economia Mensal': numero(sim?.contaEconomiaMes),
    'Proposta Aceita Incidência Solar': numero(sim?.radiacaoSolar),
    'Proposta Aceita Peso Total': numero(sim?.pesoTotal),
    'Proposta Aceita Área Ocupada': numero(sim?.areaMinima),
    'Proposta Aceita Ano ROI': numero(sim?.anoRetornoInvestimento),
    'Proposta Aceita Valor kWh': numero(sim?.valorDokWh),
    'Proposta Aceita Código da Configuração de Dimensionamento': numero(sim?.configuracaoId),
    'Proposta Aceita Valor': numero(primeiro(sim?.preco, aceita?.valorTotal)),
    'Tipo de Telhado': nomeDe(det.tipoTelhado),
    'Concessionária': nomeDe(det.concessionaria),
    'Data de cadastro': converterData(primeiro(det.dataInclusao, lead.dataInclusao, lista.dataInclusao)),
    'Data da venda': converterData(lista.dataVenda),
    'Data de término da garantia da instalação': null,
    'Data de início da instalação': null,
    'Data de término da instalação': null,
    'Data de atualização': converterData(primeiro(lista.dataUltimaAtualizacao, det.dataAlteracao)),
    'Logradouro': texto(end.logradouro),
    'Número': texto(end.numero),
    'Bairro': texto(end.bairro),
    'Estado': texto(end.uf),
    'Cidade': texto(primeiro(end.cidade, lista.cidade)),
    'URL do monitoramento': null,
    'Modelo do monitoramento': null,
    'Senha do monitoramento': null,
    'Data de aceite da proposta': converterData(aceita?.dataInclusao),
    'Previsão de fechamento': converterData(primeiro(aceita?.previsaoFechamento, lista.previsaoFechamento)),
    'Última nota': null,
    'Primeira nota': null,
    'Banco 1': texto(lead.banco1Nome),
    'Banco 2': texto(lead.banco2Nome),
    'Valor da renda mensal': numero(lead.valorRendaMensal) ?? 0,
    'Valor do patrimônio': numero(lead.valorPatrimonio) ?? 0,
    'Qualificação': numero(primeiro(det.qualificacao, lista.qualificacao)) ?? 0,
    'Etiquetas': etiquetas(lista.etiquetas, det.etiquetas),
    'Quantidade de Vendas': quantidadeVendas(lista, det),
    'Quantidade de propostas': numero(primeiro(lista.qtdPrePropostas, Array.isArray(det.prePropostas) ? det.prePropostas.length : null)) ?? 0,
    'Técnico': responsavel(lista.tecnicoResponsavel, lista.tecnicoResponsavelId),
    'Pré-vendedor': responsavel(lista.preVendedor, lista.preVendedorId),
    'Campanha': texto(lead.campanha),
    'Conjunto de anúncios': texto(lead.conjuntoAnuncios),
    'Anúncio': texto(primeiro(lead.anuncio, lead.anuncioUrl)),
    'Contato indicado por': texto(lead.indicador),
    'Tipo de Contato': texto(primeiro(lista.tipoLead, typeof lead.tipo === 'string' ? lead.tipo : null)),
    'Documento do Contato': texto(lead.documento),
    'WhatsApp Lid': texto(lead.whatsAppLid),
    'Data de Assinatura do Contrato': converterData(det.dataAssinaturaContrato),
    'Fase energética': texto(det.faseEnergetica),
    'Tipo de Edificação': nomeDe(det.tipoEdificacao),
    'Homologador': responsavel(lista.homologador, lista.homologadorId),
    'Projetista': responsavel(lista.projetista, lista.projetistaId),
    'Código da unidade consumidora': texto(det.unidadeConsumidora),
  }
  return COLUNAS.map((c) => v[c] ?? null)
}

// ─── Arquivo xlsx ────────────────────────────────────────────────────────────

/** Gera o .xlsx (aba "Deals") a partir das linhas e devolve um Buffer. */
export async function gerarXlsx(linhas, semDetalhe = []) {
  // Import dinâmico: quem só precisa dos links (ferramenta MCP) não carrega a biblioteca.
  const { default: escrever } = await import('write-excel-file/node')
  const cabecalho = COLUNAS.map((c) => ({ value: c, fontWeight: 'bold' }))
  const dados = linhas.map((linha) => linha.map((valor, i) => {
    if (valor === null || valor === undefined) return null
    const nome = COLUNAS[i]
    if (valor instanceof Date) {
      return { value: valor, type: Date, format: COLUNAS_DATA_HORA.has(nome) ? 'dd/mm/yyyy hh:mm' : 'dd/mm/yyyy' }
    }
    if (typeof valor === 'number') return { value: valor, type: Number }
    return { value: String(valor), type: String }
  }))
  const larguras = COLUNAS.map((c) => ({ width: Math.min(Math.max(c.length + 2, 12), 40) }))
  const abas = [{
    data: [cabecalho, ...dados],
    sheet: 'Deals',
    columns: larguras,
    stickyRowsCount: 1,
  }]
  if (semDetalhe.length) {
    abas.push({
      data: [
        [{ value: 'Código dos cards sem detalhe (colunas do detalhe vazias na aba Deals)', fontWeight: 'bold' }],
        ...semDetalhe.map((c) => [typeof c === 'number' ? { value: c, type: Number } : { value: String(c), type: String }]),
      ],
      sheet: 'Avisos',
      columns: [{ width: 40 }],
      stickyRowsCount: 1,
    })
  }
  const buffer = await escrever(abas).toBuffer()
  return Buffer.from(buffer)
}

// ─── Filtros ─────────────────────────────────────────────────────────────────

function erroTempo() {
  return Object.assign(new Error('A geração passou do tempo permitido; use um filtro mais estreito.'), { status: 422, codigo: 'TEMPO' })
}

function erroEntrada(mensagem, codigo = 'ENTRADA') {
  return Object.assign(new Error(mensagem), { status: 400, codigo })
}

/** Valida e normaliza os filtros (usado na ferramenta MCP e no download). */
export function normalizarFiltros(entrada = {}) {
  const f = entrada ?? {}
  const lista = (v) => (v === undefined || v === null || v === '' ? [] : Array.isArray(v) ? v : [v])

  const etapas = lista(f.etapas).map((e) => {
    if (typeof e === 'number' && Number.isInteger(e) && e > 0) return e
    if (typeof e === 'string' && /^\d{1,6}$/.test(e.trim())) return Number(e.trim())
    if (typeof e === 'string' && e.trim() && e.length <= 80) return e.trim()
    throw erroEntrada('Etapa inválida: use o nome (ex.: "17. SEGURO") ou o id da etapa.')
  })
  if (etapas.length > 20) throw erroEntrada('Informe no máximo 20 etapas.')

  const status = lista(f.status).map((s) => {
    if (typeof s !== 'string' || !s.trim() || s.length > 80) throw erroEntrada('Status inválido: use o nome do status.')
    return s.trim()
  })
  if (status.length > 30) throw erroEntrada('Informe no máximo 30 status.')

  let atualizadoDesde = null
  if (f.atualizadoDesde !== undefined && f.atualizadoDesde !== null && f.atualizadoDesde !== '') {
    const s = String(f.atualizadoDesde)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) {
      throw erroEntrada('atualizadoDesde deve ser uma data no formato AAAA-MM-DD.')
    }
    atualizadoDesde = s
  }

  let limite = null
  if (f.limite !== undefined && f.limite !== null && f.limite !== '') {
    const n = Number(f.limite)
    if (!Number.isInteger(n) || n < 1) throw erroEntrada('limite deve ser um número inteiro positivo.')
    limite = Math.min(n, LIMITE_MAXIMO)
  }

  if (!etapas.length && !atualizadoDesde && !limite) {
    throw erroEntrada('Informe ao menos um filtro de abrangência: etapas, atualizadoDesde ou limite (a base inteira não cabe em um arquivo).')
  }
  return { etapas, status, atualizadoDesde, limite }
}

/** Texto sem acento, emoji ou caixa, para comparar nomes de etapa/status. */
function normalizarNome(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}. ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

// ─── Geração ─────────────────────────────────────────────────────────────────

async function resolverEtapas(get, etapas) {
  const ids = []
  let catalogo = null
  for (const e of etapas) {
    if (typeof e === 'number') { ids.push(e); continue }
    if (!catalogo) {
      // A API devolve no máximo 20 itens por página; pagina até totalPages ou página vazia.
      const todas = []
      let totalPaginas = 1
      for (let pagina = 1; pagina <= totalPaginas && pagina <= 20; pagina++) {
        const r = await get('EtapaLead', { PageNumber: pagina, PageSize: 100 })
        const itens = Array.isArray(r) ? r : (r?.list ?? [])
        if (!itens.length) break
        todas.push(...itens)
        totalPaginas = Number(r?.totalPages) || 1
      }
      const vistos = new Set()
      catalogo = todas
        .filter((x) => !vistos.has(x.id) && vistos.add(x.id))
        .map((x) => ({ id: x.id, nome: normalizarNome(x.nome) }))
    }
    const alvo = normalizarNome(e)
    const achadas = catalogo.filter((c) => c.nome === alvo)
    const candidatas = achadas.length ? achadas : catalogo.filter((c) => c.nome.includes(alvo))
    if (candidatas.length !== 1) {
      throw erroEntrada(candidatas.length
        ? `A etapa "${e}" é ambígua (${candidatas.length} funis); use o nome completo ou o id.`
        : `Etapa "${e}" não encontrada.`)
    }
    ids.push(candidatas[0].id)
  }
  return [...new Set(ids)]
}

async function executarEmLotes(itens, paralelismo, fn, prazo) {
  const resultados = new Array(itens.length)
  let proximo = 0
  async function trabalhador() {
    while (proximo < itens.length) {
      if (Date.now() > prazo) throw erroTempo()
      const i = proximo++
      resultados[i] = await fn(itens[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(paralelismo, itens.length) }, trabalhador))
  return resultados
}

/**
 * Lista os projetos que passam nos filtros (mais recentes primeiro). Para sem
 * paginar além do necessário: pelo `limite`, por `atualizadoDesde` ou porque já
 * há mais cards do que o permitido.
 */
async function selecionar(get, filtros, ids, prazo = Date.now() + TEMPO_MAXIMO_MS) {
  const maxColetar = filtros.limite ?? LIMITE_MAXIMO + 1
  const status = filtros.status.map(normalizarNome)
  const desde = filtros.atualizadoDesde
  const porId = new Map()

  // A API limita o tamanho da página (hoje 20 itens), então a paginação se
  // guia por totalPages. Busca de 4 em 4 páginas em paralelo e processa em ordem.
  async function paginar(extra) {
    const proprios = []
    let totalPaginas = null
    let pagina = 1
    let semCards = 0 // páginas percorridas sem achar nenhum card que passe nos filtros
    while (totalPaginas === null || pagina <= totalPaginas) {
      if (Date.now() > prazo || semCards >= MAX_PAGINAS_SEM_CARDS) throw erroTempo()
      // A primeira página sozinha revela totalPages; as demais vêm em grupos.
      const numeros = Array.from({ length: totalPaginas === null ? 1 : Math.min(PAGINAS_EM_PARALELO, totalPaginas - pagina + 1) }, (_, i) => pagina + i)
      pagina += numeros.length
      const respostas = await Promise.all(numeros.map((n) => get('Projeto', { pageNumber: n, pageSize: TAMANHO_PAGINA, ordenarPor: 'DataAtualizacao_DESC', ...extra })))
      totalPaginas = respostas[0]?.totalPages ?? 1
      for (const r of respostas) {
        const itens = r?.list ?? []
        if (!itens.length) return proprios
        const antes = proprios.length
        for (const it of itens) {
          // A listagem vem ordenada por atualização (mais recente primeiro).
          if (desde && String(it.dataUltimaAtualizacao ?? '').slice(0, 10) < desde) return proprios
          if (status.length) {
            const s = normalizarNome(it.status?.nome ?? it.statusnome)
            if (!status.some((alvo) => s === alvo || s.includes(alvo))) continue
          }
          proprios.push(it)
          if (proprios.length >= maxColetar) return proprios
        }
        semCards = proprios.length > antes ? 0 : semCards + 1
      }
    }
    return proprios
  }

  if (ids.length) {
    // O parâmetro etapaId filtra no servidor; cards com várias etapas ativas
    // (funis paralelos) aparecem em cada uma, então une por id.
    for (const id of ids) for (const it of await paginar({ etapaId: id })) if (!porId.has(it.id)) porId.set(it.id, it)
  } else {
    for (const it of await paginar({})) porId.set(it.id, it)
  }

  const todos = [...porId.values()].sort((a, b) => String(b.dataUltimaAtualizacao ?? '').localeCompare(String(a.dataUltimaAtualizacao ?? '')))
  if (!filtros.limite && todos.length > LIMITE_MAXIMO) {
    throw Object.assign(new Error(
      `O filtro seleciona mais de ${LIMITE_MAXIMO} cards (limite por arquivo). Estreite por etapa, status ou atualizadoDesde, ou informe "limite".`,
    ), { status: 422, codigo: 'MUITOS' })
  }
  return filtros.limite ? todos.slice(0, filtros.limite) : todos
}

/**
 * Gera as linhas do Deals para os filtros. `get(recurso, params)` devolve o
 * `Content` da API do Groner. Devolve { linhas, resumo, falhas }. Não registra
 * nenhum dado de cliente.
 */
export async function gerarDeals({ get, filtros: entrada, agora = () => Date.now() }) {
  const filtros = normalizarFiltros(entrada)
  const inicio = agora()
  const prazo = Date.now() + TEMPO_MAXIMO_MS

  const ids = await resolverEtapas(get, filtros.etapas)
  const selecionados = await selecionar(get, filtros, ids, prazo)

  const semDetalhe = []
  const detalhar = async (item) => {
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      try {
        const det = await get(`Projeto/${item.id}`)
        return montarLinha(item, det ?? {})
      } catch (e) {
        if (tentativa === 1) { semDetalhe.push(item.id); return montarLinha(item, {}) }
      }
    }
  }
  const linhas = await executarEmLotes(selecionados, PARALELISMO, detalhar, prazo)

  const falhas = semDetalhe.length
  if (falhas > LIMITE_FALHAS_ABSOLUTO || falhas > linhas.length * LIMITE_FALHAS_PROPORCAO) {
    throw Object.assign(
      new Error(`O Groner não devolveu o detalhe de ${falhas} dos ${linhas.length} cards; tente novamente em instantes.`),
      { status: 502, codigo: 'DETALHE' },
    )
  }

  const resumo = `${linhas.length} cards, ${COLUNAS.length} colunas` +
    (falhas ? `, ${falhas} sem detalhe (listados na aba Avisos)` : '') +
    ` (${Math.round((agora() - inicio) / 100) / 10}s)`
  return { linhas, resumo, falhas, semDetalhe: semDetalhe.sort((a, b) => a - b) }
}

/** Gera o arquivo completo: { buffer, resumo, total, falhas }. */
export async function gerarArquivoDeals(opcoes) {
  const { linhas, resumo, falhas, semDetalhe } = await gerarDeals(opcoes)
  const buffer = await gerarXlsx(linhas, semDetalhe)
  return { buffer, resumo, total: linhas.length, falhas }
}

/** Nome do arquivo: Deals-AAAA-MM-DD.xlsx (data de Brasília). */
export function nomeDoArquivo(agora = new Date()) {
  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora)
  return `Deals-${dia}.xlsx`
}

// ─── Link de download assinado ───────────────────────────────────────────────

function assinatura(segredo, f, exp) {
  return crypto.createHmac('sha256', segredo).update(`${f}.${exp}`).digest('hex')
}

/**
 * Monta o link de download. Os filtros viajam no próprio link (base64url) e a
 * assinatura cobre filtros + expiração. Sem `segredo` não há link.
 */
export function assinarLink({ baseUrl, filtros, segredo, agora = Date.now(), validadeSegundos = VALIDADE_LINK_SEGUNDOS }) {
  if (!segredo) throw new Error('Chave de assinatura ausente (MCP_ACCESS_TOKEN).')
  const normalizados = normalizarFiltros(filtros)
  const f = Buffer.from(JSON.stringify(normalizados), 'utf8').toString('base64url')
  const exp = Math.floor(agora / 1000) + validadeSegundos
  const sig = assinatura(segredo, f, exp)
  const base = String(baseUrl).replace(/\/+$/, '')
  return {
    link: `${base}/api/deals/download?f=${f}&exp=${exp}&sig=${sig}`,
    expiraEm: new Date(exp * 1000).toISOString(),
    filtros: normalizados,
  }
}

/** Confere assinatura (tempo constante) e validade. Devolve { ok, filtros } ou { ok:false, motivo }. */
export function verificarLink({ f, exp, sig }, segredo, agora = Date.now()) {
  if (!segredo) return { ok: false, motivo: 'sem-chave' }
  if (typeof f !== 'string' || typeof sig !== 'string' || !/^\d{1,12}$/.test(String(exp ?? ''))) return { ok: false, motivo: 'malformado' }
  const esperada = Buffer.from(assinatura(segredo, f, exp), 'utf8')
  const recebida = Buffer.from(sig, 'utf8')
  if (esperada.length !== recebida.length || !crypto.timingSafeEqual(esperada, recebida)) return { ok: false, motivo: 'assinatura' }
  if (Number(exp) * 1000 < agora) return { ok: false, motivo: 'expirado' }
  try {
    return { ok: true, filtros: normalizarFiltros(JSON.parse(Buffer.from(f, 'base64url').toString('utf8'))) }
  } catch {
    return { ok: false, motivo: 'malformado' }
  }
}
