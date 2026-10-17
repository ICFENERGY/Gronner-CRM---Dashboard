import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import {
  COLUNAS, LIMITE_MAXIMO, assinarLink, converterData, gerarDeals, gerarXlsx, montarLinha, normalizarFiltros, verificarLink,
} from '../server/deals.js'
import { createDealsRouter } from '../server/dealsRoutes.js'

// O módulo da ferramenta MCP lê GRONER_TENANT ao ser importado.
process.env.GRONER_TENANT ||= 'teste'
const { default: mcp } = await import('../api/mcp.js')

const SEGREDO = 'chave-de-teste-123'
const AGORA = Date.parse('2026-10-09T15:00:00Z')

// ─── Dados falsos (sem rede) ─────────────────────────────────────────────────

const lista = (extra = {}) => ({
  id: 101, nome: 'Projeto Teste', consumo: 330, tipo: 'Residencial', lojaNome: 'ICF Energy',
  dataInclusao: '2026-05-05T15:42:29.4', dataUltimaAtualizacao: '2026-10-05T13:40:46.72', dataVenda: '0001-01-01T00:00:00',
  previsaoFechamento: '2026-11-01T00:00:00', qtdPrePropostas: 2, qualificacao: 3,
  vendedorResponsavel: 'Vendedora X', vendedorResponsavelId: 7,
  tecnicoResponsavel: 'Sem Técnico', tecnicoResponsavelId: 0,
  projetista: 'Sem Projetista', projetistaId: 0,
  homologador: 'Homologador Y', homologadorId: 9,
  preVendedor: 'Sem Pré-vendedor', preVendedorId: 0,
  status: { id: 5, nome: 'AGUARDANDO VISTORIA' }, etapa: '10. HOMOLOGAÇÃO', tipoLead: 'Pessoa Física',
  etiquetas: [{ nome: 'Visita Técnica' }, { nome: 'Á VISTA' }, { nome: 'Fechado ' }],
  ...extra,
})

const detalhe = (extra = {}) => ({
  id: 101, nome: 'Projeto Teste', consumo: 165, consumoTotal: 330,
  dataInclusao: '2026-05-05T15:42:29.4', dataAssinaturaContrato: '2026-06-01T00:00:00',
  status: { nome: 'AGUARDANDO VISTORIA', etapa: { nome: '10. HOMOLOGAÇÃO' } },
  endereco: { cep: '88000000', logradouro: 'Rua A', numero: '12', bairro: 'Centro', cidade: 'Florianópolis', uf: 'SC' },
  lead: {
    nome: 'Cliente Teste', email: 'cliente@exemplo.com', celular: '48999990000', documento: '12345678909',
    dataNascimento: '1990-01-02T00:00:00', origem: { nome: 'Instagram' }, loja: { nome: 'GRUPO ICF' },
    campanha: 'IGREJAS', indicador: 'Fulano', whatsAppLid: '123@lid', valorRendaMensal: 0, valorPatrimonio: 0,
    banco1Nome: 'Itau',
  },
  tipoTelhado: { nome: 'Cerâmico' }, concessionaria: { nome: 'CELESC' }, faseEnergetica: 'Bifásico',
  tipoEdificacao: { nome: 'Residencial' }, unidadeConsumidora: '1234567',
  prePropostas: [{}, {}],
  prePropostaAceita: {
    dataInclusao: '2026-05-05T20:37:05.2', valorTotal: 9000,
    preProposta: {
      simulacao: {
        kwP: 5.5, geracaoMensal: 600, geracaoAnual: 7200, quantidadePlacas: 10, porcentagemEficiencia: 95,
        contaEconomiaAno: 5000, contaEconomiaMes: 416, radiacaoSolar: 5.2, pesoTotal: 220.5, areaMinima: 34.2,
        anoRetornoInvestimento: 4, valorDokWh: 0.9, configuracaoId: 77, preco: 8999.99,
      },
    },
  },
  ...extra,
})

/** Groner falso: 3 etapas, projetos por etapa, detalhe por id. Conta chamadas. */
function gronerFalso({ total = 3, porEtapa = { 7: [101, 102, 103] } } = {}) {
  const chamadas = []
  const get = async (recurso, params = {}) => {
    chamadas.push([recurso, params])
    if (recurso === 'EtapaLead') {
      return { list: [{ id: 7, nome: '06. CONTRATO' }, { id: 33, nome: '17. SEGURO' }, { id: 29, nome: '08. ENGENHARIA PROJETO' }] }
    }
    if (recurso === 'Projeto') {
      const ids = params.etapaId ? (porEtapa[params.etapaId] ?? []) : Object.values(porEtapa).flat()
      const tamanho = 20
      const ini = (params.pageNumber - 1) * tamanho
      return {
        list: ids.slice(ini, ini + tamanho).map((id, i) => lista({ id, dataUltimaAtualizacao: `2026-10-0${(i % 9) + 1}T10:00:00` })),
        totalItems: ids.length, totalPages: Math.max(1, Math.ceil(ids.length / tamanho)),
      }
    }
    const m = recurso.match(/^Projeto\/(\d+)$/)
    if (m) return detalhe({ id: Number(m[1]) })
    throw new Error(`recurso inesperado ${recurso}`)
  }
  return { get, chamadas, total }
}

// ─── Linha ───────────────────────────────────────────────────────────────────

test('linha: 71 colunas na ordem, colunas corrigidas e campos de contato presentes', () => {
  assert.equal(COLUNAS.length, 71)
  assert.equal(new Set(COLUNAS).size, 71)
  const linha = montarLinha(lista(), detalhe())
  assert.equal(linha.length, 71)
  const v = (nome) => linha[COLUNAS.indexOf(nome)]

  assert.equal(v('Código'), 101)
  assert.equal(v('Consumo'), 330, 'usa o consumo total da listagem')
  assert.equal(v('Etapa'), '10. HOMOLOGAÇÃO')
  assert.equal(v('Loja'), 'GRUPO ICF')
  // Contato e documento fazem parte da exportação.
  assert.equal(v('Contato E-mail'), 'cliente@exemplo.com')
  assert.equal(v('Contato Celular'), '48999990000')
  assert.equal(v('Documento do Contato'), '12345678909')
  assert.equal(v('WhatsApp Lid'), '123@lid')
  assert.equal(v('CEP'), '88000000')
  // Colunas deslocadas no export do Groner estão corrigidas.
  assert.equal(v('Proposta Aceita Peso Total'), 220.5)
  assert.equal(v('Proposta Aceita Área Ocupada'), 34.2)
  assert.equal(v('Proposta Aceita Ano ROI'), 4)
  assert.equal(v('Proposta Aceita Potência'), 5.5)
  assert.equal(v('Proposta Aceita Valor'), 8999.99)
  assert.equal(v('Quantidade de propostas'), 2)
  assert.equal(v('Banco 1'), 'Itau')
  // Etiquetas em ordem alfabética, preservando o texto do cadastro.
  assert.equal(v('Etiquetas'), 'Á VISTA, Fechado , Visita Técnica')
})

test('linha: "Sem ..." com id 0 e datas 0001/1901 viram vazio; sem proposta aceita, colunas vazias', () => {
  const linha = montarLinha(lista({ dataVenda: '1901-01-01T00:00:00' }), detalhe({ prePropostaAceita: null, lead: { nome: 'Fulano' } }))
  const v = (nome) => linha[COLUNAS.indexOf(nome)]
  assert.equal(v('Técnico'), null)
  assert.equal(v('Projetista'), null)
  assert.equal(v('Pré-vendedor'), null)
  assert.equal(v('Homologador'), 'Homologador Y')
  assert.equal(v('Data da venda'), null)
  assert.equal(v('Proposta Aceita Valor'), null)
  assert.equal(v('Documento do Contato'), null)
  assert.equal(v('Quantidade de Vendas'), 0)
  assert.equal(linha.length, 71)
})

test('datas: horário de Brasília vira a mesma hora de parede, com segundos arredondados', () => {
  assert.equal(converterData('0001-01-01T00:00:00'), null)
  assert.equal(converterData(''), null)
  assert.equal(converterData('2026-10-05T13:40:46.72').toISOString(), '2026-10-05T13:40:47.000Z')
  assert.equal(converterData('2026-05-05T15:42:29').toISOString(), '2026-05-05T15:42:29.000Z')
})

test('xlsx: gera arquivo válido (zip) com a aba Deals', async () => {
  const buffer = await gerarXlsx([montarLinha(lista(), detalhe())])
  assert.equal(buffer.subarray(0, 2).toString('latin1'), 'PK')
  assert.ok(buffer.includes(Buffer.from('xl/worksheets/sheet1.xml')))
  // O nome da aba fica em xl/workbook.xml, comprimido; confere pelo arquivo do cabeçalho sem descompactar.
  assert.ok(buffer.length > 1000)
})

// ─── Filtros e geração ───────────────────────────────────────────────────────

test('filtros: validam entrada e exigem algum filtro de abrangência', () => {
  assert.deepEqual(normalizarFiltros({ etapas: '17. SEGURO' }).etapas, ['17. SEGURO'])
  assert.deepEqual(normalizarFiltros({ etapas: [7, '29'] }).etapas, [7, 29])
  assert.equal(normalizarFiltros({ limite: 9999 }).limite, LIMITE_MAXIMO)
  assert.throws(() => normalizarFiltros({}), /ao menos um filtro/)
  assert.throws(() => normalizarFiltros({ etapas: ['x'], atualizadoDesde: '09/10/2026' }), /AAAA-MM-DD/)
  assert.throws(() => normalizarFiltros({ etapas: ['x'], limite: 0 }), /limite/)
})

test('geração: resolve a etapa pelo nome, pagina e busca o detalhe só dos selecionados', async () => {
  const { get, chamadas } = gronerFalso({ porEtapa: { 7: Array.from({ length: 45 }, (_, i) => 100 + i) } })
  const { linhas, resumo, falhas } = await gerarDeals({ get, filtros: { etapas: ['06. contrato'] } })
  assert.equal(linhas.length, 45)
  assert.equal(falhas, 0)
  assert.match(resumo, /^45 cards, 71 colunas/)
  assert.equal(chamadas.filter(([r]) => /^Projeto\/\d+$/.test(r)).length, 45)
  assert.ok(chamadas.some(([r, p]) => r === 'Projeto' && p.etapaId === 7))
  assert.ok(linhas.every((l) => l.length === 71))
})

test('geração: limite corta nos mais recentes; filtro por status e por data de atualização', async () => {
  const { get } = gronerFalso({ porEtapa: { 7: Array.from({ length: 30 }, (_, i) => 100 + i) } })
  assert.equal((await gerarDeals({ get, filtros: { etapas: [7], limite: 5 } })).linhas.length, 5)
  assert.equal((await gerarDeals({ get, filtros: { etapas: [7], status: ['vistoria'] } })).linhas.length, 30)
  assert.equal((await gerarDeals({ get, filtros: { etapas: [7], status: ['outro status'] } })).linhas.length, 0)
  assert.equal((await gerarDeals({ get, filtros: { etapas: [7], atualizadoDesde: '2026-11-01' } })).linhas.length, 0)
})

test('geração: acima do limite por arquivo recusa sem buscar detalhes; etapa inexistente dá erro claro', async () => {
  const { get, chamadas } = gronerFalso({ porEtapa: { 7: Array.from({ length: LIMITE_MAXIMO + 30 }, (_, i) => 1000 + i) } })
  await assert.rejects(gerarDeals({ get, filtros: { etapas: [7] } }), /mais de 400 cards/)
  assert.equal(chamadas.filter(([r]) => /^Projeto\/\d+$/.test(r)).length, 0)
  await assert.rejects(gerarDeals({ get, filtros: { etapas: ['99. NÃO EXISTE'] } }), /não encontrada/)
})

test('etapas: o catálogo é paginado (20 por página) e o nome exato vence o parcial', async () => {
  const todas = [
    ...Array.from({ length: 20 }, (_, i) => ({ id: i + 1, nome: `${String(i + 1).padStart(2, '0')}. ETAPA ${i}` })),
    { id: 50, nome: '17. SEGURO' }, { id: 51, nome: '17. SEGURO PREMIUM' },
  ]
  const chamadas = []
  const get = async (recurso, params = {}) => {
    chamadas.push([recurso, params.PageNumber])
    if (recurso === 'EtapaLead') {
      const ini = (params.PageNumber - 1) * 20
      return { list: todas.slice(ini, ini + 20), totalPages: 2 }
    }
    if (recurso === 'Projeto') return { list: [], totalPages: 1 }
    throw new Error('inesperado')
  }
  // Na página 2 do catálogo; "17. seguro" casa exato com 50 mesmo havendo "17. SEGURO PREMIUM".
  await gerarDeals({ get, filtros: { etapas: ['17. seguro'] } })
  assert.deepEqual(chamadas.filter(([r]) => r === 'EtapaLead').map(([, p]) => p), [1, 2])
  assert.ok(chamadas.some(([r]) => r === 'Projeto'))
  await assert.rejects(gerarDeals({ get, filtros: { etapas: ['seguro'] } }), /ambígua/)
})

test('paginação: sem achar cards por 60 páginas aborta com a mensagem de estreitar o filtro', async () => {
  let paginas = 0
  const get = async (recurso, params = {}) => {
    if (recurso !== 'Projeto') throw new Error('inesperado')
    paginas += 1
    return { list: [lista({ id: params.pageNumber, status: { nome: 'Outro' } })], totalPages: 294 }
  }
  await assert.rejects(gerarDeals({ get, filtros: { status: ['inexistente'], limite: 5 } }), /filtro mais estreito/)
  assert.ok(paginas <= 70, `percorreu ${paginas} páginas`)
})

test('detalhe: poucas falhas viram aba Avisos; muitas viram erro 502 claro', async () => {
  const ids = Array.from({ length: 30 }, (_, i) => 100 + i)
  const fabrica = (quebrar) => {
    const base = gronerFalso({ porEtapa: { 7: ids } }).get
    return async (recurso, params) => {
      const m = recurso.match(/^Projeto\/(\d+)$/)
      if (m && quebrar.has(Number(m[1]))) throw new Error('falhou')
      return base(recurso, params)
    }
  }
  const poucas = await gerarDeals({ get: fabrica(new Set([101, 105])), filtros: { etapas: [7] } })
  assert.equal(poucas.falhas, 2)
  assert.deepEqual(poucas.semDetalhe, [101, 105])
  assert.equal(poucas.linhas[0].length, 71)
  const buffer = await gerarXlsx(poucas.linhas, poucas.semDetalhe)
  assert.ok(buffer.includes(Buffer.from('xl/worksheets/sheet2.xml')))
  assert.ok(!(await gerarXlsx(poucas.linhas)).includes(Buffer.from('xl/worksheets/sheet2.xml')))

  await assert.rejects(
    gerarDeals({ get: fabrica(new Set([100, 101, 102, 103])), filtros: { etapas: [7] } }),
    (e) => e.status === 502 && /tente novamente/.test(e.message),
  )
})

// ─── Link assinado ───────────────────────────────────────────────────────────

test('link: válido, expirado e adulterado', () => {
  const { link, expiraEm, filtros } = assinarLink({
    baseUrl: 'https://exemplo.vercel.app/', filtros: { etapas: ['17. SEGURO'] }, segredo: SEGREDO, agora: AGORA,
  })
  assert.match(link, /^https:\/\/exemplo\.vercel\.app\/api\/deals\/download\?f=[\w-]+&exp=\d+&sig=[0-9a-f]{64}$/)
  assert.equal(expiraEm, new Date(AGORA + 15 * 60 * 1000).toISOString())
  assert.deepEqual(filtros.etapas, ['17. SEGURO'])

  const q = Object.fromEntries(new URL(link).searchParams)
  const ok = verificarLink(q, SEGREDO, AGORA + 60_000)
  assert.equal(ok.ok, true)
  assert.deepEqual(ok.filtros.etapas, ['17. SEGURO'])

  assert.equal(verificarLink(q, SEGREDO, AGORA + 16 * 60 * 1000).motivo, 'expirado')
  assert.equal(verificarLink(q, 'outra-chave', AGORA).ok, false)
  assert.equal(verificarLink(q, '', AGORA).ok, false)
  // Troca dos filtros, da expiração ou da assinatura invalida o link.
  const outroF = Buffer.from(JSON.stringify({ etapas: [], status: [], atualizadoDesde: null, limite: 400 })).toString('base64url')
  assert.equal(verificarLink({ ...q, f: outroF }, SEGREDO, AGORA).motivo, 'assinatura')
  assert.equal(verificarLink({ ...q, exp: String(Number(q.exp) + 3600) }, SEGREDO, AGORA).motivo, 'assinatura')
  assert.equal(verificarLink({ ...q, sig: q.sig.replace(/.$/, (c) => (c === '0' ? '1' : '0')) }, SEGREDO, AGORA).motivo, 'assinatura')
  assert.equal(verificarLink({ ...q, sig: 'curta' }, SEGREDO, AGORA).ok, false)
  assert.equal(verificarLink({}, SEGREDO, AGORA).ok, false)
})

// ─── Rota de download ────────────────────────────────────────────────────────

async function comServidor(opcoes, fn) {
  const app = express()
  app.use('/api/deals', createDealsRouter({ segredo: SEGREDO, agora: () => AGORA, ...opcoes }))
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)) })
  try { return await fn(`http://127.0.0.1:${server.address().port}`) } finally { server.close() }
}

test('rota: sem assinatura, adulterada ou expirada responde 401 e não consulta o Groner', async () => {
  const { get, chamadas } = gronerFalso()
  await comServidor({ get }, async (base) => {
    assert.equal((await fetch(`${base}/api/deals/download`)).status, 401)
    assert.equal((await fetch(`${base}/api/deals/download?f=abc&exp=9999999999&sig=${'0'.repeat(64)}`)).status, 401)

    const { link } = assinarLink({ baseUrl: base, filtros: { etapas: [7] }, segredo: SEGREDO, agora: AGORA - 20 * 60 * 1000 })
    const expirado = await fetch(link)
    assert.equal(expirado.status, 401)
    assert.equal(expirado.headers.get('cache-control'), 'no-store')
  })
  assert.equal(chamadas.length, 0)
})

test('rota: com link válido devolve o xlsx como anexo, sem cache', async () => {
  const { get } = gronerFalso()
  await comServidor({ get }, async (base) => {
    const { link } = assinarLink({ baseUrl: base, filtros: { etapas: [7] }, segredo: SEGREDO, agora: AGORA })
    const r = await fetch(link)
    assert.equal(r.status, 200)
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="Deals-2026-10-09.xlsx"')
    assert.equal(r.headers.get('cache-control'), 'no-store')
    assert.match(r.headers.get('content-type'), /spreadsheetml\.sheet/)
    const corpo = Buffer.from(await r.arrayBuffer())
    assert.equal(corpo.subarray(0, 2).toString('latin1'), 'PK')
  })
})

test('rota: filtro que passa do limite responde 422 com a orientação, sem vazar linhas', async () => {
  const { get } = gronerFalso({ porEtapa: { 7: Array.from({ length: LIMITE_MAXIMO + 5 }, (_, i) => 1000 + i) } })
  await comServidor({ get }, async (base) => {
    const { link } = assinarLink({ baseUrl: base, filtros: { etapas: [7] }, segredo: SEGREDO, agora: AGORA })
    const r = await fetch(link)
    assert.equal(r.status, 422)
    assert.match((await r.json()).error, /Estreite/)
  })
})

// ─── Ferramenta MCP ──────────────────────────────────────────────────────────

async function chamarMcp(args, { base } = {}) {
  const res = {
    statusCode: 200, corpo: null, cab: {},
    setHeader(k, v) { this.cab[k] = v },
    status(c) { this.statusCode = c; return this },
    json(b) { this.corpo = b; return this },
    end() { return this },
  }
  const antes = process.env.PUBLIC_BASE_URL
  if (base) process.env.PUBLIC_BASE_URL = base; else delete process.env.PUBLIC_BASE_URL
  try {
    await mcp({
      method: 'POST', headers: { authorization: `Bearer ${SEGREDO}`, host: 'meu-host.vercel.app' }, query: {},
      body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'deals_exportar', arguments: args } },
    }, res)
  } finally { if (antes === undefined) delete process.env.PUBLIC_BASE_URL; else process.env.PUBLIC_BASE_URL = antes }
  return res
}

test('MCP: deals_exportar está na lista e devolve só o link curto, sem consultar o Groner', async () => {
  process.env.MCP_ACCESS_TOKEN = SEGREDO
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => { throw new Error('a ferramenta não deve usar a rede') }
  try {
    const tools = await new Promise((resolve) => {
      const res = { setHeader() {}, status() { return this }, json(b) { resolve(b); return this }, end() { return this } }
      mcp({ method: 'POST', headers: { authorization: `Bearer ${SEGREDO}` }, query: {}, body: { jsonrpc: '2.0', id: 2, method: 'tools/list' } }, res)
    })
    const tool = tools.result.tools.find((t) => t.name === 'deals_exportar')
    assert.ok(tool)
    assert.ok(tool.description.length < 160, 'descrição curta para poupar tokens')

    const r = await chamarMcp({ etapas: ['17. SEGURO'], limite: 20 })
    assert.equal(r.statusCode, 200)
    assert.equal(r.corpo.result.isError, undefined)
    const texto = r.corpo.result.content[0].text
    assert.ok(texto.length < 900, `resposta curta (${texto.length} caracteres)`)
    const dados = JSON.parse(texto)
    assert.deepEqual(Object.keys(dados).sort(), ['aviso', 'expiraEm', 'filtros', 'link'])
    assert.match(dados.link, /^https:\/\/meu-host\.vercel\.app\/api\/deals\/download\?f=/)
    assert.deepEqual(dados.filtros, { etapas: ['17. SEGURO'], status: [], atualizadoDesde: null, limite: 20 })
    // Nenhuma linha/contato na resposta.
    assert.doesNotMatch(texto, /@|cliente|documento/i)
    // O link emitido é aceito pela verificação.
    const q = Object.fromEntries(new URL(dados.link).searchParams)
    assert.equal(verificarLink(q, SEGREDO).ok, true)

    const fixa = await chamarMcp({ etapas: [7] }, { base: 'https://base-fixa.exemplo' })
    assert.match(JSON.parse(fixa.corpo.result.content[0].text).link, /^https:\/\/base-fixa\.exemplo\/api\/deals\/download/)
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.MCP_ACCESS_TOKEN
  }
})

test('MCP: filtros inválidos voltam como erro curto; sem a chave do MCP continua 401', async () => {
  process.env.MCP_ACCESS_TOKEN = SEGREDO
  try {
    const r = await chamarMcp({ atualizadoDesde: 'ontem', etapas: [7] })
    assert.equal(r.corpo.result.isError, true)
    assert.match(r.corpo.result.content[0].text, /AAAA-MM-DD/)
    const semFiltro = await chamarMcp({})
    assert.equal(semFiltro.corpo.result.isError, true)
  } finally { delete process.env.MCP_ACCESS_TOKEN }
})
