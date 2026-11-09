/**
 * Rotas do painel de indicadores (public/indicadores/index.html e aba Vendas):
 *   GET /api/indicadores/cards       formato de docs/data_cards.json
 *   GET /api/indicadores/eng-resumo  formato de docs/data_eng_resumo.json
 *   GET /api/indicadores/sales       formato de docs/data_sales.json
 *   GET /api/indicadores/status      totais, data da última carga e lacunas de cada lista
 *   GET /api/indicadores/metas/:id   meta do vendedor no ano (id = <slug do vendedor>_<ano>)
 *   PUT /api/indicadores/metas/:id   grava a meta
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
  agora = () => Date.now(),
  ttlMs = TTL_MS,
} = {}) {
  const router = express.Router()
  const prefixo = `indicadores-${crypto.randomUUID()}` // cache próprio por roteador (testes isolados)

  const ler = async (entidade) => (await carregar(entidade)) ?? null

  const projetos = () => cached(`${prefixo}-projetos`, ttlMs, async () => {
    const dados = await ler('projetos')
    const t = agora()
    const items = (dados?.items ?? []).map((p) => normalizarProjetoLido(p, dealsEnriquecido, t))
    return {
      atualizadoEm: dados?.sync?.finishedAt ?? null,
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

  router.invalidar = () => {
    invalidate(`${prefixo}-projetos`)
    invalidate(`${prefixo}-sales`)
  }

  return router
}
