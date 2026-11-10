/**
 * Rotas do painel de indicadores (public/indicadores/index.html e aba Vendas):
 *   GET /api/indicadores/cards       formato de docs/data_cards.json
 *   GET /api/indicadores/eng-resumo  formato de docs/data_eng_resumo.json
 *   GET /api/indicadores/sales       formato de docs/data_sales.json
 *   GET /api/indicadores/pieta       chamados da Pieta no formato de ROWS do modelo "SLA de Atendimento" (public/pieta)
 *   GET /api/indicadores/pieta/status  total, cobertura de equipamentos e data da última sincronização
 *   GET /api/indicadores/status      totais, data da última carga e lacunas de cada lista
 *   GET /api/indicadores/metas/:id   meta do vendedor no ano (id = <slug do vendedor>_<ano>)
 *   PUT /api/indicadores/metas/:id   grava a meta
 *   GET /api/indicadores/engenharia/gestao   cards de engenharia com problema, plano sugerido e ação combinada
 *   PUT /api/indicadores/engenharia/acoes/:codigo/:funil   grava a ação combinada (fica até o card sair da etapa)
 *   POST /api/indicadores/engenharia/acoes/:codigo/:funil/concluir   marca a ação como feita
 *   GET /api/indicadores/engenharia/usuarios   pessoas do Groner para escolher o responsável
 *
 * A ação salva também vira Tarefa + comentário no card do Groner (server/gronerAcoes.js), quando `gronerAcoes` está ligado.
 *
 * Leitura SÓ do Neon (loadSyncedEntity): sem fallback para a API do Groner, nem com o
 * banco vazio. Cache curto em memória (2 min).
 *
 * Metas: tabela única, tipo 'config', entidade 'vendas', chave 'meta:<id>' (sem tabela
 * nova). Gravação aceita só vendedor que existe nas vendas; com METAS_TOKEN definido,
 * exige também o cabeçalho X-Metas-Token.
 */
import crypto from 'node:crypto'
import express from 'express'
import { cached, invalidate } from './cache.js'
import { dealsEnriquecido, salesEnriquecido } from './enrichment.js'
import { normalizarProjetoLido } from './mappers.js'
import { getPgSql, jsonb, TABELA_SQL } from './pgSql.js'
import { loadSyncedEntity } from './syncStore.js'
import { ID_META, LACUNAS, montarCards, montarEngResumo, montarSales, validarMeta } from './indicadores.js'
import { lerPietaParaSla, montarChamadosSla, resumoDaCobertura } from './pietaSla.js'
import { chaveAcao, ENTIDADE_ACOES, juntarAcoes, montarGestao, resumoGestao, validarAcao } from './engenhariaGestao.js'
import { registrarNoGroner } from './gronerAcoes.js'
import prazosArquivo from './data/sla-etapas.json' with { type: 'json' }

const TTL_MS = 2 * 60 * 1000

function igual(recebido, esperado) {
  const a = Buffer.from(String(recebido ?? ''), 'utf8')
  const b = Buffer.from(String(esperado ?? ''), 'utf8')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function responderErro(res, err) {
  if (!err.status || err.status >= 500) console.error('[indicadores]', err.message)
  res.status(err.status || 500).json({ error: err.status && err.status < 500 ? err.message : 'Falha ao montar os indicadores' })
}

/**
 * @param carregar (entidade) => Promise<{ items, sync? } | null> — leitura do Neon
 * @param pg () => cliente de server/pgSql.js (metas)
 * @param prazos tabela de prazo por etapa (server/data/sla-etapas.json)
 */
export function createIndicadoresRouter({
  carregar = loadSyncedEntity,
  pg = getPgSql,
  prazos = prazosArquivo.prazos,
  enriquecimento = salesEnriquecido,
  statusSync = null, // (entidade) => Promise<status|null> — data do último tick (sourceUpdatedAt); null = só a da última carga
  gronerAcoes = null, // () => Promise<{ criarTarefa, comentar, tarefasDoCard, usuarios }> — grava a ação no card do Groner; null = não grava
  carregarPieta = null, // () => { resumoProjetos, registros, resumoEm, estado } — padrão: lê do Neon
  agora = () => Date.now(),
  ttlMs = TTL_MS,
} = {}) {
  const router = express.Router()
  const prefixo = `indicadores-${crypto.randomUUID()}` // cache próprio por roteador (testes isolados)

  const ler = async (entidade) => (await carregar(entidade)) ?? null

  /**
   * Quando os dados foram atualizados de verdade: o manifesto só guarda a última carga COMPLETA (de madrugada);
   * o tick incremental (a cada poucos minutos) grava a data dele no status. Vale a mais recente das duas.
   */
  const atualizadoEm = async (entidade, dados) => {
    const st = statusSync ? await statusSync(entidade).catch(() => null) : null
    const datas = [dados?.sync?.finishedAt, st?.lastSuccessfulRunAt, st?.sourceUpdatedAt].filter((d) => Number.isFinite(Date.parse(d)))
    return datas.length ? datas.reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a)) : null
  }

  const projetos = () => cached(`${prefixo}-projetos`, ttlMs, async () => {
    const dados = await ler('projetos')
    const t = agora()
    const items = (dados?.items ?? []).map((p) => normalizarProjetoLido(p, dealsEnriquecido, t))
    return {
      atualizadoEm: await atualizadoEm('projetos', dados),
      cards: montarCards(items, { agora: t, prazos }),
      engResumo: montarEngResumo(items, { agora: t, prazos }),
    }
  })

  const sales = () => cached(`${prefixo}-sales`, ttlMs, async () => {
    const [vendas, propostas] = await Promise.all([ler('vendas'), ler('propostas')])
    return {
      atualizadoEm: vendas?.sync?.finishedAt ?? null,
      sales: montarSales(vendas?.items ?? [], { propostas: propostas?.items ?? [], enriquecimento }),
    }
  })

  const pieta = () => cached(`${prefixo}-pieta`, ttlMs, async () => {
    const lerNeon = async () => {
      const cliente = pg()
      if (!cliente) throw Object.assign(new Error('Banco de dados não configurado'), { status: 503 })
      return lerPietaParaSla(cliente)
    }
    const d = await (carregarPieta ?? lerNeon)()
    const chamados = montarChamadosSla(d.resumoProjetos, d.registros, { agora: new Date(agora()) })
    return { chamados, cobertura: resumoDaCobertura(chamados, { resumoEm: d.resumoEm, estado: d.estado }) }
  })

  const enviar = (res, lista) => {
    res.set('Cache-Control', 'private, max-age=60')
    res.json(lista)
  }

  router.get('/cards', async (_req, res) => {
    try { enviar(res, (await projetos()).cards) } catch (err) { responderErro(res, err) }
  })

  router.get('/eng-resumo', async (_req, res) => {
    try { enviar(res, (await projetos()).engResumo) } catch (err) { responderErro(res, err) }
  })

  router.get('/sales', async (_req, res) => {
    try { enviar(res, (await sales()).sales) } catch (err) { responderErro(res, err) }
  })

  router.get('/pieta', async (_req, res) => {
    try { enviar(res, (await pieta()).chamados) } catch (err) { responderErro(res, err) }
  })

  router.get('/pieta/status', async (_req, res) => {
    try { res.set('Cache-Control', 'private, max-age=60'); res.json({ fonte: 'neon', ...(await pieta()).cobertura }) } catch (err) { responderErro(res, err) }
  })

  router.get('/status', async (_req, res) => {
    try {
      const [p, s] = await Promise.all([projetos(), sales()])
      const aviso = p.cards.length
        ? null
        : 'Ainda não há projetos no banco: cards e resumo da engenharia ficam vazios até a carga de projetos.'
      res.json({
        fonte: 'neon',
        geradoEm: new Date(agora()).toISOString(),
        aviso,
        cards: { total: p.cards.length, atualizadoEm: p.atualizadoEm, lacunas: LACUNAS.cards },
        eng_resumo: { total: p.engResumo.length, atualizadoEm: p.atualizadoEm, lacunas: LACUNAS.eng_resumo },
        sales: { total: s.sales.length, atualizadoEm: s.atualizadoEm, lacunas: LACUNAS.sales },
        metas: { armazenamento: pg() ? 'neon' : null, edicaoProtegida: Boolean(process.env.METAS_TOKEN) },
      })
    } catch (err) { responderErro(res, err) }
  })

  const clientePg = () => {
    const cliente = pg()
    if (!cliente) throw Object.assign(new Error('Armazenamento das metas não configurado'), { status: 503 })
    return cliente
  }

  const idDaMeta = (req) => {
    const id = String(req.params.id ?? '')
    if (!ID_META.test(id)) throw Object.assign(new Error('Identificador de meta inválido'), { status: 400 })
    return id
  }

  router.get('/metas/:id', async (req, res) => {
    try {
      const id = idDaMeta(req)
      const linhas = await clientePg().rows(
        `select dados from ${TABELA_SQL} where tipo = 'config' and entidade = 'vendas' and chave = $1`,
        [`meta:${id}`],
      )
      const dados = jsonb(linhas[0]?.dados) ?? null
      res.set('Cache-Control', 'no-store')
      res.json({ id, existe: Boolean(dados), dados })
    } catch (err) { responderErro(res, err) }
  })

  router.put('/metas/:id', async (req, res) => {
    try {
      const token = process.env.METAS_TOKEN
      if (token && !igual(req.get('X-Metas-Token'), token)) return res.status(401).json({ error: 'Código das metas inválido' })
      const id = idDaMeta(req)
      const vendedores = [...new Set((await sales()).sales.map((s) => s.vendedor).filter(Boolean))]
      const dados = validarMeta(id, req.body, vendedores)
      await clientePg().upsert([{ tipo: 'config', entidade: 'vendas', chave: `meta:${id}`, dados }])
      res.json({ id, ok: true, dados })
    } catch (err) { responderErro(res, err) }
  })

  // ---- Gestão diária da Engenharia ----
  const escritaLiberada = (req) => {
    const token = process.env.METAS_TOKEN
    return !token || igual(req.get('X-Metas-Token'), token)
  }

  const gestao = async () => {
    const p = await projetos()
    return { atualizadoEm: p.atualizadoEm, itens: montarGestao(p.cards, { prazos }) }
  }

  router.get('/engenharia/gestao', async (_req, res) => {
    try {
      const { atualizadoEm, itens } = await gestao()
      const linhas = await clientePg().todas('config', ENTIDADE_ACOES)
        .then((l) => l.filter((x) => x.chave.startsWith('acao:')))
      const { abertas, resolver } = juntarAcoes(itens, linhas, { agora: new Date(agora()) })
      if (resolver.length) await clientePg().upsert(resolver.map((r) => ({ tipo: 'config', entidade: ENTIDADE_ACOES, chave: r.chave, dados: r.dados })))
      res.set('Cache-Control', 'no-store')
      res.json({
        atualizadoEm,
        resumo: resumoGestao(itens),
        acoes: abertas,
        itens: itens.map(({ prioridade: _p, ...resto }) => ({ ...resto, acao: abertas[chaveAcao(resto.codigo, resto.funil)] ?? null })),
      })
    } catch (err) { responderErro(res, err) }
  })

  const usuariosGroner = () => cached(`${prefixo}-usuarios`, 10 * 60 * 1000, async () => {
    if (!gronerAcoes) return []
    return (await gronerAcoes()).usuarios()
  })

  router.get('/engenharia/usuarios', async (_req, res) => {
    try { res.set('Cache-Control', 'private, max-age=300'); res.json(await usuariosGroner()) } catch (err) { responderErro(res, err) }
  })

  router.put('/engenharia/acoes/:codigo/:funil', async (req, res) => {
    try {
      if (!escritaLiberada(req)) return res.status(401).json({ error: 'Código de edição inválido' })
      const { codigo, funil } = req.params
      const { itens } = await gestao()
      const card = itens.find((i) => String(i.codigo) === codigo && i.funil === funil)
      const campos = validarAcao({ codigo, funil }, req.body, card)
      const chave = chaveAcao(codigo, funil)
      const antes = (await clientePg().todas('config', ENTIDADE_ACOES)).find((x) => x.chave === chave)?.dados
      const agoraIso = new Date(agora()).toISOString()
      const aberta = antes && !antes.concluida ? antes : null
      const dados = {
        ...campos, codigo: Number(codigo), funil, etapa: card.etapa, concluida: false,
        criadaEm: aberta ? aberta.criadaEm : agoraIso, atualizadaEm: agoraIso,
        tarefaId: aberta?.tarefaId ?? null,
      }
      // 1) Salva no painel (Neon) primeiro: o combinado nunca se perde se o Groner estiver lento ou fora.
      await clientePg().upsert([{ tipo: 'config', entidade: ENTIDADE_ACOES, chave, dados }])
      // 2) Grava no card do Groner (tarefa com prazo e responsável + comentário do que foi combinado).
      if (gronerAcoes) {
        const responsavelId = Number(req.body?.responsavelId) || null
        const registro = await registrarNoGroner({
          deps: await gronerAcoes(), item: card, acao: campos.acao, responsavel: campos.responsavel, responsavelId,
          prazo: campos.prazo, tarefaId: dados.tarefaId, agora: new Date(agora()),
        })
        Object.assign(dados, { tarefaId: registro.tarefaId, gronerEm: registro.gronerEm, gronerErro: registro.gronerErro, responsavelId })
        await clientePg().upsert([{ tipo: 'config', entidade: ENTIDADE_ACOES, chave, dados }])
      }
      res.json({ ok: true, dados })
    } catch (err) { responderErro(res, err) }
  })

  router.post('/engenharia/acoes/:codigo/:funil/concluir', async (req, res) => {
    try {
      if (!escritaLiberada(req)) return res.status(401).json({ error: 'Código de edição inválido' })
      const { codigo, funil } = req.params
      const chave = chaveAcao(codigo, funil)
      const atual = (await clientePg().todas('config', ENTIDADE_ACOES)).find((x) => x.chave === chave)?.dados
      if (!atual || atual.concluida) return res.status(404).json({ error: 'Não há ação aberta para este card' })
      const dados = { ...atual, concluida: true, concluidaEm: new Date(agora()).toISOString(), motivo: 'marcada como feita' }
      await clientePg().upsert([{ tipo: 'config', entidade: ENTIDADE_ACOES, chave, dados }])
      let groner = null
      if (gronerAcoes && atual.tarefaId) {
        const { itens } = await gestao()
        const card = itens.find((i) => String(i.codigo) === codigo && i.funil === funil)
        groner = await registrarNoGroner({
          deps: await gronerAcoes(), item: card ?? { codigo: Number(codigo), funil, etapa: atual.etapa, problema: '' }, acao: atual.acao,
          responsavel: atual.responsavel, prazo: atual.prazo, tarefaId: atual.tarefaId, tipo: 'feito', agora: new Date(agora()),
        })
      }
      res.json({ ok: true, groner })
    } catch (err) { responderErro(res, err) }
  })

  router.invalidar = () => {
    invalidate(`${prefixo}-projetos`)
    invalidate(`${prefixo}-sales`)
    invalidate(`${prefixo}-pieta`)
  }

  return router
}
