/**
 * Ferramentas do MCP da SolarZ. Usam as mesmas rotas da Open API que o painel já consome
 * (server/solarzClient.js) e o dado guardado pela carga diária no Postgres (server/solarzSync.js).
 * Resumo, listas, farol e desempenho vêm do banco (rápido, sem gastar chamadas); energia por ano,
 * relatório, UCs, tickets e potência vão direto à SolarZ.
 * Percentuais saem em % (115,2 = 115,2%); energia em kWh; potência em kWp.
 */
import { lerSolarzArmazenada } from './solarzSync.js'
import { derivarRegistro, rotuloFarol, FAROL_ROTULOS, mesAtualBrasilia, MESES_ABREV } from './solarzMetricas.js'
import * as clienteSolarz from './solarzClient.js'
import { getPgSql } from './pgSql.js'
import { stripSensitive } from './sanitize.js'

const pct = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 10)
const arred = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10)
const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const LIMITE_PADRAO = 50
const LIMITE_MAXIMO = 200

const STATUS_DESEMPENHO = ['Crítico', 'Atenção', 'Dentro do esperado', 'Sem dado']

const texto = { type: 'string' }
const numero = { type: 'number' }
const usinaProps = {
  id: { ...numero, description: 'ID da usina na SolarZ' },
  nome: { ...texto, description: 'Nome (ou parte do nome) da usina, se não souber o ID' },
}

export const FERRAMENTAS = [
  {
    name: 'solarz_resumo_parque',
    description: 'Indicadores do parque: nº de usinas, kWp instalado, geração do último mês fechado contra o prognóstico, desempenho de 3 e 12 meses, usinas por status de desempenho e por farol, tickets abertos e a data da última atualização.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'solarz_listar_usinas',
    description: 'Lista usinas com filtros por status de desempenho (Crítico, Atenção, Dentro do esperado, Sem dado), farol (Normal, Com alerta, Crítico, Desconhecido), UF, premium e nome. Ordenada do pior para o melhor desempenho de 3 meses.',
    inputSchema: { type: 'object', properties: {
      status: { ...texto, enum: STATUS_DESEMPENHO }, farol: { ...texto, enum: FAROL_ROTULOS }, uf: { ...texto, description: 'Sigla, ex.: SC' },
      premium: { type: 'boolean', description: 'true = só com monitoramento premium; false = só sem' }, nome: texto,
      limite: { ...numero, description: `Máximo de usinas (padrão ${LIMITE_PADRAO}, máx. ${LIMITE_MAXIMO})` },
    } },
  },
  {
    name: 'solarz_detalhe_usina',
    description: 'Detalhe de uma usina: potência, status, desempenho de 1, 15, 30 e 365 dias (ao vivo), data de instalação, total investido, UCs e tickets abertos. Informe id ou nome.',
    inputSchema: { type: 'object', properties: usinaProps },
  },
  {
    name: 'solarz_geracao_mensal',
    description: 'Geração, prognóstico e desempenho de cada mês de um ano para uma usina (só usinas premium). Sem ano, usa o ano corrente.',
    inputSchema: { type: 'object', properties: { ...usinaProps, ano: { ...numero, description: 'Ex.: 2026' } } },
  },
  {
    name: 'solarz_relatorio_periodo',
    description: 'Relatório mensal consolidado da SolarZ por usina (geração, desempenho, total investido e demais campos do relatório) entre dois meses.',
    inputSchema: { type: 'object', properties: { ...usinaProps, inicio: { ...texto, description: 'Mês inicial AAAA-MM' }, fim: { ...texto, description: 'Mês final AAAA-MM' } }, required: ['inicio', 'fim'] },
  },
  {
    name: 'solarz_unidades_consumidoras',
    description: 'Unidades consumidoras das usinas e os créditos, direto da SolarZ. Sem id/nome, devolve as primeiras usinas (use limite).',
    inputSchema: { type: 'object', properties: { ...usinaProps, limite: numero } },
  },
  {
    name: 'solarz_tickets',
    description: 'Tickets da SolarZ com filtros por status (padrão: ABERTO, EM_ANDAMENTO, EM_ESPERA), usina e tipo. Direto da SolarZ.',
    inputSchema: { type: 'object', properties: {
      ...usinaProps, status: { type: 'array', items: texto, description: 'Ex.: ["ABERTO","EM_ANDAMENTO","EM_ESPERA","FECHADO"]' },
      tipo: texto, limite: numero,
    } },
  },
  {
    name: 'solarz_farol',
    description: 'Farol de monitoramento: situação de hoje (contagens), as usinas em alerta ou críticas e o histórico diário das contagens.',
    inputSchema: { type: 'object', properties: { dias: { ...numero, description: 'Dias de histórico (padrão 30)' } } },
  },
  {
    name: 'solarz_potencia_usina',
    description: 'Potência da usina direto da SolarZ (rota plant/power). Informe id ou nome.',
    inputSchema: { type: 'object', properties: usinaProps },
  },
]

function limitar(valor, padrao = LIMITE_PADRAO) {
  const n = Number(valor)
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), LIMITE_MAXIMO) : padrao
}

async function carregar(deps) {
  const pg = deps.pg ?? getPgSql()
  if (!pg) throw new Error('Armazenamento Postgres não configurado: a carga diária da SolarZ não está disponível')
  const dados = await (deps.lerArmazenada ?? lerSolarzArmazenada)(pg)
  if (!dados.registros.length) throw new Error('Ainda não há dados da SolarZ guardados (a carga diária ainda não rodou)')
  const premium = new Map((dados.simples?.usinas ?? []).map((u) => [String(u.id), u.premium]))
  return { ...dados, premium }
}

/** Linha enxuta de uma usina para listas. */
function linha(reg, d, premium) {
  return {
    id: reg.solarzId, nome: reg.nome, cliente: reg.clienteNome, cidade: reg.cidade, uf: reg.estado, concessionaria: reg.concessionaria,
    potenciaKwp: reg.potenciaKwp, premium: premium.get(String(reg.solarzId)) ?? null,
    farol: rotuloFarol(reg.statusMonitoramento), statusDesempenho: d.statusDesempenho,
    desempenho3mPct: pct(d.desempenhoMedio3mPct), desempenho12mPct: pct(d.desempenho12mPct), desempenho30dPct: pct(d.desempenho30dPct),
    mesReferencia: d.mesAnoRecente, geracaoKwhMes: arred(d.geracaoKwhMes), prognosticoKwhMes: arred(d.prognosticoKwhMes),
  }
}

function acharRegistro(dados, { id, nome }) {
  if (id != null) {
    const r = dados.registros.find((x) => String(x.solarzId) === String(id))
    if (r) return r
    throw new Error(`Usina ${id} não encontrada na carga da SolarZ`)
  }
  const q = semAcento(nome)
  if (!q) throw new Error('Informe o id ou o nome da usina')
  const achadas = dados.registros.filter((x) => semAcento(x.nome).includes(q))
  if (achadas.length === 1) return achadas[0]
  if (!achadas.length) throw new Error(`Nenhuma usina com o nome "${nome}"`)
  const exata = achadas.find((x) => semAcento(x.nome) === q)
  if (exata) return exata
  throw new Error(`Mais de uma usina com "${nome}": ${achadas.slice(0, 10).map((x) => `${x.nome} (id ${x.solarzId})`).join('; ')}. Informe o id.`)
}

async function idDaUsina(args, deps) {
  if (args.id != null) return args.id
  return acharRegistro(await carregar(deps), args).solarzId
}

function resumoParque(dados, agora) {
  const derivados = dados.registros.map((r) => [r, derivarRegistro(r, agora)])
  const soma = (f) => derivados.reduce((a, [r, d]) => a + (f(r, d) ?? 0), 0)
  const comRef = derivados.filter(([, d]) => d.geracaoKwhMes != null && d.prognosticoKwhMes > 0)
  const gerado = comRef.reduce((a, [, d]) => a + d.geracaoKwhMes, 0)
  const prog = comRef.reduce((a, [, d]) => a + d.prognosticoKwhMes, 0)
  const m3 = derivados.map(([, d]) => d.desempenhoMedio3mPct).filter((x) => x != null)
  const m12 = derivados.map(([, d]) => d.desempenho12mPct).filter((x) => x != null)
  const media = (l) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null)
  const porStatus = Object.fromEntries(STATUS_DESEMPENHO.map((s) => [s, 0]))
  const porFarol = Object.fromEntries(FAROL_ROTULOS.map((s) => [s, 0]))
  for (const [r, d] of derivados) { porStatus[d.statusDesempenho] += 1; porFarol[rotuloFarol(r.statusMonitoramento)] += 1 }
  const premium = dados.simples?.usinas ?? []
  return {
    usinas: dados.registros.length,
    usinasNaConta: premium.length || null,
    usinasPremium: premium.length ? premium.filter((u) => u.premium).length : null,
    potenciaTotalKwp: arred(soma((r) => r.potenciaKwp)),
    mesReferencia: derivados.find(([, d]) => d.mesAnoRecente)?.[1].mesAnoRecente ?? null,
    geracaoKwhMes: arred(gerado), prognosticoKwhMes: arred(prog), geracaoVsPrognosticoPct: prog > 0 ? pct(gerado / prog) : null,
    desempenhoMedio3mPct: pct(media(m3)), desempenhoMedio12mPct: pct(media(m12)),
    usinasPorStatusDesempenho: porStatus, usinasPorFarol: porFarol,
    ticketsAbertos: dados.tickets?.total ?? null, ticketsPorTipo: dados.tickets?.porTipo ?? null,
    atualizadoEm: dados.estado?.concluidoEm ?? dados.tickets?.atualizadoEm ?? null,
  }
}

function listarUsinas(dados, args, agora) {
  const uf = semAcento(args.uf)
  const nome = semAcento(args.nome)
  const linhas = dados.registros
    .map((r) => linha(r, derivarRegistro(r, agora), dados.premium))
    .filter((l) => (!args.status || l.statusDesempenho === args.status)
      && (!args.farol || l.farol === args.farol)
      && (!uf || semAcento(l.uf) === uf)
      && (args.premium == null || l.premium === args.premium)
      && (!nome || semAcento(l.nome).includes(nome)))
    .sort((a, b) => (a.desempenho3mPct ?? Infinity) - (b.desempenho3mPct ?? Infinity))
  const limite = limitar(args.limite)
  return { total: linhas.length, exibidas: Math.min(limite, linhas.length), usinas: linhas.slice(0, limite) }
}

async function detalheUsina(dados, args, deps, agora) {
  const reg = acharRegistro(dados, args)
  const d = derivarRegistro(reg, agora)
  let desempenhoAoVivo = null
  let avisoDesempenho = null
  try {
    const x = await deps.solarz.solarzDesempenho(reg.solarzId)
    const razao = (t, e) => (t != null && e > 0 ? pct(t / e) : null)
    desempenhoAoVivo = {}
    for (const dias of ['1D', '15D', '30D', '365D']) {
      desempenhoAoVivo[dias] = { geracaoKwh: arred(x?.[`total${dias}`]), prognosticoKwh: arred(x?.[`expected${dias}`]), desempenhoPct: razao(x?.[`total${dias}`], x?.[`expected${dias}`]) }
    }
  } catch (err) {
    avisoDesempenho = deps.solarz.ehIndisponivel?.(err) ? 'desempenho indisponível para esta usina (sem premium ou rota não liberada)' : `não foi possível consultar o desempenho ao vivo: ${err.message}`
  }
  return {
    ...linha(reg, d, dados.premium),
    dataInstalacao: reg.dataInstalacao, statusMonitoramentoEm: reg.statusMonitoramentoEm, totalInvestido: reg.totalInvestido,
    energiaGeradaAcumuladaKwh: arred(reg.energiaGeradaAcumuladaKwh), desempenhoMesPct: pct(d.desempenhoMesPct),
    desempenhoAoVivo, avisoDesempenho,
    unidadesConsumidoras: dados.unidades?.porUsina?.[String(reg.solarzId)]?.ucs ?? [],
    ticketsAbertos: dados.tickets?.porUsina?.[String(reg.solarzId)] ?? { total: 0 },
    indisponiveis: reg.indisponiveis ?? [],
    buscadoEm: reg.buscadoEm,
  }
}

function mesesDoAno(lista, ano, agora) {
  const atual = mesAtualBrasilia(agora)
  const porYm = new Map((Array.isArray(lista) ? lista : []).map((m) => [m.yearMonth ?? m.ym, m]))
  return MESES_ABREV.map((mes, i) => {
    const ym = `${ano}-${String(i + 1).padStart(2, '0')}`
    const m = porYm.get(ym)
    const geracao = m?.total ?? null
    const prog = m?.totalExpected ?? m?.esperado ?? null
    const fechado = ym < atual.ym
    return { mes: ym, geracaoKwh: arred(geracao), prognosticoKwh: arred(prog), desempenhoPct: fechado && geracao != null && prog > 0 ? pct(geracao / prog) : null, parcial: ym === atual.ym || undefined }
  })
}

async function geracaoMensal(args, deps, agora) {
  const id = await idDaUsina(args, deps)
  const ano = Number(args.ano) || mesAtualBrasilia(agora).ano
  const lista = await deps.solarz.solarzEnergiaAno(id, ano)
  return { usinaId: id, ano, meses: mesesDoAno(lista, ano, agora) }
}

async function relatorioPeriodo(args, deps) {
  const ym = /^\d{4}-(0[1-9]|1[0-2])$/
  if (!ym.test(String(args.inicio)) || !ym.test(String(args.fim))) throw new Error('inicio e fim precisam estar no formato AAAA-MM')
  const id = await idDaUsina(args, deps)
  const lista = await deps.solarz.solarzRelatorioPeriodo(id, args.inicio, args.fim)
  const meses = (Array.isArray(lista) ? lista : []).sort((a, b) => String(a.monthYear).localeCompare(String(b.monthYear)))
  return { usinaId: id, inicio: args.inicio, fim: args.fim, meses: stripSensitive(meses) }
}

async function unidades(args, deps) {
  const limite = limitar(args.limite)
  const r = await deps.solarz.solarzListarUnidades()
  let itens = r.itens
  if (args.id != null || args.nome) {
    const q = semAcento(args.nome)
    itens = itens.filter((p) => (args.id != null ? String(p.id) === String(args.id) : semAcento(p.name).includes(q)))
  }
  return { totalUsinasComUnidade: r.itens.length, listaCompleta: r.completo, exibidas: Math.min(limite, itens.length), usinas: stripSensitive(itens.slice(0, limite)) }
}

async function tickets(args, deps) {
  const status = Array.isArray(args.status) && args.status.length ? args.status.map((s) => String(s).toUpperCase()) : deps.solarz.STATUS_TICKET_ABERTO
  const r = await deps.solarz.solarzListarPaginado('/openApi/seller/ticket/list', { corpo: { filters: { status } }, rotulo: 'tickets' })
  const tipo = semAcento(args.tipo)
  const q = semAcento(args.nome)
  const itens = r.itens.filter((t) => (args.id == null || String(t.usinaId) === String(args.id))
    && (!q || semAcento(t.usinaName).includes(q))
    && (!tipo || semAcento(t.tipo) === tipo))
  const limite = limitar(args.limite)
  return { status, total: itens.length, listaCompleta: r.completo, exibidos: Math.min(limite, itens.length), tickets: stripSensitive(itens.slice(0, limite)) }
}

function farol(dados, args) {
  const dias = limitar(args.dias, 30)
  const emAlerta = dados.registros
    .filter((r) => rotuloFarol(r.statusMonitoramento) !== 'Normal')
    .map((r) => ({ id: r.solarzId, nome: r.nome, cliente: r.clienteNome, uf: r.estado, farol: rotuloFarol(r.statusMonitoramento), desde: r.statusMonitoramentoEm }))
    .sort((a, b) => (a.farol === b.farol ? 0 : a.farol === 'Crítico' ? -1 : b.farol === 'Crítico' ? 1 : 0))
  const hoje = Object.fromEntries(FAROL_ROTULOS.map((s) => [s, 0]))
  for (const r of dados.registros) hoje[rotuloFarol(r.statusMonitoramento)] += 1
  return { hoje, totalUsinas: dados.registros.length, usinasEmAlerta: emAlerta, historico: (dados.farolHistorico ?? []).slice(-dias) }
}

/**
 * Executa uma ferramenta. `deps` permite injetar o Postgres e o cliente da SolarZ nos testes.
 * @returns {Promise<object>} resultado serializável
 */
export async function executarFerramenta(nome, args = {}, deps = {}) {
  const d = { solarz: clienteSolarz, ...deps }
  const agora = d.agora ?? new Date()
  switch (nome) {
    case 'solarz_resumo_parque': return resumoParque(await carregar(d), agora)
    case 'solarz_listar_usinas': return listarUsinas(await carregar(d), args, agora)
    case 'solarz_detalhe_usina': return detalheUsina(await carregar(d), args, d, agora)
    case 'solarz_geracao_mensal': return geracaoMensal(args, d, agora)
    case 'solarz_relatorio_periodo': return relatorioPeriodo(args, d)
    case 'solarz_unidades_consumidoras': return unidades(args, d)
    case 'solarz_tickets': return tickets(args, d)
    case 'solarz_farol': return farol(await carregar(d), args)
    case 'solarz_potencia_usina': {
      const id = await idDaUsina(args, d)
      return { usinaId: id, potencia: stripSensitive(await d.solarz.solarzPotenciaUsina(id)) }
    }
    default: throw new Error(`Ferramenta desconhecida: ${nome}`)
  }
}
