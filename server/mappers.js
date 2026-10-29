import { derivarRegistro } from './solarzMetricas.js'

/**
 * Cada mapper aqui é uma allowlist explícita de campos do Groner.
 * Alguns recursos (PreProposta, sobretudo) embutem objetos gigantes com
 * dados internos e até credenciais (ver sanitize.js) — nunca repassamos o
 * objeto bruto para o frontend, só os campos que a interface realmente usa.
 */

/**
 * Não cruzamos Venda com Projeto/Proposta via API aqui: testamos os dois
 * caminhos possíveis (Venda.id === Projeto.id, e Venda.propostaId ->
 * Proposta) e os dois se mostraram não confiáveis nos dados reais do tenant
 * — em parte por IDs que não coincidem, em parte porque propostas antigas já
 * foram removidas do Groner. Em vez disso, cidade/estado/kit técnico vêm do
 * enriquecimento por planilha (server/enrichment.js), cujo vínculo por
 * Código foi validado 1:1 contra os dados reais antes de integrar.
 */
export function mapVenda(v, enriquecimento) {
  const extra = enriquecimento?.[String(v.id)]
  return {
    id: v.id,
    nome: v.nome,
    vendedor: v.vendedor,
    valorTotal: v.valorTotal,
    valorComissao: v.valorComissao,
    dataVenda: v.dataVenda,
    cicloVenda: v.cicloVenda,
    origemNome: v.origemNome,
    statusNome: v.statusNome,
    statusCor: v.statusCor,
    cidade: extra?.cidade ?? null,
    estado: extra?.estado ?? null,
    bairro: extra?.bairro ?? null,
    fornecedor: extra?.fornecedor ?? null,
    placa: extra?.placa ?? null,
    inversor: extra?.inversor ?? null,
    lucro: extra?.lucro ?? null,
    lucroServico: extra?.lucroServico ?? null,
  }
}

const STATUS_MARCO = new Map([
  ['FUNIL ENGENHARIA - CRIAR PROP', '1'], ['CRIAR PROJETO->PROPOSTA', '1'], ['CRIAR ABORDAGEM', '1'],
  ['APROVAR PROPOSTA CRIADA', '2'], ['PENDENCIAS TECNICAS->PROJETOS', '3'], ['APROVACAO TECNICA - VENDA', '3'],
  ['PROPOSTA CRIADA APROVADA', '4'], ['AGUARDANDO ASSINATURA', 'G6'], ['DOCUMENTOS PENDENTES', 'G6'], ['PAGAMENTO REALIZADO', 'G6'],
  ['PIETA_CRIACAO DO PROJETO', '5'], ['PIETA_PARECER SOLICITADO', '5'], ['PENDENCIA DE HOMOLOGACAO', '6'], ['PENDENCIA ICF', '6'],
  ['PENDENCIA DOCUMENTAL/TECNICA', '6'], ['PARECER EMITIDO', '6'], ['PEDIDO ENTREGUE', '7'], ['INSTALADOR HOMOLOGADO', '9'],
  ['AGENDAR INSTALACAO', '9'], ['INSTALACAO AGENDADA', '10'], ['DIARIO DE OBRA / OBRA ANDAMENTO', '11'], ['PENDENCIA DE OBRA', '11'],
  ['PENDENCIA DE INSTALACAO', '11'], ['AGUARDANDO VISTORIA', '12'], ['PENDENCIA VIST. CONCESSIONARIA', '12'], ['RELOGIO TROCADO', '13'],
  ['INSTALACAO APP MONITORAMENTO', '13'], ['APP MONITOR INSTALADO', '14'], ['TERMO DE ACEITE', '15'], ['TERMO DE ACEITE ASSINADO', '15'],
  ['INSTALACAO CONCLUIDA', '11'], ['DOSSIE', '16'], ['DOSSIE ENVIADO', 'FIM'],
])

function semAcentos(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase()
}

export function marcoDoStatus(status) {
  return STATUS_MARCO.get(semAcentos(status)) ?? null
}

const ANO_MINIMO = 1950
const ANOS_FUTURO_MAXIMO = 10

/**
 * Data do Groner utilizável, já normalizada (Brasília), ou null. O Groner manda
 * 0001-01-01 (e às vezes 1901) para "vazio"; anos antes de 1950, mais de 10 anos
 * no futuro, ou texto que não é data também contam como vazio.
 */
export function dataGronerValida(value, agora = new Date()) {
  if (typeof value !== 'string' || !value.trim()) return null
  let texto = value.trim()
  // dd/mm/aaaa e dd/mm/aaaa hh:mm[:ss] (campos personalizados preenchidos à mão) viram ISO.
  const br = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/)
  if (br) texto = `${br[3]}-${br[2]}-${br[1]}${br[4] ? `T${br[4]}:${br[5]}:${br[6] ?? '00'}` : ''}`
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!iso) return null
  const [ano, mes, dia] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
  if (!(ano >= ANO_MINIMO) || ano > agora.getUTCFullYear() + ANOS_FUTURO_MAXIMO) return null
  // Dia/mês impossíveis (2026-02-30, 13º mês) não são data.
  const conferida = new Date(Date.UTC(ano, mes - 1, dia))
  if (conferida.getUTCFullYear() !== ano || conferida.getUTCMonth() !== mes - 1 || conferida.getUTCDate() !== dia) return null
  const normalizada = normalizarDataGroner(texto)
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(normalizada) ? `${normalizada}T12:00:00-03:00` : normalizada)
  return Number.isFinite(t) ? normalizada : null
}

const UF_POR_NOME = {
  ACRE: 'AC', ALAGOAS: 'AL', AMAPA: 'AP', AMAZONAS: 'AM', BAHIA: 'BA', CEARA: 'CE', 'DISTRITO FEDERAL': 'DF',
  'ESPIRITO SANTO': 'ES', GOIAS: 'GO', MARANHAO: 'MA', 'MATO GROSSO': 'MT', 'MATO GROSSO DO SUL': 'MS',
  'MINAS GERAIS': 'MG', PARA: 'PA', PARAIBA: 'PB', PARANA: 'PR', PERNAMBUCO: 'PE', PIAUI: 'PI',
  'RIO DE JANEIRO': 'RJ', 'RIO GRANDE DO NORTE': 'RN', 'RIO GRANDE DO SUL': 'RS', RONDONIA: 'RO', RORAIMA: 'RR',
  'SANTA CATARINA': 'SC', 'SAO PAULO': 'SP', SERGIPE: 'SE', TOCANTINS: 'TO',
}
const SIGLAS_UF = new Set(Object.values(UF_POR_NOME))

/** Sigla da UF ("São Paulo" e "sp" viram "SP"); qualquer outra coisa vira null. */
export function siglaUF(value) {
  if (typeof value !== 'string') return null
  const t = semAcentos(value.replace(/-/g, ' '))
  if (SIGLAS_UF.has(t)) return t
  return UF_POR_NOME[t] ?? null
}

function texto(value) {
  if (value == null || typeof value === 'object') return null
  const t = String(value).trim()
  return t === '' ? null : t
}

/** Nome de um objeto do Groner ({ nome }) ou o próprio texto. */
function nomeDe(value) {
  return value && typeof value === 'object' ? texto(value.nome) : texto(value)
}

function primeiro(...valores) {
  for (const v of valores) if (v !== null && v !== undefined && v !== '') return v
  return null
}

/** Nome de responsável, ou null quando o Groner manda id 0 ou "Sem …". */
function pessoa(nome, id) {
  if (id === 0 || id === '0') return null
  const texto = typeof nome === 'string' ? nome.trim() : ''
  return texto && !/^sem\s/i.test(texto) ? texto : null
}

/**
 * Nome (texto) de um usuário do Groner. A listagem do /Projeto manda o nome como
 * texto, mas o detalhe (usado pela sincronização) manda o objeto completo do
 * usuário (com cpf, e-mail, celular…). Só o nome pode seguir para o navegador.
 */
export function nomeDePessoa(value) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && typeof value.nome === 'string') return value.nome
  return null
}

const DATAS_DO_PROJETO = [
  'dataInclusao', 'dataUltimaAtualizacao', 'dataUltimoStatus', 'dataEntradaStatus', 'previsaoFechamento', 'dataVenda',
  'dataAceiteProposta', 'dataInicioInstalacao', 'dataTerminoInstalacao', 'dataAssinaturaContrato', 'dataTerminoGarantia',
]
const ehSentinela = (v) => typeof v === 'string' && /^0001-01-01/.test(v)

/**
 * Corrige, na leitura, projeto já gravado no armazenamento por versões antigas
 * da sincronização: vendedor em objeto, datas-sentinela (0001-01-01) e — nos
 * cards gravados com o detalhe espalhado por cima da listagem (reconhecidos
 * pela data de status 0001-01-01, que só o detalhe manda) — cidade/UF/bairro da
 * loja do vendedor e kWp/geração de uma proposta qualquer. Esses voltam para o
 * enriquecimento do Deals (ou vazio; kWp/geração são completados pela proposta
 * aceita). Também recalcula os dias derivados da data de hoje, que não são
 * gravados. Sem nada a corrigir, devolve o próprio objeto.
 */
export function normalizarProjetoLido(projeto, enriquecimento = null, agora = Date.now()) {
  if (!projeto || typeof projeto !== 'object') return projeto
  const fix = {}
  const v = projeto.vendedorResponsavel
  if (v != null && typeof v !== 'string') fix.vendedorResponsavel = nomeDePessoa(v)
  const contaminado = ehSentinela(projeto.dataUltimoStatus) || ehSentinela(projeto.dataEntradaStatus)
  for (const campo of DATAS_DO_PROJETO) {
    const valor = projeto[campo]
    if (valor != null && dataGronerValida(valor) == null) fix[campo] = null
  }
  if (contaminado) {
    const enr = enriquecimento?.[String(projeto.id)] ?? {}
    fix.cidade = texto(enr.cidade)
    fix.estado = siglaUF(enr.estado)
    fix.bairro = texto(enr.bairro)
    fix.kwp = null
    fix.geracaoMensalPrevista = null
  }
  const estado = 'estado' in fix ? fix.estado : projeto.estado
  if (estado != null && siglaUF(estado) !== estado) fix.estado = siglaUF(estado)
  const atual = (campo) => (campo in fix ? fix[campo] : projeto[campo])
  const dias = { diasSemAtualizacao: diasDesde(atual('dataUltimaAtualizacao'), agora), diasDesdeVenda: diasDesde(atual('dataVenda'), agora) }
  for (const [campo, valor] of Object.entries(dias)) if ((projeto[campo] ?? null) !== valor) fix[campo] = valor
  const mudou = Object.keys(fix).some((campo) => projeto[campo] !== fix[campo])
  return mudou ? { ...projeto, ...fix } : projeto
}

export function normalizarDataGroner(value) {
  if (typeof value !== 'string' || !value.trim()) return value ?? null
  const texto = value.trim()
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(texto)) return `${texto}-03:00`
  return texto
}

function diasDesde(value, agora = Date.now()) {
  const timestamp = Date.parse(normalizarDataGroner(value) ?? '')
  return Number.isFinite(timestamp) ? Math.max(0, Math.floor((agora - timestamp) / 86400000)) : null
}

function momentoDoMarco(marco) {
  if (marco === 'FIM') return 'encerrado'
  if (marco === 'G6' || ['1', '2', '3', '4'].includes(marco)) return 'pré-venda'
  if (['5', '6', '7', '9', '10', '11', '12'].includes(marco)) return 'implantação'
  if (['13', '14', '15', '16'].includes(marco)) return 'gestão da usina'
  return null
}

function estaNoFluxoEngenharia(funil, status, marco) {
  if (marco == null) return false
  const etapa = semAcentos(funil)
  return /^(04\.|06\.|07\.|08\.|09\.|10\.|11\.)/.test(etapa)
    && (!etapa.startsWith('04.') || semAcentos(status) === 'FUNIL ENGENHARIA - CRIAR PROP')
}

function numero(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'object') return null
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

const objeto = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : null)

/**
 * Resumo do detalhe do projeto (GET /Projeto/{id}) com SÓ os campos que o
 * dashboard usa e que a listagem não traz. Os caminhos são os validados no
 * Deals (server/deals.js). O detalhe embute o contato (lead), o responsável e a
 * loja — com endereço da loja e datas-sentinela 0001-01-01 —, por isso nada é
 * lido por busca genérica: cidade/UF vêm só do endereço do projeto (ou do
 * contato), nunca de `lead.responsavel` nem de `loja`.
 */
export function resumirDetalheProjeto(det) {
  // O n8n entrega o detalhe embrulhado em { Content } (o fluxo de alterações também desembrulha).
  const d = objeto(det?.Content) ?? objeto(det?.content) ?? objeto(det)
  if (!d) return null
  if (d.resumoDetalhe === true) return d
  const lead = objeto(d.lead) ?? {}
  const end = objeto(d.endereco) ?? {}
  const endLead = objeto(lead.endereco) ?? {}
  const aceita = objeto(d.prePropostaAceita)
  const sim = objeto(aceita?.preProposta?.simulacao)
  const atuais = Array.isArray(d.statusAtuais) ? d.statusAtuais : []
  const statusAtual = atuais.find((s) => s?.statusId != null && s.statusId === d.statusId)
  return {
    resumoDetalhe: true,
    cidade: texto(primeiro(end.cidade, endLead.cidade)),
    uf: siglaUF(end.uf) ?? siglaUF(endLead.uf),
    bairro: texto(primeiro(end.bairro, endLead.bairro)),
    concessionaria: nomeDe(d.concessionaria),
    uc: texto(d.unidadeConsumidora),
    tipoTelhado: nomeDe(d.tipoTelhado),
    tipoEdificacao: nomeDe(d.tipoEdificacao),
    faseEnergetica: texto(d.faseEnergetica),
    dataAssinaturaContrato: dataGronerValida(d.dataAssinaturaContrato),
    kwp: numero(sim?.kwP),
    geracaoMensalPrevista: numero(sim?.geracaoMensal),
    valorPropostaAceita: numero(primeiro(sim?.preco, aceita?.valorTotal)),
    dataAceiteProposta: dataGronerValida(aceita?.dataInclusao),
    dataEntradaStatus: dataGronerValida(statusAtual?.data),
    qtdPrePropostas: Array.isArray(d.prePropostas) ? d.prePropostas.length : null,
  }
}

/** Campos personalizados (CampoPersonalizado/Projeto/{id}/Agrupado) lidos pelo título. */
const CAMPO_POR_TITULO = {
  'DATA ASSINATURA DO CONTRATO': 'dataAssinaturaContrato',
  'DATA DE ASSINATURA DO CONTRATO': 'dataAssinaturaContrato',
  'DATA DE INICIO DA INSTALACAO': 'dataInicioInstalacao',
  'DATA DE TERMINO DA INSTALACAO': 'dataTerminoInstalacao',
  'DATA DE TERMINO DA GARANTIA DA INSTALACAO': 'dataTerminoGarantia',
  'URL DO MONITORAMENTO': 'urlMonitoramento',
  'MODELO DO MONITORAMENTO': 'modeloMonitoramento',
}

export function resumirCamposPersonalizados(campos) {
  if (objeto(campos)?.resumoCampos === true) return campos
  const grupos = Array.isArray(campos) ? campos : Array.isArray(campos?.list) ? campos.list : Array.isArray(campos?.Content) ? campos.Content : []
  const saida = { resumoCampos: true }
  for (const grupo of grupos) {
    for (const item of Array.isArray(grupo?.campos) ? grupo.campos : []) {
      const chave = CAMPO_POR_TITULO[semAcentos(item?.campo?.titulo ?? item?.titulo)]
      const valor = texto(item?.resposta)
      if (chave && valor != null && saida[chave] == null) saida[chave] = valor
    }
  }
  return saida
}

/**
 * Junta o item da listagem do /Projeto com o detalhe e os campos personalizados.
 * A listagem tem prioridade: o detalhe entra resumido em `detalhe` (só o que a
 * listagem não tem), e nunca sobrescreve datas, etapa, status ou cidade/UF dela —
 * no detalhe, `dataUltimoStatus` vem sempre 0001-01-01.
 */
export function mesclarProjetoComDetalhe(item, detalhe, campos) {
  return { ...item, detalhe: resumirDetalheProjeto(detalhe), camposPersonalizados: resumirCamposPersonalizados(campos) }
}

/** Fluxos antigos do n8n espalham o detalhe bruto por cima do item da listagem. */
function pareceDetalheEspalhado(p) {
  return p.detalhe == null && (objeto(p.lead) != null || objeto(p.endereco) != null || Array.isArray(p.prePropostas) || 'dataAlteracao' in p)
}

/** Data em que o card entrou no status atual, pela lista de status atuais com data da listagem. */
function entradaNoStatusDaListagem(p) {
  const atuais = Array.isArray(p.statusAtuaisComData) ? p.statusAtuaisComData : []
  const atual = atuais.find((s) => s?.statusId != null && s.statusId === p.statusId)
  return dataGronerValida(atual?.data)
}

export function mapProjeto(p, enriquecimento) {
  const espalhado = pareceDetalheEspalhado(p)
  const det = resumirDetalheProjeto(p.detalhe) ?? (espalhado ? resumirDetalheProjeto(p) : null) ?? {}
  const campos = resumirCamposPersonalizados(p.camposPersonalizados)
  const enr = enriquecimento?.[String(p.id)] ?? {}
  // Campos do Deals mandados prontos (p.deal): só o primeiro nível, sem busca recursiva.
  const deal = objeto(p.deal) ?? {}
  const status = p.status?.nome ?? p.etapa ?? p.status ?? null
  const funil = p.funil ?? p.etapa ?? null
  const marco = marcoDoStatus(status)
  // A API manda 0001-01-01 quando não há venda; isso não pode apagar a data vinda do Deals.
  const dataVenda = dataGronerValida(p.dataVenda) ?? dataGronerValida(enr.dataVenda)
  const dataAtualizacao = dataGronerValida(p.dataUltimaAtualizacao) ?? (espalhado ? dataGronerValida(p.dataAlteracao) : null)
  const dataUltimoStatus = dataGronerValida(p.dataUltimoStatus)
  // A listagem do /Projeto traz os responsáveis com id 0 e "Sem Técnico"/"Sem Projetista" quando vazios.
  const tecnico = pessoa(nomeDePessoa(p.tecnicoResponsavel), p.tecnicoResponsavelId) ?? pessoa(texto(deal.tecnico))
  const projetista = pessoa(nomeDePessoa(p.projetista), p.projetistaId)
  const homologador = pessoa(nomeDePessoa(p.homologador), p.homologadorId)
  const latitude = numero(p.latidude) ?? numero(p.latitude)
  const longitude = numero(p.longitude)
  return {
    id: p.id,
    nome: p.nome,
    tipo: nomeDe(p.tipo),
    tipoLead: p.tipoLead,
    funil,
    etapa: status,
    marco,
    corEtapa: p.corEtapa,
    origemLead: p.origemLead?.nome ?? null,
    vendedorResponsavel: nomeDePessoa(p.vendedorResponsavel),
    dataInclusao: dataGronerValida(p.dataInclusao),
    dataUltimaAtualizacao: dataAtualizacao,
    dataUltimoStatus,
    previsaoFechamento: dataGronerValida(p.previsaoFechamento),
    valorPrePropostaAceita: p.valorPrePropostaAceita ?? det.valorPropostaAceita ?? null,
    valorVenda: p.valorVenda,
    perda: p.perda,
    // No detalhe, `consumo` pode vir dividido; o total é `consumoTotal` (ver server/deals.js).
    consumo: espalhado ? primeiro(p.consumoTotal, p.consumo) : p.consumo,
    qtdPrePropostas: p.qtdPrePropostas ?? det.qtdPrePropostas ?? null,
    latitude: latitude || null,
    longitude: longitude || null,
    cidade: texto(p.cidade) ?? det.cidade ?? texto(deal.cidade) ?? texto(enr.cidade),
    estado: siglaUF(p.uf) ?? siglaUF(p.estado) ?? det.uf ?? siglaUF(deal.estado) ?? siglaUF(enr.estado),
    bairro: texto(p.bairro) ?? det.bairro ?? texto(enr.bairro),
    concessionaria: det.concessionaria ?? nomeDe(p.concessionaria) ?? texto(enr.concessionaria),
    momento: momentoDoMarco(marco),
    donoNominal: tecnico ?? projetista ?? homologador ?? null,
    diasSemAtualizacao: diasDesde(dataAtualizacao),
    diasDesdeVenda: diasDesde(dataVenda),
    dataEntradaStatus: entradaNoStatusDaListagem(p) ?? det.dataEntradaStatus ?? dataUltimoStatus,
    noFluxoEngenharia: estaNoFluxoEngenharia(funil, status, marco),
    dataVenda,
    dataAceiteProposta: det.dataAceiteProposta ?? dataGronerValida(p.dataPropostaAceita) ?? dataGronerValida(p.dataAceiteProposta),
    kwp: numero(p.kwp) ?? det.kwp ?? numero(deal.kwp) ?? null,
    geracaoMensalPrevista: numero(p.geracaoMensalPrevista) ?? det.geracaoMensalPrevista ?? null,
    uc: det.uc ?? texto(p.uc),
    tecnico,
    projetista,
    homologador,
    tipoTelhado: det.tipoTelhado ?? nomeDe(p.tipoTelhado) ?? texto(enr.tipoTelhado),
    faseEnergetica: det.faseEnergetica ?? texto(p.faseEnergetica) ?? texto(enr.faseEnergetica),
    tipoEdificacao: det.tipoEdificacao ?? nomeDe(p.tipoEdificacao) ?? texto(enr.tipoEdificacao),
    dataInicioInstalacao: dataGronerValida(campos.dataInicioInstalacao ?? p.dataInicioInstalacao),
    dataTerminoInstalacao: dataGronerValida(campos.dataTerminoInstalacao ?? p.dataTerminoInstalacao),
    dataAssinaturaContrato: det.dataAssinaturaContrato ?? dataGronerValida(campos.dataAssinaturaContrato) ?? dataGronerValida(p.dataAssinaturaContrato),
    urlMonitoramento: campos.urlMonitoramento ?? texto(p.urlMonitoramento),
    modeloMonitoramento: campos.modeloMonitoramento ?? texto(p.modeloMonitoramento),
    dataTerminoGarantia: dataGronerValida(campos.dataTerminoGarantia ?? p.dataTerminoGarantia),
  }
}

/** Campos calculados a partir da data de hoje: não são gravados (mudariam o hash a cada carga). */
const CAMPOS_VOLATEIS = ['diasSemAtualizacao', 'diasDesdeVenda']

/** mapProjeto sem os campos que dependem do relógio, para gravar no armazenamento. */
export function mapProjetoParaArmazenar(p, enriquecimento) {
  const registro = mapProjeto(p, enriquecimento)
  for (const campo of CAMPOS_VOLATEIS) delete registro[campo]
  return registro
}


export function mapProposta(pp) {
  const sim = pp.simulacao ?? {}
  return {
    id: pp.id,
    dataInclusao: pp.dataInclusao,
    dataAlteracao: pp.dataAlteracao,
    titulo: pp.titulo,
    projeto: pp.projeto,
    projetoId: pp.projetoId,
    projetoTipo: pp.projetoTipo,
    origem: pp.origem,
    lead: pp.lead,
    leadEmail: pp.leadEmail,
    statusProjeto: pp.statusProjeto,
    etapaProjeto: pp.etapaProjeto,
    corEtapa: pp.corEtapa,
    aceita: pp.aceita,
    vendedorNome: pp.usuario?.nome?.trim() || null,
    kwP: sim.kwP ?? null,
    preco: sim.preco ?? null,
    precoOriginal: sim.precoOriginal ?? null,
    consumo: sim.consumo ?? null,
    geracaoAnual: sim.geracaoAnual ?? null,
    anoRetornoInvestimento: sim.anoRetornoInvestimento ?? null,
    payBack: sim.payBack ?? null,
  }
}

/** Atrasada = tinha prazo de entrega no passado e ainda não foi concluída. */
function calcularAtrasada(t) {
  if (t.dataConclusao) return false
  if (!t.dataEntrega) return false
  const entrega = new Date(t.dataEntrega).getTime()
  if (Number.isNaN(entrega)) return false
  return entrega < Date.now()
}

/**
 * Mapeia 1:1 com o schema documentado da API Pieta (PIEP) — ver
 * API-PIEP-V3.pdf. Ainda não testado contra a API real (aguardando
 * credenciais); os nomes de campo seguem exatamente a doc para minimizar
 * risco de erro de digitação até a primeira chamada real.
 */
export function mapPietaResumo(r) {
  return {
    userId: r.user_id,
    companyName: r.company_name,
    socialName: r.social_name,
    phantasyName: r.phantasy_name,
    document: r.document,
    projectsQuantity: r.projects_quantity,
    lastProject: r.last_project,
    projectsForPhase: r.projects_for_phase ?? {},
    projects: (r.projects ?? []).map((p) => ({
      projectId: p.project_id,
      status: p.status,
      clientName: p.client_name,
      power: p.power != null ? Number(p.power) : null,
      powerDistributor: p.power_distributor,
      createdAt: p.created_at,
      lastStatusChange: p.last_status_change,
      dueDate: p.due_date,
      message: p.message,
    })),
  }
}

export function mapPietaProjetoDetalhe(p) {
  return {
    projectId: p.project_id,
    status: p.status,
    clientName: p.client_name,
    power: p.power != null ? Number(p.power) : null,
    powerDistributor: p.power_distributor,
    powerDistributorState: p.power_distributor_state,
    createdAt: p.created_at,
    lastStatusChange: p.last_status_change,
    dueDate: p.due_date,
    message: p.message,
    daysSinceCreated: p.days_since_created ?? null,
    tempoTotalDias: p.tempo_total_dias ?? null,
    medidorSubstituidoDate: p.medidor_substituido_date ?? null,
    statusTimeline: (p.status_timeline ?? []).map((s) => ({
      etapa: s.etapa,
      entrouEm: s.entrou_em,
      saiuEm: s.saiu_em,
      tempoNaEtapaDias: s.tempo_na_etapa_dias,
    })),
    // Privacidade: só o nome do contato; telefone, pagamento e detalhe do integrador não saem do servidor.
    mainContact: p.main_contact ? { name: p.main_contact.name } : null,
    pendencies: p.pendencies ?? [],
    inversors: p.inversors ?? [],
    solarPanels: p.solar_panels ?? [],
    projectValue: p.project_value ?? null,
    changes: (p.changes ?? []).map((c) => ({
      price: c.price,
      status: c.status,
      createdAt: c.created_at,
      requestFields: c.request_fields,
      responseStatus: c.response_status,
    })),
    changesTotal: p.changes_total ?? 0,
    totalValue: p.total_value ?? null,
  }
}

/**
 * A SolarZ embute o objeto completo do cliente em cada usina, incluindo CPF,
 * e-mail e telefone, mais logradouro/bairro/CEP e o responsável. Mantemos só o
 * nome do cliente (para casar com o Groner), a concessionária, cidade e UF; o resto fica de fora.
 */
export function mapUsina(p) {
  return {
    id: p.id,
    nome: p.name,
    potenciaInstalada: p.installedPower ?? null,
    energiaGeradaKwh: p.energyProducedKwh ?? null,
    status: p.status?.status ?? null,
    statusEm: p.status?.at ?? null,
    dataInstalacao: p.dataInstalacao ?? null,
    clienteNome: p.cliente?.nome ?? null,
    concessionaria: p.cliente?.concessionaria ?? null,
    cidade: p.endereco?.cidade ?? null,
    estado: p.endereco?.siglaEstado ?? null,
    latitude: p.endereco?.latitude ?? null,
    longitude: p.endereco?.longitude ?? null,
  }
}

export const OBS_SEM_PREMIUM = 'sem monitoramento premium — dados do último levantamento'
export const OBS_COMPLEMENTAR = 'requer complementação manual'

/** Usina sem cliente vinculado: cidade, UF e concessionária ficam como "Pendente". */
function pendente(u) {
  if (u.cliente) return u
  return { ...u, cidade: u.cidade ?? 'Pendente', estado: u.estado ?? 'Pendente', concessionaria: u.concessionaria ?? 'Pendente' }
}

export function normalizeNomeUsina(nome) {
  return (nome ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

/** Campos derivados do registro guardado pela carga diária (dado ao vivo do banco). */
function camposAoVivo(registro, agora) {
  const d = derivarRegistro(registro, agora)
  const temEnergia = (registro.meses ?? []).length > 0
  return {
    anoMensal: d.anoMensal,
    mensal: temEnergia ? d.mensal : null,
    mesAnoRecente: d.mesAnoRecente,
    geracaoKwhMes: d.geracaoKwhMes,
    prognosticoKwhMes: d.prognosticoKwhMes,
    desempenhoMesPct: d.desempenhoMesPct,
    desempenho30dPct: d.desempenho30dPct,
    desempenho12mPct: d.desempenho12mPct,
    desempenhoMedio3mPct: d.desempenhoMedio3mPct,
    statusDesempenho: temEnergia && d.desempenhoMedio3mPct != null ? d.statusDesempenho : null,
    totalInvestido: registro.totalInvestido ?? null,
    temEnergia,
  }
}

/** Substitui, campo a campo, o que o relatório tem pelo que veio ao vivo (nulo ao vivo mantém o relatório). */
function aplicarAoVivo(base, ao) {
  const out = { ...base }
  for (const k of ['mesAnoRecente', 'geracaoKwhMes', 'prognosticoKwhMes', 'desempenhoMesPct', 'desempenho30dPct', 'desempenho12mPct', 'desempenhoMedio3mPct', 'statusDesempenho', 'totalInvestido']) {
    if (ao[k] != null) out[k] = ao[k]
  }
  if (ao.mensal) { out.mensal = ao.mensal; out.anoMensal = ao.anoMensal }
  return out
}

/**
 * A API ao vivo da SolarZ só retorna usinas com monitoramento premium
 * (59 de 139 na conta; o relatório mensal exportado do painel cobre 126),
 * com geração/desempenho Jan-Dez/26 - mas é um snapshot estático. Aqui o relatório é a base
 * (todas as usinas) e, para cada usina, os dados ao vivo substituem os do relatório:
 *  1. status de monitoramento em tempo real (chamada da requisição);
 *  2. dados guardados pela carga diária no banco (extra.registros): produção mensal, prognóstico, desempenhos,
 *     status, total investido; UCs (extra.unidades) e tickets abertos (extra.tickets).
 * Casamento por id SolarZ; sem id, por nome normalizado (sem acento). Cada usina leva `fonte`
 * ('solarz' com dado do banco, 'relatorio' sem) e `dadoEm` (ISO do dado usado).
 * Sem `extra` o resultado é o de antes (só relatório + status ao vivo).
 */
export function mesclarUsinasComRelatorio(usinasAoVivo, relatorio, extra = {}) {
  const agora = extra.agora ?? new Date()
  const registros = extra.registros ?? []
  const porIdReg = new Map(registros.filter((r) => r.solarzId != null).map((r) => [String(r.solarzId), r]))
  const porNomeReg = new Map()
  for (const r of registros) {
    const k = normalizeNomeUsina(r.nome)
    if (k && !porNomeReg.has(k)) porNomeReg.set(k, r)
  }
  const regUsados = new Set()
  const acharRegistro = (id, nome) => {
    const r = (id != null ? porIdReg.get(String(id)) : null) ?? porNomeReg.get(normalizeNomeUsina(nome)) ?? null
    return r && !regUsados.has(r) ? r : null
  }
  const unidadesPorId = extra.unidades?.porUsina ?? {}
  const unidadesPorNome = new Map(Object.values(unidadesPorId).map((u) => [normalizeNomeUsina(u.nome), u]))
  const temTickets = Boolean(extra.tickets)
  const ticketsPorId = extra.tickets?.porUsina ?? {}
  const ticketsPorNome = new Map(Object.values(ticketsPorId).map((t) => [normalizeNomeUsina(t.nome), t]))
  const complementos = (id, nome) => {
    const uc = (id != null ? unidadesPorId[String(id)] : null) ?? unidadesPorNome.get(normalizeNomeUsina(nome)) ?? null
    const tk = (id != null ? ticketsPorId[String(id)] : null) ?? ticketsPorNome.get(normalizeNomeUsina(nome)) ?? null
    return {
      unidadesConsumidoras: extra.unidades ? (uc?.ucs ?? []).map((u) => u.codigo) : null,
      ticketsAbertos: temTickets ? (tk?.total ?? 0) : null,
      ticketsAbertosPorTipo: temTickets ? (tk?.porTipo ?? {}) : null,
      ticketsAfetamDesempenho: temTickets ? (tk?.afetamDesempenho ?? 0) : null,
    }
  }

  const porNome = new Map()
  for (const u of usinasAoVivo) {
    const chave = normalizeNomeUsina(u.nome)
    if (!porNome.has(chave)) porNome.set(chave, [])
    porNome.get(chave).push(u)
  }

  const usadas = new Set()
  const usinas = (relatorio.usinas ?? []).map((r) => {
    const chave = normalizeNomeUsina(r.nome)
    const candidatos = porNome.get(chave) ?? []
    const aoVivo = candidatos.find((c) => !usadas.has(c)) ?? null
    if (aoVivo) usadas.add(aoVivo)
    const registro = acharRegistro(aoVivo?.id, r.nome)
    if (registro) regUsados.add(registro)
    const idUsina = aoVivo?.id ?? registro?.solarzId ?? null

    const base = {
      id: idUsina,
      nome: r.nome,
      cliente: r.cliente,
      totalInvestido: r.totalInvestido,
      concessionaria: r.concessionaria ?? aoVivo?.concessionaria ?? registro?.concessionaria ?? null,
      cidade: r.cidade ?? aoVivo?.cidade ?? registro?.cidade ?? null,
      estado: r.estado ?? aoVivo?.estado ?? registro?.estado ?? null,
      classe: r.classe,
      plano: r.plano,
      potenciaKwp: r.potenciaKwp ?? aoVivo?.potenciaInstalada ?? registro?.potenciaKwp ?? null,
      mesAnoRecente: r.mesAnoRecente,
      prognosticoKwhMes: r.prognosticoKwhMes,
      geracaoKwhMes: r.geracaoKwhMes,
      desempenhoMesPct: r.desempenhoMesPct,
      desempenho30dPct: r.desempenho30dPct,
      desempenho12mPct: r.desempenho12mPct,
      desempenhoMedio3mPct: r.desempenhoMedio3mPct,
      statusDesempenho: r.statusDesempenho,
      dataInstalacao: r.dataInstalacao ?? aoVivo?.dataInstalacao ?? registro?.dataInstalacao ?? null,
      anoMensal: 2026,
      mensal: r.mensal2026,
      observacao: r.observacao,
      statusMonitoramento: aoVivo?.status ?? registro?.statusMonitoramento ?? null,
      statusMonitoramentoEm: aoVivo?.statusEm ?? registro?.statusMonitoramentoEm ?? null,
      energiaGeradaAcumuladaKwh: aoVivo?.energiaGeradaKwh ?? registro?.energiaGeradaAcumuladaKwh ?? null,
      latitude: aoVivo?.latitude ?? null,
      longitude: aoVivo?.longitude ?? null,
    }
    const ao = registro ? camposAoVivo(registro, agora) : null
    const solarz = Boolean(ao?.temEnergia)
    const comDado = solarz ? aplicarAoVivo(base, ao) : base
    // Com a carga da SolarZ presente, quem ficou sem dado ao vivo não tem monitoramento premium (a API responde "Essa usina não é premium").
    const semPremium = registros.length > 0 && !solarz
    const observacao = semPremium ? (comDado.observacao ? `${OBS_SEM_PREMIUM}; ${comDado.observacao}` : OBS_SEM_PREMIUM) : comDado.observacao
    return {
      ...pendente(comDado),
      observacao,
      mensal2026: comDado.anoMensal === 2026 ? comDado.mensal : r.mensal2026, // compatibilidade com quem lê o campo antigo
      fonte: solarz ? 'solarz' : 'relatorio',
      dadoEm: solarz ? registro.buscadoEm : relatorio.extraidoEm ?? null,
      ...complementos(idUsina, r.nome),
    }
  })

  // Usinas que a API retorna (ou que a carga guardou) mas que não estão no relatório
  // (relatório desatualizado) ainda entram, para não perder dado ao vivo.
  const extras = []
  for (const u of usinasAoVivo) {
    if (usadas.has(u)) continue
    const registro = acharRegistro(u.id, u.nome)
    if (registro) regUsados.add(registro)
    extras.push({ aoVivo: u, registro })
  }
  for (const registro of registros) {
    if (regUsados.has(registro)) continue
    regUsados.add(registro)
    extras.push({ aoVivo: null, registro })
  }
  for (const { aoVivo: u, registro } of extras) {
    const nome = u?.nome ?? registro.nome
    const ao = registro ? camposAoVivo(registro, agora) : null
    const dados = ao?.temEnergia ? ao : null
    const idUsina = u?.id ?? registro?.solarzId ?? null
    usinas.push(pendente({
      id: idUsina,
      nome,
      cliente: u?.clienteNome ?? registro?.clienteNome ?? null,
      totalInvestido: dados?.totalInvestido ?? null,
      concessionaria: u?.concessionaria ?? registro?.concessionaria ?? null,
      cidade: u?.cidade ?? registro?.cidade ?? null,
      estado: u?.estado ?? registro?.estado ?? null,
      classe: null,
      plano: null,
      potenciaKwp: u?.potenciaInstalada ?? registro?.potenciaKwp ?? null,
      mesAnoRecente: dados?.mesAnoRecente ?? null,
      prognosticoKwhMes: dados?.prognosticoKwhMes ?? null,
      geracaoKwhMes: dados?.geracaoKwhMes ?? null,
      desempenhoMesPct: dados?.desempenhoMesPct ?? null,
      desempenho30dPct: dados?.desempenho30dPct ?? null,
      desempenho12mPct: dados?.desempenho12mPct ?? null,
      desempenhoMedio3mPct: dados?.desempenhoMedio3mPct ?? null,
      statusDesempenho: dados?.statusDesempenho ?? 'Sem dado',
      dataInstalacao: u?.dataInstalacao ?? registro?.dataInstalacao ?? null,
      anoMensal: dados?.anoMensal ?? null,
      mensal: dados?.mensal ?? null,
      mensal2026: dados && dados.anoMensal === 2026 ? dados.mensal : null,
      observacao: dados ? 'Usina identificada apenas na API ao vivo (fora do último relatório mensal).' : (registro?.indisponiveis ?? []).includes('energia') ? OBS_SEM_PREMIUM : OBS_COMPLEMENTAR,
      statusMonitoramento: u?.status ?? registro?.statusMonitoramento ?? null,
      statusMonitoramentoEm: u?.statusEm ?? registro?.statusMonitoramentoEm ?? null,
      energiaGeradaAcumuladaKwh: u?.energiaGeradaKwh ?? registro?.energiaGeradaAcumuladaKwh ?? null,
      latitude: u?.latitude ?? null,
      longitude: u?.longitude ?? null,
      fonte: dados ? 'solarz' : 'relatorio',
      dadoEm: dados ? registro.buscadoEm : null,
      ...complementos(idUsina, nome),
    }))
  }

  // Usinas da conta que não estão no relatório nem na listagem premium (sem monitoramento): entram para fechar o total do parque.
  const conhecidos = new Set(usinas.map((u) => normalizeNomeUsina(u.nome)))
  const idsConhecidos = new Set(usinas.map((u) => String(u.id)))
  for (const s of extra.simples?.usinas ?? []) {
    if (s.arquivada || idsConhecidos.has(String(s.id)) || conhecidos.has(normalizeNomeUsina(s.nome))) continue
    conhecidos.add(normalizeNomeUsina(s.nome))
    usinas.push(pendente({
      id: s.id, nome: s.nome, cliente: null, totalInvestido: null, concessionaria: null, cidade: null, estado: null, classe: null, plano: null, potenciaKwp: null,
      mesAnoRecente: null, prognosticoKwhMes: null, geracaoKwhMes: null, desempenhoMesPct: null, desempenho30dPct: null, desempenho12mPct: null,
      desempenhoMedio3mPct: null, statusDesempenho: 'Sem dado', dataInstalacao: null, anoMensal: null, mensal: null, mensal2026: null,
      observacao: s.premium ? OBS_COMPLEMENTAR : `${OBS_SEM_PREMIUM}; ${OBS_COMPLEMENTAR}`, statusMonitoramento: null, statusMonitoramentoEm: null,
      energiaGeradaAcumuladaKwh: null, latitude: null, longitude: null, fonte: 'relatorio', dadoEm: null, ...complementos(s.id, s.nome),
    }))
  }

  return usinas
}

export function mapTarefa(t) {
  return {
    id: t.id,
    titulo: t.titulo,
    dataInclusao: t.dataInclusao,
    dataEntrega: t.dataEntrega,
    dataInicial: t.dataInicial,
    dataConclusao: t.dataConclusao,
    status: t.status?.nome ?? null,
    statusCor: t.status?.cor ?? null,
    tipo: t.tipo?.nome ?? null,
    tipoCor: t.tipo?.cor ?? null,
    criadoPorNome: t.criadoPorNome,
    projeto: t.projeto,
    projetoId: t.projetoId,
    lead: t.lead,
    responsaveis: (t.membros ?? []).map((m) => m.nome),
    prioridade: t.prioridade,
    bloqueado: t.bloqueado,
    atrasada: calcularAtrasada(t),
  }
}
