/**
 * Rotas da Engenharia:
 *   GET  /api/engenharia                       Pauta + Painel calculados ao vivo
 *   PUT  /api/engenharia/acoes/:id             salva a ação combinada do card   (código da equipe)
 *   POST /api/engenharia/acoes/:id/concluir    marca a ação como feita          (código da equipe)
 *   GET  /api/engenharia/acoes/:id/historico   últimas 20 versões da ação do card  (código da equipe)
 *   PUT  /api/engenharia/prazos                prazos por marco e meta          (código de administração)
 *
 * Códigos: ENGENHARIA_EQUIPE_TOKEN e ENGENHARIA_ADMIN_TOKEN, enviados no
 * header X-Engenharia-Token. Sem a variável, a escrita correspondente fica
 * desligada (403) e a tela mostra somente leitura.
 */
import crypto from 'node:crypto'
import express from 'express'
import { montarEngenharia } from './engenharia.js'
import { engenhariaStore, validarAcao, validarPrazos } from './engenhariaStore.js'

function igual(recebido, esperado) {
  const a = Buffer.from(String(recebido ?? ''), 'utf8')
  const b = Buffer.from(String(esperado ?? ''), 'utf8')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function exigir(variavel) {
  return (req, res, next) => {
    const esperado = process.env[variavel]
    if (!esperado) return res.status(403).json({ error: 'Edição desligada neste ambiente' })
    if (!igual(req.get('X-Engenharia-Token'), esperado)) return res.status(401).json({ error: 'Código inválido' })
    next()
  }
}

function idDoCard(req) {
  const id = String(req.params.id ?? '')
  if (!/^[1-9]\d{0,11}$/.test(id)) throw Object.assign(new Error('Card inválido'), { status: 400 })
  return id
}

function store() {
  const s = engenhariaStore()
  if (!s) throw Object.assign(new Error('Armazenamento da Engenharia não configurado'), { status: 503 })
  return s
}

const autor = (req) => String(req.body?.por ?? '').replace(/\s+/g, ' ').trim().slice(0, 60) || null

function responderErro(res, err) {
  if (!err.status || err.status >= 500) console.error('[engenharia]', err.message)
  res.status(err.status || 500).json({ error: err.status && err.status < 500 ? err.message : 'Falha ao processar a Engenharia' })
}

/**
 * @param carregarProjetos () => Promise<{ items, sync? }> — projetos normalizados
 * @param carregarPropostas () => Promise<{ items }> — propostas (kWp/valor da aceita)
 * @param statusSync () => Promise<object|null> — status da sincronização de projetos
 */
export function createEngenhariaRouter({ carregarProjetos, carregarPropostas = async () => ({ items: [] }), statusSync = async () => null, agora = () => new Date() }) {
  const router = express.Router()

  router.get('/', async (_req, res) => {
    try {
      const s = engenhariaStore()
      const [dados, propostas, acoes, config, fonte] = await Promise.all([
        carregarProjetos(),
        carregarPropostas().then((r) => r.items).catch((err) => { console.error('[engenharia] propostas indisponíveis:', err.message); return [] }),
        s ? s.listarAcoes() : {},
        s ? s.obterConfig() : null,
        statusSync().catch(() => null),
      ])
      const resposta = montarEngenharia({ projetos: dados.items, propostas, acoes, config, agora: agora(), fonte })
      resposta.edicao = {
        armazenamento: Boolean(s),
        acoes: Boolean(s && process.env.ENGENHARIA_EQUIPE_TOKEN),
        prazos: Boolean(s && process.env.ENGENHARIA_ADMIN_TOKEN),
      }
      res.set('Cache-Control', 'no-store').json(resposta)
    } catch (err) {
      responderErro(res, err)
    }
  })

  router.put('/acoes/:id', exigir('ENGENHARIA_EQUIPE_TOKEN'), async (req, res) => {
    try {
      const id = idDoCard(req)
      const registro = { ...validarAcao(req.body), feita: false, em: agora().toISOString(), por: autor(req) }
      res.json(await store().salvarAcao(id, registro))
    } catch (err) {
      responderErro(res, err)
    }
  })

  router.post('/acoes/:id/concluir', exigir('ENGENHARIA_EQUIPE_TOKEN'), async (req, res) => {
    try {
      const id = idDoCard(req)
      const s = store()
      const atual = await s.obterAcao(id)
      if (!atual || atual.feita) throw Object.assign(new Error('Não há ação aberta para este card'), { status: 404 })
      res.json(await s.salvarAcao(id, { ...atual, feita: true, em: agora().toISOString(), por: autor(req) }))
    } catch (err) {
      responderErro(res, err)
    }
  })

  router.get('/acoes/:id/historico', exigir('ENGENHARIA_EQUIPE_TOKEN'), async (req, res) => {
    try {
      res.json(await store().historico(idDoCard(req)))
    } catch (err) {
      responderErro(res, err)
    }
  })

  router.put('/prazos', exigir('ENGENHARIA_ADMIN_TOKEN'), async (req, res) => {
    try {
      const config = { ...validarPrazos(req.body), em: agora().toISOString(), por: autor(req) }
      res.json(await store().salvarConfig(config))
    } catch (err) {
      responderErro(res, err)
    }
  })

  return router
}
