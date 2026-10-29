/**
 * Regras da SolarZ sobre os dados guardados no banco (entidade `solarz_usinas`).
 * Funções puras: o relógio entra por parâmetro. Unidades da API: energia em kWh,
 * `installedPower` em kWp; desempenho aqui é razão (1,15 = 115%), como no relatório estático.
 */
export const ENTIDADE_SOLARZ = 'solarz_usinas'

/**
 * Status de desempenho pela MÉDIA DOS 3 ÚLTIMOS MESES FECHADOS, com limiares fixos do relatório do painel SolarZ:
 * Crítico 0-50%, Atenção 51-70%, Dentro do esperado 71% ou mais; sem média 3M = "Sem dado". A média é arredondada
 * para o percentual inteiro antes de comparar (como o relatório mostra). Conferido com o relatório de 11/09/2026
 * (126 usinas): os cortes reproduzem as 91 classificações.
 */
export const LIMIAR_CRITICO_PCT = 50
export const LIMIAR_ATENCAO_PCT = 70

export function classificarDesempenho(media3m) {
  if (media3m == null || !Number.isFinite(media3m)) return 'Sem dado'
  const pct = Math.round(media3m * 100)
  if (pct <= LIMIAR_CRITICO_PCT) return 'Crítico'
  if (pct <= LIMIAR_ATENCAO_PCT) return 'Atenção'
  return 'Dentro do esperado'
}

/**
 * Farol de monitoramento (conectividade), separado do desempenho. Mapeamento do `status.status` da Open API
 * (valores vistos na conta: OK, ALERTA, CRITICO, DESCONHECIDO) para os rótulos do painel:
 * OK -> Normal; ALERTA -> Com alerta; CRITICO -> Crítico; qualquer outro/ausente -> Desconhecido.
 */
export const FAROL_ROTULOS = ['Normal', 'Com alerta', 'Crítico', 'Desconhecido']
export function rotuloFarol(status) {
  const s = String(status ?? '').toUpperCase()
  if (s === 'OK') return 'Normal'
  if (s === 'ALERTA') return 'Com alerta'
  if (s === 'CRITICO') return 'Crítico'
  return 'Desconhecido'
}
export function contarFarol(usinas) {
  const c = Object.fromEntries(FAROL_ROTULOS.map((r) => [r, 0]))
  for (const u of usinas) c[rotuloFarol(u.status ?? u.statusMonitoramento)] += 1
  return c
}

export const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const MESES_NOME = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
const razao = (total, esperado) => {
  const t = num(total); const e = num(esperado)
  return t != null && e != null && e > 0 ? t / e : null
}

/** Mês corrente em Brasília: { ano, mes (1-12), ym:'AAAA-MM' }. */
export function mesAtualBrasilia(agora = new Date()) {
  const [ano, mes] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora).split('-').map(Number)
  return { ano, mes, ym: `${ano}-${String(mes).padStart(2, '0')}` }
}

const ymDe = (ano, mes) => `${ano}-${String(mes).padStart(2, '0')}`
/** Mês anterior a 'AAAA-MM'. */
export function ymAnterior(ym) {
  const [a, m] = ym.split('-').map(Number)
  return m === 1 ? ymDe(a - 1, 12) : ymDe(a, m - 1)
}

/** Reduz a lista de meses da API ao que se guarda: [{ym, total, esperado}] (só meses com ano pedido). */
export function normalizarMeses(lista) {
  return (Array.isArray(lista) ? lista : [])
    .filter((m) => typeof m?.yearMonth === 'string' && /^\d{4}-\d{2}$/.test(m.yearMonth))
    .map((m) => ({ ym: m.yearMonth, total: num(m.total), esperado: num(m.totalExpected) }))
}

/**
 * Registro de uma usina como fica guardado. Lista branca de campos: nunca copia
 * cliente.email/cpf/telefone, endereco.logradouro/bairro/cep nem responsavel.
 * @param usina objeto já passado por mapUsina (server/mappers.js)
 */
export function solarzRegistroParaArmazenar(usina, { meses = [], desempenho = null, totalInvestido = null, indisponiveis = [] } = {}, agora = new Date()) {
  const d = desempenho || {}
  return {
    solarzId: usina.id,
    nome: usina.nome ?? null,
    clienteNome: usina.clienteNome ?? null,
    concessionaria: usina.concessionaria ?? null,
    cidade: usina.cidade ?? null,
    estado: usina.estado ?? null,
    potenciaKwp: num(usina.potenciaInstalada),
    dataInstalacao: usina.dataInstalacao ?? d.installationDate ?? null,
    statusMonitoramento: usina.status ?? null,
    statusMonitoramentoEm: usina.statusEm ?? null,
    energiaGeradaAcumuladaKwh: num(usina.energiaGeradaKwh),
    meses,
    desempenho: desempenho
      ? {
          total30D: num(d.total30D), expected30D: num(d.expected30D), total365D: num(d.total365D), expected365D: num(d.expected365D),
        }
      : null,
    totalInvestido: num(totalInvestido),
    indisponiveis,
    anoCarga: mesAtualBrasilia(agora).ano,
    buscadoEm: agora.toISOString(),
  }
}

/**
 * Valores derivados de um registro guardado, calculados na leitura (o "mês corrente" muda sem nova carga).
 * - mensal: ano corrente, 12 posições. Mês fechado: geração = total, desempenho = total/esperado (null antes da
 *   instalação ou sem esperado). Mês corrente: geração parcial e desempenho null (esperado é do mês inteiro).
 *   Mês futuro: sem geração, só o prognóstico.
 * - mês de referência = ÚLTIMO MÊS FECHADO (mesma convenção do relatório estático): geracaoKwhMes, prognosticoKwhMes,
 *   desempenhoMesPct. Em janeiro é dezembro do ano anterior.
 * - desempenho30d = total30D/expected30D; 12m = total365D/expected365D.
 * - 3m = média das razões mensais dos 3 últimos meses fechados que têm razão.
 */
export function derivarRegistro(reg, agora = new Date()) {
  const atual = mesAtualBrasilia(agora)
  const porYm = new Map((reg.meses ?? []).map((m) => [m.ym, m]))
  const instalacaoYm = typeof reg.dataInstalacao === 'string' && /^\d{4}-\d{2}/.test(reg.dataInstalacao) ? reg.dataInstalacao.slice(0, 7) : null
  const razaoMes = (ym) => {
    const m = porYm.get(ym)
    if (!m || (instalacaoYm && ym < instalacaoYm)) return null
    return razao(m.total, m.esperado)
  }

  const mensal = MESES_ABREV.map((mes, i) => {
    const ym = ymDe(atual.ano, i + 1)
    const m = porYm.get(ym)
    const prognosticoKwh = m?.esperado ?? null
    if (ym > atual.ym) return { mes, geracaoKwh: null, desempenhoPct: null, prognosticoKwh }
    if (instalacaoYm && ym < instalacaoYm) return { mes, geracaoKwh: 0, desempenhoPct: null, prognosticoKwh: null } // antes da instalação
    if (!m) return { mes, geracaoKwh: null, desempenhoPct: null, prognosticoKwh: null }
    if (ym === atual.ym) return { mes, geracaoKwh: m.total, desempenhoPct: null, prognosticoKwh, parcial: true }
    return { mes, geracaoKwh: m.total, desempenhoPct: razaoMes(ym), prognosticoKwh }
  })

  const ultimoFechado = ymAnterior(atual.ym)
  const ref = porYm.get(ultimoFechado)
  const ultimos3 = [ultimoFechado, ymAnterior(ultimoFechado), ymAnterior(ymAnterior(ultimoFechado))]
  const razoes3 = ultimos3.map(razaoMes).filter((r) => r != null)
  const media3m = razoes3.length ? razoes3.reduce((a, b) => a + b, 0) / razoes3.length : null
  const [aRef, mRef] = ultimoFechado.split('-').map(Number)
  const d = reg.desempenho

  return {
    anoMensal: atual.ano,
    mensal,
    mesAnoRecente: ref ? `${MESES_NOME[mRef - 1]}/${aRef}` : null,
    geracaoKwhMes: ref?.total ?? null,
    prognosticoKwhMes: ref?.esperado ?? null,
    desempenhoMesPct: razaoMes(ultimoFechado),
    desempenho30dPct: d ? razao(d.total30D, d.expected30D) : null,
    desempenho12mPct: d ? razao(d.total365D, d.expected365D) : null,
    desempenhoMedio3mPct: media3m,
    statusDesempenho: classificarDesempenho(media3m),
  }
}

/** Tickets abertos agrupados por usina: { [usinaId]: { nome, total, porTipo, afetamDesempenho, maisAntigoEm } }. Sem título nem cliente. */
export function agruparTickets(tickets) {
  const porUsina = {}
  const porTipo = {}
  let total = 0
  for (const t of Array.isArray(tickets) ? tickets : []) {
    if (t?.status && !['ABERTO', 'EM_ANDAMENTO', 'EM_ESPERA'].includes(t.status)) continue
    const tipo = t?.tipo || 'OUTRO'
    total += 1
    porTipo[tipo] = (porTipo[tipo] ?? 0) + 1
    const chave = String(t?.usinaId ?? `nome:${t?.usinaName ?? ''}`)
    const u = (porUsina[chave] ??= { usinaId: t?.usinaId ?? null, nome: t?.usinaName ?? null, total: 0, porTipo: {}, afetamDesempenho: 0, maisAntigoEm: null })
    u.total += 1
    u.porTipo[tipo] = (u.porTipo[tipo] ?? 0) + 1
    if (t?.afetaDesempenho) u.afetamDesempenho += 1
    if (t?.createdAt && (!u.maisAntigoEm || t.createdAt < u.maisAntigoEm)) u.maisAntigoEm = t.createdAt
  }
  return { total, porTipo, porUsina }
}

/** UCs por usina: { [usinaId]: { nome, ucs:[{codigo, concessionaria}] } }. Não guarda a denominação da unidade (costuma ser o nome do cliente). */
export function agruparUnidades(plantas) {
  const porUsina = {}
  for (const p of Array.isArray(plantas) ? plantas : []) {
    const ucs = (Array.isArray(p?.unidades) ? p.unidades : [])
      .filter((u) => u?.contrato != null && String(u.contrato).trim() !== '')
      .map((u) => ({ codigo: String(u.contrato).trim(), concessionaria: u.concessionariaSigla ?? null }))
    if (ucs.length) porUsina[String(p.id)] = { usinaId: p.id ?? null, nome: p.name ?? null, ucs }
  }
  return porUsina
}
