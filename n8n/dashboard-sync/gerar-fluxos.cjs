/*
 * Gera quatro rotinas independentes de sincronização Groner -> Dashboard.
 *
 * Os arquivos versionados não contêm tokens nem IDs de credenciais. A
 * publicação só deve acontecer depois que o dashboard implementar o contrato
 * descrito em docs/ARQUITETURA-DASHBOARD-UPSERT.md.
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const OUTPUT_DIR = __dirname
const DASHBOARD_PADRAO = 'https://groner-crm-dashboard-ten.vercel.app'
const ENTIDADES = [
  { slug: 'projetos', recurso: 'Projeto', nome: 'Projetos', cron: '0 8,18 * * *' },
  { slug: 'tarefas', recurso: 'Tarefa', nome: 'Tarefas', cron: '5 8,18 * * *' },
  { slug: 'propostas', recurso: 'PreProposta', nome: 'Propostas', cron: '10 8,18 * * *' },
  { slug: 'vendas', recurso: 'Venda', nome: 'Vendas', cron: '15 8,18 * * *' },
]

const id = () => crypto.randomUUID()
const credencial = (nome, credId) => ({
  httpHeaderAuth: credId ? { id: credId, name: nome } : { name: nome },
})

const settings = {
  executionOrder: 'v1',
  timezone: 'America/Sao_Paulo',
  saveDataSuccessExecution: 'none',
  saveDataErrorExecution: 'none',
  saveManualExecutions: false,
  saveExecutionProgress: false,
}

// $input.first().json funciona em "uma vez para todos os itens"; $json não é garantido nesse modo.
const CONFIGURAR = `const entidade = $input.first().json
const agora = new Date()
return [{ json: {
  runId: entidade.slug + '-' + agora.toISOString().replace(/[-:.]/g, ''),
  runStartedAt: agora.toISOString(),
  slug: entidade.slug,
  recurso: entidade.recurso,
  tamanhoPagina: entidade.slug === 'propostas' ? 100 : 500,
  tamanhoLote: 50,
  detalharProjeto: entidade.slug === 'projetos',
} }]`

const GERAR_PAGINAS = `const cfg = $('Configuração').first().json
const corpo = $input.first().json
const dados = corpo && (corpo.Content || corpo.content || corpo)
const total = Number(dados && (dados.totalItems ?? dados.totalCount ?? dados.total))
if (!Number.isInteger(total) || total < 0) throw new Error('Groner não informou um total válido')
const paginas = Math.max(1, Math.ceil(total / cfg.tamanhoPagina))
if (paginas > 500) throw new Error('Limite de 500 páginas excedido')
return Array.from({ length: paginas }, (_, i) => ({ json: {
  runId: cfg.runId,
  runStartedAt: cfg.runStartedAt,
  slug: cfg.slug,
  recurso: cfg.recurso,
  pageNumber: i + 1,
  pageSize: cfg.tamanhoPagina,
  totalEsperado: total,
  tamanhoLote: cfg.tamanhoLote,
  batchCount: Math.max(1, Math.ceil(total / cfg.tamanhoLote)),
  detalharProjeto: cfg.detalharProjeto,
} }))`

const PREPARAR_LOTES = `const cfg = $('Configuração').first().json
const paginas = $input.all().map((item) => item.json)
const falhas = paginas.filter((p) => !Array.isArray(p.registros))
if (falhas.length) throw new Error('Uma ou mais páginas não retornaram registros válidos')
const totais = new Set(paginas.map((p) => Number(p.totalItems)))
if (totais.size !== 1) throw new Error('O total do Groner mudou durante a paginação; execute novamente')
const totalEsperado = Number([...totais][0])
const registros = paginas.flatMap((p) => p.registros)
const ids = new Set()
for (const registro of registros) {
  const registroId = registro && (registro.id ?? registro.Id)
  if (registroId == null) throw new Error('Registro do Groner sem id')
  const chave = String(registroId)
  if (ids.has(chave)) throw new Error('ID duplicado entre páginas: ' + chave)
  ids.add(chave)
}
if (registros.length !== totalEsperado) {
  throw new Error('Carga incompleta: recebidos ' + registros.length + ' de ' + totalEsperado)
}
const normalizarProjeto = (item) => {
  if (cfg.slug !== 'projetos') return item
  const pick = (...keys) => keys.map((key) => item[key]).find((value) => value !== undefined) ?? null
  const funil = String(pick('funil', 'Etapa') || '').trim()
  const status = String(pick('etapa', 'Status') || '').trim()
  const statusMarco = new Set(['FUNIL ENGENHARIA - CRIAR PROP', 'CRIAR PROJETO->PROPOSTA', 'CRIAR ABORDAGEM', 'APROVAR PROPOSTA CRIADA', 'PENDÊNCIAS TÉCNICAS->PROJETOS', 'APROVAÇÃO TECNICA - VENDA', 'PROPOSTA CRIADA APROVADA', 'AGUARDANDO ASSINATURA', 'DOCUMENTOS PENDENTES', 'PAGAMENTO REALIZADO', 'PIETA_CRIAÇÃO DO PROJETO', 'PIETA_PARECER SOLICITADO', 'PENDENCIA DE HOMOLOGAÇÃO', 'PENDENCIA ICF', 'PENDENCIA DOCUMENTAL/TECNICA', 'PARECER EMITIDO', 'PEDIDO ENTREGUE', 'INSTALADOR HOMOLOGADO', 'AGENDAR INSTALAÇÃO', 'INSTALAÇÃO AGENDADA', 'DIARIO DE OBRA / OBRA ANDAMENTO', 'PENDENCIA DE OBRA', 'PENDENCIA DE INSTALAÇÃO', 'AGUARDANDO VISTORIA', 'PENDENCIA VIST. CONCESSIONARIA', 'RELÓGIO TROCADO', 'INSTALAÇÃO APP MONITORAMENTO', 'APP MONITOR INSTALADO', 'TERMO DE ACEITE', 'TERMO DE ACEITE ASSINADO', 'DOSSIE', 'DOSSIE ENVIADO'])
  const statusNormalizado = status.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/\\s+/g, ' ').trim().toUpperCase()
  const statusNoMapa = [...statusMarco].some((valor) => valor.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/\\s+/g, ' ').trim().toUpperCase() === statusNormalizado)
  const noFluxo = /^(04\\.|06\\.|07\\.|08\\.|09\\.|10\\.|11\\.)/.test(funil)
    && statusNoMapa
    && (!(funil.startsWith('04.') && statusNormalizado !== 'FUNIL ENGENHARIA - CRIAR PROP') ? 'sim' : 'não')
  return {
    ...item,
    id: Number(item.id ?? item.Id ?? item['Código']),
    funil: pick('funil', 'Etapa'),
    etapa: pick('etapa', 'Status'),
    cidade: pick('cidade', 'Cidade'),
    estado: pick('estado', 'Estado'),
    concessionaria: pick('concessionaria', 'Concessionária'),
    dataVenda: pick('dataVenda', 'Data da venda'),
    dataAceiteProposta: pick('dataAceiteProposta', 'Data de aceite da proposta'),
    kwp: pick('kwp', 'Proposta Aceita Potência'),
    geracaoMensalPrevista: pick('geracaoMensalPrevista', 'Proposta Aceita Geração mensal'),
    valorPrePropostaAceita: pick('valorPrePropostaAceita', 'Proposta Aceita Valor'),
    tecnico: pick('tecnico', 'Técnico'),
    projetista: pick('projetista', 'Projetista'),
    homologador: pick('homologador', 'Homologador'),
    vendedorResponsavel: pick('vendedorResponsavel', 'Vendedor'),
    uc: pick('uc', 'Código da unidade consumidora'),
    donoNominal: item.donoNominal ?? item['Dono nominal'] ?? pick('tecnico', 'Técnico') ?? pick('projetista', 'Projetista') ?? pick('homologador', 'Homologador'),
    dataEntradaStatus: item.dataEntradaStatus ?? item['Data de entrada no status'] ?? item.dataUltimoStatus ?? null,
    noFluxoEngenharia: item.noFluxoEngenharia ?? item['No fluxo da Engenharia'] ?? noFluxo,
  }
}
registros = registros.map(normalizarProjeto)
registros.sort((a, b) => Number(a.id ?? a.Id) - Number(b.id ?? b.Id))
const lotes = []
for (let i = 0; i < registros.length; i += cfg.tamanhoLote) lotes.push(registros.slice(i, i + cfg.tamanhoLote))
if (!lotes.length) lotes.push([])
return lotes.map((items, indice) => ({ json: {
  runId: cfg.runId,
  runStartedAt: cfg.runStartedAt,
  entity: cfg.slug,
  batchIndex: indice + 1,
  batchCount: lotes.length,
  expectedTotal: totalEsperado,
  items,
} }))`

const NORMALIZAR_PROJETO = PREPARAR_LOTES.match(/const normalizarProjeto = ([\s\S]*?)\nregistros = registros\.map/)[1]
// Parâmetros da carga vêm do gatilho do subfluxo; a saída da página só traz os registros.
const PROCESSAR_PAGINA = String.raw`const entrada = $('Chamado pela rotina').first().json
const pagina = $input.first().json
if (!Array.isArray(pagina.registros)) throw new Error('Página sem registros')
if (entrada.pageSize % entrada.tamanhoLote !== 0) throw new Error('pageSize deve ser múltiplo de tamanhoLote')
// normalizarProjeto vem do código antigo e lê cfg.slug.
const cfg = entrada
const normalizarProjeto = ${NORMALIZAR_PROJETO}
const registros = pagina.registros.map((item) => entrada.slug === 'projetos' ? normalizarProjeto(item) : item)
const lotes = []
for (let i = 0; i < registros.length; i += entrada.tamanhoLote) lotes.push(registros.slice(i, i + entrada.tamanhoLote))
if (!lotes.length) lotes.push([])
const porPagina = entrada.pageSize / entrada.tamanhoLote
return lotes.map((items, indice) => ({ json: {
  runId: entrada.runId,
  runStartedAt: entrada.runStartedAt,
  entity: entrada.slug,
  batchIndex: (entrada.pageNumber - 1) * porPagina + indice + 1,
  batchCount: entrada.batchCount,
  expectedTotal: entrada.totalEsperado,
  items,
} }))`

const CONTAR_PAGINA = String.raw`const entrada = $('Chamado pela rotina').first().json
const respostas = $input.all().map((item) => item.json)
if (!respostas.length) throw new Error('Dashboard não confirmou nenhum lote')
for (const resposta of respostas) {
  if (resposta.ok !== true || resposta.runId !== entrada.runId) throw new Error('Dashboard rejeitou ou não confirmou um lote')
}
const soma = (campo) => respostas.reduce((total, r) => total + Number(r[campo] || 0), 0)
// totalItems = o que o Groner informou nesta página, para detectar mudança de total no meio da carga.
const totalNaPagina = Number($('Extrair página').first().json.totalItems)
return [{ json: { pageNumber: entrada.pageNumber, received: soma('received'), inserted: soma('inserted'), updated: soma('updated'), unchanged: soma('unchanged'), totalItems: totalNaPagina } }]`

// Total e número de lotes são calculados em "Gerar páginas", não na configuração.
const SOMAR_PAGINAS = String.raw`const cfg = $('Gerar páginas').first().json
const paginas = $input.all().map((item) => item.json)
if (!paginas.length) throw new Error('Nenhuma página foi processada')
const totais = new Set(paginas.map((pagina) => Number(pagina.totalItems)))
const esperado = Number(cfg.totalEsperado)
if (totais.size !== 1 || Number([...totais][0]) !== esperado) throw new Error('O total do Groner mudou durante a paginação')
const received = paginas.reduce((total, pagina) => total + Number(pagina.received || 0), 0)
if (received !== esperado) throw new Error('Carga incompleta: recebidos ' + received + ' de ' + esperado)
return [{ json: { runId: cfg.runId, runStartedAt: cfg.runStartedAt, entity: cfg.slug, batchCount: cfg.batchCount, expectedTotal: cfg.totalEsperado, inserted: paginas.reduce((t, p) => t + Number(p.inserted || 0), 0), updated: paginas.reduce((t, p) => t + Number(p.updated || 0), 0), unchanged: paginas.reduce((t, p) => t + Number(p.unchanged || 0), 0) } }]`

const VALIDAR_RESPOSTAS = `const cfg = $('Configuração').first().json
const respostas = $input.all().map((item) => item.json)
if (!respostas.length) throw new Error('Dashboard não confirmou nenhum lote')
for (const resposta of respostas) {
  if (resposta.ok !== true || resposta.runId !== cfg.runId) {
    throw new Error('Dashboard rejeitou ou não confirmou um lote')
  }
}
const soma = (campo) => respostas.reduce((total, r) => total + Number(r[campo] || 0), 0)
return [{ json: {
  runId: cfg.runId,
  runStartedAt: cfg.runStartedAt,
  entity: cfg.slug,
  batchCount: respostas.length,
  expectedTotal: Number(respostas[0].expectedTotal),
  inserted: soma('inserted'),
  updated: soma('updated'),
  unchanged: soma('unchanged'),
} }]`

const EXTRAIR_PAGINA = `const entrada = $('Chamado pela rotina').first().json
const corpo = $input.first().json
const dados = corpo && (corpo.Content || corpo.content || corpo)
const registros = dados && (dados.list || dados.items || dados.data)
if (!Array.isArray(registros)) throw new Error('Formato de página desconhecido no Groner')
return [{ json: {
  pageNumber: entrada.pageNumber,
  totalItems: Number(dados.totalItems ?? dados.totalCount ?? dados.total),
  registros,
  detalharProjeto: entrada.detalharProjeto === true && registros.some((registro) => {
    const status = String(registro.status?.nome ?? registro.status ?? registro.etapa ?? '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/\\s+/g, ' ').trim().toUpperCase()
    return new Set(['FUNIL ENGENHARIA - CRIAR PROP', 'CRIAR PROJETO->PROPOSTA', 'CRIAR ABORDAGEM', 'APROVAR PROPOSTA CRIADA', 'PENDENCIAS TECNICAS->PROJETOS', 'APROVACAO TECNICA - VENDA', 'PROPOSTA CRIADA APROVADA', 'AGUARDANDO ASSINATURA', 'DOCUMENTOS PENDENTES', 'PAGAMENTO REALIZADO', 'PIETA_CRIACAO DO PROJETO', 'PIETA_PARECER SOLICITADO', 'PENDENCIA DE HOMOLOGACAO', 'PENDENCIA ICF', 'PENDENCIA DOCUMENTAL/TECNICA', 'PARECER EMITIDO', 'PEDIDO ENTREGUE', 'INSTALADOR HOMOLOGADO', 'AGENDAR INSTALACAO', 'INSTALACAO AGENDADA', 'DIARIO DE OBRA / OBRA ANDAMENTO', 'PENDENCIA DE OBRA', 'PENDENCIA DE INSTALACAO', 'AGUARDANDO VISTORIA', 'PENDENCIA VIST. CONCESSIONARIA', 'RELOGIO TROCADO', 'INSTALACAO APP MONITORAMENTO', 'APP MONITOR INSTALADO', 'TERMO DE ACEITE', 'TERMO DE ACEITE ASSINADO', 'DOSSIE', 'DOSSIE ENVIADO']).has(status)
  }),
} }]`

const EXPANDIR_DETALHES = `const pagina = $input.first().json
const statusMarco = new Set(['FUNIL ENGENHARIA - CRIAR PROP', 'CRIAR PROJETO->PROPOSTA', 'CRIAR ABORDAGEM', 'APROVAR PROPOSTA CRIADA', 'PENDENCIAS TECNICAS->PROJETOS', 'APROVACAO TECNICA - VENDA', 'PROPOSTA CRIADA APROVADA', 'AGUARDANDO ASSINATURA', 'DOCUMENTOS PENDENTES', 'PAGAMENTO REALIZADO', 'PIETA_CRIACAO DO PROJETO', 'PIETA_PARECER SOLICITADO', 'PENDENCIA DE HOMOLOGACAO', 'PENDENCIA ICF', 'PENDENCIA DOCUMENTAL/TECNICA', 'PARECER EMITIDO', 'PEDIDO ENTREGUE', 'INSTALADOR HOMOLOGADO', 'AGENDAR INSTALACAO', 'INSTALACAO AGENDADA', 'DIARIO DE OBRA / OBRA ANDAMENTO', 'PENDENCIA DE OBRA', 'PENDENCIA DE INSTALACAO', 'AGUARDANDO VISTORIA', 'PENDENCIA VIST. CONCESSIONARIA', 'RELOGIO TROCADO', 'INSTALACAO APP MONITORAMENTO', 'APP MONITOR INSTALADO', 'TERMO DE ACEITE', 'TERMO DE ACEITE ASSINADO', 'DOSSIE', 'DOSSIE ENVIADO'].map((status) => status.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toUpperCase()))
const normalizar = (value) => String(value ?? '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/\\s+/g, ' ').trim().toUpperCase()
return pagina.registros.filter((registro) => statusMarco.has(normalizar(registro.status?.nome ?? registro.status ?? registro.etapa))).map((registro) => ({ json: { pageNumber: pagina.pageNumber, totalItems: pagina.totalItems, registro } }))`

const CONSOLIDAR_DETALHES = `const pagina = $('Extrair página').first().json
const selecionados = $('Expandir projetos').all()
const detalhes = $('Buscar detalhe do projeto').all()
const campos = $input.all()
const idDoItem = (item, fallback) => String(item.json?.id ?? item.json?.projetoId ?? item.json?.projeto?.id ?? (item.pairedItem?.item != null ? selecionados[item.pairedItem.item]?.json?.registro?.id : fallback) ?? '')
const porId = new Map()
for (const [indice, item] of selecionados.entries()) {
  const id = String(item.json.registro.id ?? item.json.registro.Id)
  const detalhe = detalhes.find((resposta) => idDoItem(resposta, null) === id)?.json ?? {}
  const campo = campos.find((resposta) => idDoItem(resposta, null) === id)?.json ?? {}
  // O detalhe vai inteiro no campo detalhe: espalhado, ele sobrescrevia datas e cidade da listagem.
  porId.set(id, { detalhe, camposPersonalizados: campo })
}
return [{ json: { pageNumber: pagina.pageNumber, totalItems: pagina.totalItems, registros: pagina.registros.map((registro) => ({ ...registro, ...(porId.get(String(registro.id ?? registro.Id)) ?? {}) })) } }]`

const SAIDA_PAGINA = `const itens = $input.all().map((item) => item.json)
if (itens.length === 1 && Array.isArray(itens[0].registros)) return itens
const pagina = $('Extrair página').first().json
return [{ json: { pageNumber: pagina.pageNumber, totalItems: pagina.totalItems, registros: itens } }]`

function subfluxo({ tenant, dashboardUrl, credGroner, credDashboard }) {
  const api = `https://${tenant}.api.groner.app/api`
  const base = dashboardUrl.replace(/\/+$/, '')
  return {
    name: 'Groner Dashboard - Buscar uma página',
    nodes: [
      {
        id: id(), name: 'Detalhar projeto?', type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [720, 0],
        parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ id: id(), leftValue: '={{ $json.detalharProjeto }}', rightValue: true, operator: { type: 'boolean', operation: 'true' } }], combinator: 'and' }, options: {} },
      },
      {
        id: id(), name: 'Chamado pela rotina', type: 'n8n-nodes-base.executeWorkflowTrigger',
        typeVersion: 1.1, position: [0, 0], parameters: { inputSource: 'passthrough' },
      },
      {
        id: id(), name: 'Buscar página no Groner', type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4.2, position: [240, 0], retryOnFail: true, maxTries: 3,
        waitBetweenTries: 5000,
        credentials: credencial('GronerZap - Groner API leitura', credGroner),
        parameters: {
          url: `={{ '${api}/' + $json.recurso }}`,
          authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
          sendQuery: true,
          queryParameters: { parameters: [
            { name: 'pageNumber', value: '={{ $json.pageNumber }}' },
            { name: 'pageSize', value: '={{ $json.pageSize }}' },
          ] },
          options: { timeout: 60000 },
        },
      },
      {
        id: id(), name: 'Extrair página', type: 'n8n-nodes-base.code',
        typeVersion: 2, position: [480, 0],
        parameters: { mode: 'runOnceForAllItems', jsCode: EXTRAIR_PAGINA },
      },
      {
        id: id(), name: 'Expandir projetos', type: 'n8n-nodes-base.code', typeVersion: 2, position: [960, -120],
        parameters: { mode: 'runOnceForAllItems', jsCode: EXPANDIR_DETALHES },
      },
      {
        id: id(), name: 'Buscar detalhe do projeto', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [1200, -120],
        credentials: credencial('GronerZap - Groner API leitura', credGroner), retryOnFail: true, maxTries: 3, waitBetweenTries: 5000,
        parameters: { url: `={{ '${api}/Projeto/' + $json.registro.id }}`, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', options: { timeout: 60000 } },
      },
      {
        id: id(), name: 'Buscar campos personalizados', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [1440, -120],
        credentials: credencial('GronerZap - Groner API leitura', credGroner), retryOnFail: true, maxTries: 3, waitBetweenTries: 5000,
        parameters: { url: `={{ '${api}/CampoPersonalizado/Projeto/' + $('Expandir projetos').item.json.registro.id + '/Agrupado' }}`, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', options: { timeout: 60000 } },
      },
      {
        id: id(), name: 'Consolidar detalhes', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1680, -120],
        parameters: { mode: 'runOnceForAllItems', jsCode: CONSOLIDAR_DETALHES },
      },
      { id: id(), name: 'Saída da página', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1920, 0], parameters: { mode: 'runOnceForAllItems', jsCode: SAIDA_PAGINA } },
      { id: id(), name: 'Processar lotes da página', type: 'n8n-nodes-base.code', typeVersion: 2, position: [2160, 0], parameters: { mode: 'runOnceForAllItems', jsCode: PROCESSAR_PAGINA } },
      { id: id(), name: 'Enviar lote da página', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [2400, 0], retryOnFail: true, maxTries: 3, waitBetweenTries: 5000, credentials: credencial('Groner Dashboard - Sync', credDashboard), parameters: { method: 'POST', url: `={{ '${base}/api/sync/groner/' + $json.entity + '/batches' }}`, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json) }}', options: { timeout: 60000 } } },
      { id: id(), name: 'Validar lote da página', type: 'n8n-nodes-base.code', typeVersion: 2, position: [2640, 0], parameters: { mode: 'runOnceForAllItems', jsCode: `const runId = $('Chamado pela rotina').first().json.runId
const respostas = $input.all().map((item) => item.json)
for (const resposta of respostas) if (resposta.ok !== true || resposta.runId !== runId) throw new Error('Dashboard rejeitou ou não confirmou um lote')
return respostas.map((resposta) => ({ json: resposta }))` } },
      { id: id(), name: 'Contar página processada', type: 'n8n-nodes-base.code', typeVersion: 2, position: [2880, 0], parameters: { mode: 'runOnceForAllItems', jsCode: CONTAR_PAGINA } },
    ],
    connections: {
      'Extrair página': { main: [[{ node: 'Detalhar projeto?', type: 'main', index: 0 }]] },
      'Detalhar projeto?': { main: [[{ node: 'Expandir projetos', type: 'main', index: 0 }], [{ node: 'Saída da página', type: 'main', index: 0 }]] },
      'Expandir projetos': { main: [[{ node: 'Buscar detalhe do projeto', type: 'main', index: 0 }]] },
      'Buscar detalhe do projeto': { main: [[{ node: 'Buscar campos personalizados', type: 'main', index: 0 }]] },
      'Buscar campos personalizados': { main: [[{ node: 'Consolidar detalhes', type: 'main', index: 0 }]] },
      'Consolidar detalhes': { main: [[{ node: 'Saída da página', type: 'main', index: 0 }]] },
      'Chamado pela rotina': { main: [[{ node: 'Buscar página no Groner', type: 'main', index: 0 }]] },
      'Buscar página no Groner': { main: [[{ node: 'Extrair página', type: 'main', index: 0 }]] },
      'Saída da página': { main: [[{ node: 'Processar lotes da página', type: 'main', index: 0 }]] },
      'Processar lotes da página': { main: [[{ node: 'Enviar lote da página', type: 'main', index: 0 }]] },
      'Enviar lote da página': { main: [[{ node: 'Validar lote da página', type: 'main', index: 0 }]] },
      'Validar lote da página': { main: [[{ node: 'Contar página processada', type: 'main', index: 0 }]] },
    },
    settings,
  }
}

function fluxoEntidade({ entidade, tenant, dashboardUrl, subfluxoId, credGroner, credDashboard }) {
  const api = `https://${tenant}.api.groner.app/api`
  const base = dashboardUrl.replace(/\/+$/, '')
  const dadosEntidade = JSON.stringify({ slug: entidade.slug, recurso: entidade.recurso })
  return {
    name: `Groner Dashboard - Sincronizar ${entidade.nome}`,
    nodes: [
      { id: id(), name: 'Executar manualmente', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [0, 0], parameters: {} },
      {
        id: id(), name: 'Agenda 08h e 18h (aguarda ativação)', type: 'n8n-nodes-base.scheduleTrigger',
        typeVersion: 1.2, position: [0, 180], disabled: true,
        parameters: { rule: { interval: [{ field: 'cronExpression', expression: entidade.cron }] } },
        notes: 'Horários escalonados em 5 minutos para não sobrecarregar os workers nem a API do Groner.',
      },
      {
        id: id(), name: 'Entidade', type: 'n8n-nodes-base.code', typeVersion: 2,
        position: [240, 90], parameters: { mode: 'runOnceForAllItems', jsCode: `return [{ json: ${dadosEntidade} }]` },
      },
      {
        id: id(), name: 'Configuração', type: 'n8n-nodes-base.code', typeVersion: 2,
        position: [480, 90], parameters: { mode: 'runOnceForAllItems', jsCode: CONFIGURAR },
      },
      {
        id: id(), name: 'Consultar total', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
        position: [720, 90], retryOnFail: true, maxTries: 3, waitBetweenTries: 5000,
        credentials: credencial('GronerZap - Groner API leitura', credGroner),
        parameters: {
          url: `={{ '${api}/' + $json.recurso }}`,
          authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
          sendQuery: true,
          queryParameters: { parameters: [
            { name: 'pageNumber', value: '1' },
            { name: 'pageSize', value: '1' },
          ] },
          options: { timeout: 60000 },
        },
      },
      {
        id: id(), name: 'Gerar páginas', type: 'n8n-nodes-base.code', typeVersion: 2,
        position: [960, 90], parameters: { mode: 'runOnceForAllItems', jsCode: GERAR_PAGINAS },
      },
      {
        id: id(), name: 'Buscar páginas separadamente', type: 'n8n-nodes-base.executeWorkflow',
        typeVersion: 1.2, position: [1200, 90],
        parameters: {
          workflowId: { __rl: true, value: subfluxoId, mode: 'id', cachedResultName: 'Groner Dashboard - Buscar uma página' },
          workflowInputs: { mappingMode: 'defineBelow', value: {}, matchingColumns: [], schema: [], attemptToConvertTypes: false, convertFieldsToString: true },
          mode: 'each', options: { waitForSubWorkflow: true },
        },
      },
      {
        id: id(), name: 'Somar e validar paginas', type: 'n8n-nodes-base.code', typeVersion: 2,
        position: [1440, 90], parameters: { mode: 'runOnceForAllItems', jsCode: SOMAR_PAGINAS },
      },
      {
        id: id(), name: 'Finalizar carga completa', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
        position: [2160, 90], retryOnFail: true, maxTries: 3, waitBetweenTries: 5000,
        credentials: credencial('Groner Dashboard - Sync', credDashboard),
        parameters: {
          method: 'POST', url: `={{ '${base}/api/sync/groner/' + $json.entity + '/finalize' }}`,
          authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
          sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json) }}',
          options: { timeout: 60000 },
        },
        notes: 'Somente este passo pode marcar como removidos registros que não apareceram na carga completa.',
      },
    ],
    connections: {
      'Executar manualmente': { main: [[{ node: 'Entidade', type: 'main', index: 0 }]] },
      'Agenda 08h e 18h (aguarda ativação)': { main: [[{ node: 'Entidade', type: 'main', index: 0 }]] },
      Entidade: { main: [[{ node: 'Configuração', type: 'main', index: 0 }]] },
      Configuração: { main: [[{ node: 'Consultar total', type: 'main', index: 0 }]] },
      'Consultar total': { main: [[{ node: 'Gerar páginas', type: 'main', index: 0 }]] },
      'Gerar páginas': { main: [[{ node: 'Buscar páginas separadamente', type: 'main', index: 0 }]] },
      'Buscar páginas separadamente': { main: [[{ node: 'Somar e validar paginas', type: 'main', index: 0 }]], },
      'Somar e validar paginas': { main: [[{ node: 'Finalizar carga completa', type: 'main', index: 0 }]] },
    },
    settings,
  }
}

function fluxoAlteracoes({ tenant, dashboardUrl, credGroner, credDashboard }) {
  const api = `https://${tenant}.api.groner.app/api`
  const base = dashboardUrl.replace(/\/+$/, '')
  const cfg = `const agora = new Date()
const cursor = $('Ler cursor').first().json.cursor
const margem = 10 * 60 * 1000
const inicio = cursor ? new Date(new Date(cursor).getTime() - margem) : new Date(agora.getTime() - margem)
return [{ json: { entity: 'projetos', runId: 'changes-' + agora.toISOString().replace(/[-:.]/g, ''), runStartedAt: agora.toISOString(), cursorAnterior: cursor, cursorInicio: inicio.toISOString(), nextCursor: agora.toISOString(), maxPaginas: 10, pageSize: 500 } }]`
  // Para de paginar quando a página vem vazia ou o último card (o mais antigo, pela ordenação)
  // é anterior ao cursor. Datas do Groner vêm em horário de Brasília sem offset.
  const paginaFinal = "={{ (() => { const l = ($response.body.Content || $response.body).list || []; if (!l.length) return true; const d = String(l[l.length - 1].dataUltimaAtualizacao || ''); return Date.parse(/[zZ]|[+-]\\d{2}:?\\d{2}$/.test(d) ? d : d + '-03:00') < Date.parse($json.cursorInicio) })() }}"
  const extrair = `const cfg = $('Configuração').first().json
const paginas = $input.all().map((item) => item.json)
const registrosPorPagina = paginas.map((pagina) => {
  const corpo = pagina.Content || pagina.content || pagina
  return corpo.list || corpo.items || corpo.data
})
if (registrosPorPagina.some((registros) => !Array.isArray(registros))) throw new Error('Formato de alterações desconhecido no Groner')
const parseDataGroner = (value) => {
  if (typeof value !== 'string') return NaN
  const texto = value.trim()
  return Date.parse(/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?$/.test(texto) ? texto + '-03:00' : texto)
}
const inicio = Date.parse(cfg.cursorInicio)
const todos = registrosPorPagina.flat()
const alterados = todos.filter((registro) => parseDataGroner(registro.dataUltimaAtualizacao ?? registro.updatedAt ?? '') >= inicio)
const ultimaPagina = registrosPorPagina.at(-1) ?? []
const ultimaData = ultimaPagina.map((registro) => parseDataGroner(registro.dataUltimaAtualizacao ?? registro.updatedAt ?? '')).filter(Number.isFinite).sort((a, b) => b - a)[0]
if (paginas.length === cfg.maxPaginas && ultimaData >= inicio) throw new Error('Limite de páginas incrementais atingido; carga completa obrigatória')
return [{ json: { entity: cfg.entity, runId: cfg.runId, runStartedAt: cfg.runStartedAt, nextCursor: cfg.nextCursor, items: alterados } }]`
  const expandir = `const item = $input.first().json
return item.items.map((registro) => ({ json: { registro } }))`
  const consolidar = `const originais = $('Expandir alterações').all()
const detalhes = $('Buscar detalhe dos alterados').all()
const campos = $('Buscar campos personalizados dos alterados').all()
const corpo = (item) => item?.json?.Content || item?.json?.content || item?.json || {}
return originais.map((item, index) => ({ json: { ...item.json.registro, detalhe: corpo(detalhes[index]), camposPersonalizados: corpo(campos[index]) } }))`
  const validar = `const cfg = $('Configuração').first().json
const items = $input.all().map((item) => item.json)
return [{ json: { entity: cfg.entity, runId: cfg.runId, runStartedAt: cfg.runStartedAt, nextCursor: cfg.nextCursor, items, received: items.length } }]`
  return {
    name: 'Groner Dashboard - Sincronizar alterações (5 min)',
    nodes: [
      { id: id(), name: 'Executar manualmente', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [0, 0], parameters: {} },
      { id: id(), name: 'Agenda a cada 5 minutos (aguarda ativação)', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [0, 180], disabled: true, parameters: { rule: { interval: [{ field: 'cronExpression', expression: '*/5 * * * *' }] } }, notes: 'Ativar somente depois de validar credenciais e limites do Groner/Upstash.' },
      { id: id(), name: 'Ler cursor', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [240, 90], credentials: credencial('Groner Dashboard - Sync', credDashboard), parameters: { url: `={{ '${base}/api/sync/groner/projetos/cursor' }}`, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', options: { timeout: 30000 } } },
      { id: id(), name: 'Configuração', type: 'n8n-nodes-base.code', typeVersion: 2, position: [480, 90], parameters: { mode: 'runOnceForAllItems', jsCode: cfg } },
      { id: id(), name: 'Buscar página alterada', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [960, 90], retryOnFail: true, maxTries: 3, waitBetweenTries: 5000, credentials: credencial('GronerZap - Groner API leitura', credGroner), parameters: { url: `={{ '${api}/Projeto' }}`, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendQuery: true, queryParameters: { parameters: [{ name: 'pageSize', value: '={{ $json.pageSize }}' }, { name: 'ordenarPor', value: 'DataAtualizacao_DESC' }] }, options: { timeout: 60000, pagination: { pagination: { paginationMode: 'updateAParameterInEachRequest', parameters: { parameters: [{ type: 'qs', name: 'pageNumber', value: '={{ $pageCount + 1 }}' }] }, paginationCompleteWhen: 'other', completeExpression: paginaFinal, limitPagesFetched: true, maxRequests: 10, requestInterval: 0 } } } }, notes: 'Pagina só enquanto o último card da página ainda é mais novo que o cursor (normalmente 1 chamada). Nao envia dataInicio/dataFim (ignorados pelo Groner) nem ordem: a direcao esta no enum DataAtualizacao_DESC. Datas sem offset do Groner sao America/Sao_Paulo. Limite de 10 paginas; se atingido, exige carga completa.' },
      { id: id(), name: 'Extrair alterações', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1200, 90], parameters: { mode: 'runOnceForAllItems', jsCode: extrair } },
      { id: id(), name: 'Expandir alterações', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1440, 90], parameters: { mode: 'runOnceForAllItems', jsCode: expandir } },
      { id: id(), name: 'Buscar detalhe dos alterados', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [1680, 90], retryOnFail: true, maxTries: 3, waitBetweenTries: 5000, credentials: credencial('GronerZap - Groner API leitura', credGroner), parameters: { url: `={{ '${api}/Projeto/' + $json.registro.id }}`, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', options: { timeout: 60000 } } },
      { id: id(), name: 'Buscar campos personalizados dos alterados', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [1920, 90], retryOnFail: true, maxTries: 3, waitBetweenTries: 5000, credentials: credencial('GronerZap - Groner API leitura', credGroner), parameters: { url: `={{ '${api}/CampoPersonalizado/Projeto/' + $('Expandir alterações').item.json.registro.id + '/Agrupado' }}`, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', options: { timeout: 60000 } } },
      { id: id(), name: 'Consolidar alterações', type: 'n8n-nodes-base.code', typeVersion: 2, position: [2160, 90], parameters: { mode: 'runOnceForAllItems', jsCode: consolidar } },
      { id: id(), name: 'Validar alterações', type: 'n8n-nodes-base.code', typeVersion: 2, position: [2400, 90], parameters: { mode: 'runOnceForAllItems', jsCode: validar } },
      { id: id(), name: 'Upsert incremental', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [2640, 90], retryOnFail: true, maxTries: 3, waitBetweenTries: 5000, credentials: credencial('Groner Dashboard - Sync', credDashboard), parameters: { method: 'POST', url: `={{ '${base}/api/sync/groner/projetos/changes' }}`, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json) }}', options: { timeout: 60000 } }, notes: 'A resposta skipped=true indica trava da carga completa ou outra execução incremental.' },
    ],
    connections: {
      'Executar manualmente': { main: [[{ node: 'Ler cursor', type: 'main', index: 0 }]] },
      'Agenda a cada 5 minutos (aguarda ativação)': { main: [[{ node: 'Ler cursor', type: 'main', index: 0 }]] },
      'Ler cursor': { main: [[{ node: 'Configuração', type: 'main', index: 0 }]] },
      'Configuração': { main: [[{ node: 'Buscar página alterada', type: 'main', index: 0 }]] },
      'Buscar página alterada': { main: [[{ node: 'Extrair alterações', type: 'main', index: 0 }]] },
      'Extrair alterações': { main: [[{ node: 'Expandir alterações', type: 'main', index: 0 }]] },
      'Expandir alterações': { main: [[{ node: 'Buscar detalhe dos alterados', type: 'main', index: 0 }]] },
      'Buscar detalhe dos alterados': { main: [[{ node: 'Buscar campos personalizados dos alterados', type: 'main', index: 0 }]] },
      'Buscar campos personalizados dos alterados': { main: [[{ node: 'Consolidar alterações', type: 'main', index: 0 }]] },
      'Consolidar alterações': { main: [[{ node: 'Validar alterações', type: 'main', index: 0 }]] },
      'Validar alterações': { main: [[{ node: 'Upsert incremental', type: 'main', index: 0 }]] },
    },
    settings,
  }
}

function seguroParaGit(obj, tenant) {
  return JSON.stringify(obj, null, 2).replaceAll(tenant, '{tenant}') + '\n'
}

function escreverJson(nome, obj, tenant) {
  fs.writeFileSync(path.join(OUTPUT_DIR, nome), seguroParaGit(obj, tenant))
}

async function main() {
  const publicar = process.argv.includes('--publicar')
  const tenant = process.env.GRONER_TENANT || '{tenant}'
  const dashboardUrl = process.env.GRONER_DASHBOARD_URL || DASHBOARD_PADRAO
  const credGroner = publicar ? process.env.N8N_CREDENCIAL_GRONER_ID : undefined
  const credDashboard = publicar ? process.env.N8N_CREDENCIAL_DASHBOARD_ID : undefined
  if (publicar && (!process.env.N8N_URL || !process.env.N8N_API_KEY || !credGroner || !credDashboard || tenant === '{tenant}')) {
    throw new Error('Publicação exige N8N_URL, N8N_API_KEY, GRONER_TENANT, N8N_CREDENCIAL_GRONER_ID e N8N_CREDENCIAL_DASHBOARD_ID')
  }

  let subfluxoId = process.env.N8N_FLUXO_DASHBOARD_PAGINA || '{dashboardPaginaWorkflowId}'
  let sub = subfluxo({ tenant, dashboardUrl, credGroner, credDashboard })
  const incremental = fluxoAlteracoes({ tenant, dashboardUrl, credGroner, credDashboard })
  const pais = []

  if (publicar) {
    const base = process.env.N8N_URL.replace(/\/+$/, '')
    const headers = { 'X-N8N-API-KEY': process.env.N8N_API_KEY, 'Content-Type': 'application/json' }
    const lista = await fetch(`${base}/api/v1/workflows?limit=100`, { headers }).then((r) => r.json())
    const existentes = new Map((lista.data || []).map((w) => [w.name, w.id]))
    async function salvar(workflow) {
      const workflowId = existentes.get(workflow.name)
      const resposta = await fetch(`${base}/api/v1/workflows${workflowId ? `/${workflowId}` : ''}`, {
        method: workflowId ? 'PUT' : 'POST', headers, body: JSON.stringify(workflow),
      })
      const json = await resposta.json()
      if (!resposta.ok) throw new Error(`N8N respondeu ${resposta.status}: ${JSON.stringify(json).slice(0, 500)}`)
      return json
    }
    const salvoSub = await salvar(sub)
    subfluxoId = salvoSub.id
    sub.id = subfluxoId
    await salvar(fluxoAlteracoes({ tenant, dashboardUrl, credGroner, credDashboard }))
    for (const entidade of ENTIDADES) {
      const salvo = await salvar(fluxoEntidade({ entidade, tenant, dashboardUrl, subfluxoId, credGroner, credDashboard }))
      pais.push({ entidade, workflow: salvo })
    }
  } else {
    sub.id = subfluxoId
    for (const entidade of ENTIDADES) {
      pais.push({ entidade, workflow: fluxoEntidade({ entidade, tenant, dashboardUrl, subfluxoId }) })
    }
  }

  escreverJson('buscar-pagina.json', sub, tenant)
  escreverJson('sincronizar-alteracoes.json', incremental, tenant)
  for (const { entidade, workflow } of pais) escreverJson(`sincronizar-${entidade.slug}.json`, workflow, tenant)
  console.log('Fluxos escritos em n8n/dashboard-sync (todos com agenda desativada).')
}

main().catch((erro) => {
  console.error(erro.message)
  process.exit(1)
})
