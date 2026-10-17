/**
 * Rota de download do Deals:
 *   GET /api/deals/download?f=<filtros>&exp=<epoch>&sig=<HMAC>
 *
 * O link é emitido pela ferramenta MCP `deals_exportar` e assinado com
 * MCP_ACCESS_TOKEN (HMAC-SHA256, expira em 15 min). Sem assinatura válida a
 * resposta é 401. O arquivo é gerado na hora da abertura do link; nenhuma
 * linha é registrada em log nem devolvida em JSON.
 */
import express from 'express'
import { gerarArquivoDeals, nomeDoArquivo, verificarLink } from './deals.js'

const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/**
 * `get` é o cliente do Groner (injetável nos testes); `segredo` e `agora`
 * também, com padrão em MCP_ACCESS_TOKEN e no relógio.
 */
export function createDealsRouter({ get, segredo = () => process.env.MCP_ACCESS_TOKEN, agora = () => Date.now() }) {
  const router = express.Router()

  router.get('/download', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const v = verificarLink(
      { f: req.query.f, exp: req.query.exp, sig: req.query.sig },
      typeof segredo === 'function' ? segredo() : segredo,
      agora(),
    )
    if (!v.ok) {
      return res.status(401).json({ error: v.motivo === 'expirado' ? 'Link expirado; peça um novo.' : 'Link inválido.' })
    }
    try {
      const { buffer, resumo } = await gerarArquivoDeals({ get, filtros: v.filtros })
      res.setHeader('Content-Type', TIPO_XLSX)
      res.setHeader('Content-Disposition', `attachment; filename="${nomeDoArquivo(new Date(agora()))}"`)
      res.setHeader('X-Deals-Resumo', encodeURIComponent(resumo))
      return res.status(200).send(buffer)
    } catch (e) {
      const status = e.status && e.status < 500 ? e.status : 502
      // Só a mensagem (sem dados de cliente) vai para o log e para a resposta.
      console.error('[deals] falha ao gerar:', e.codigo ?? '', e.message)
      const mostrar = status !== 502 || e.codigo === 'DETALHE'
      return res.status(status).json({ error: mostrar ? e.message : 'Falha ao consultar o Groner.' })
    }
  })

  return router
}
