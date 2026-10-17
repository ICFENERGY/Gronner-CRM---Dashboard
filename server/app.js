import express from 'express'
import cors from 'cors'
import { gronerGet, gronerGetAll } from './gronerClient.js'
import { cached, invalidate } from './cache.js'
import { gronerFunis } from '../shared/gronerFunis.js'
import { mapVenda, mapProjeto, normalizarProjetoLido, mapProposta, mapTarefa, mapUsina, mesclarUsinasComRelatorio, mapPietaResumo, mapPietaProjetoDetalhe } from './mappers.js'
import { stripSensitive } from './sanitize.js'
import { dealsEnriquecido, salesEnriquecido, usinasRelatorio } from './enrichment.js'
import { solarzListarUsinas } from './solarzClient.js'
import { pietaResumo, pietaDetalheProjeto } from './pietaClient.js'
import { createSyncRouter } from './syncRoutes.js'
import { createEngenhariaRouter } from './engenhariaRoutes.js'
import { createDealsRouter } from './dealsRoutes.js'
import { getSyncStatuses, loadSyncedEntity } from './syncStore.js'

const app = express()
const TTL_MS = 10 * 60 * 1000

/**
 * O Groner às vezes decora o nome do funil com emojis/espaços extras
 * (ex.: "01. FUNIL OUTBOUND 🎯"), que não batem com o nome exato da
 * planilha de referência. Normaliza removendo emojis e espaços duplicados
 * para conseguir casar com o nome canônico.
 */
function normalizeFunilNome(nome) {
  return nome
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}️]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Agrupa projetos por Funil seguindo a ordem canônica de
 * "groner_funis_etapas felipe.xlsx" (cadeia principal 01-17 + processos
 * paralelos), e dentro de cada funil por Etapa (project.status.nome),
 * também na ordem canônica da planilha. Funis/etapas sem projeto no momento
 * aparecem com quantidade 0, para manter o funil completo visível.
 */
function buildPorFunil(projetos) {
  const { funilOrdem, funilEtapas, funilCategoria, categoriaCor, cadeiaPrincipal } = gronerFunis
  const canonicalLookup = new Map(funilOrdem.map((nome) => [normalizeFunilNome(nome), nome]))

  const porFunilMap = new Map()
  for (const funil of funilOrdem) {
    porFunilMap.set(funil, {
      funil,
      categoria: funilCategoria[funil] ?? 'outros',
      cor: categoriaCor[funilCategoria[funil]] ?? '#94a3b8',
      cadeiaPrincipal: cadeiaPrincipal.includes(funil),
      quantidade: 0,
      etapas: new Map((funilEtapas[funil] ?? []).map((nome) => [nome, { etapa: nome, quantidade: 0 }])),
    })
  }
  const OUTROS_KEY = 'Outros / não mapeados'
  porFunilMap.set(OUTROS_KEY, {
    funil: OUTROS_KEY,
    categoria: 'outros',
    cor: categoriaCor.outros ?? '#94a3b8',
    cadeiaPrincipal: false,
    quantidade: 0,
    etapas: new Map(),
  })

  for (const p of projetos) {
    const rawNome = p.funil || p.etapa || 'Sem Funil'
    const canonicalNome = canonicalLookup.get(normalizeFunilNome(rawNome))
    const entry = porFunilMap.get(canonicalNome) ?? porFunilMap.get(OUTROS_KEY)
    entry.quantidade += 1

    const etapaAtual = p.status?.nome || p.etapa || 'Sem etapa'
    const etapaNome = canonicalNome ? etapaAtual : `${rawNome} — ${etapaAtual}`
    if (!entry.etapas.has(etapaNome)) entry.etapas.set(etapaNome, { etapa: etapaNome, quantidade: 0 })
    entry.etapas.get(etapaNome).quantidade += 1
  }

  return [...porFunilMap.values()].map((f) => ({ ...f, etapas: [...f.etapas.values()] }))
}

/**
 * Pivô "Contagem de Código" por Funil x Ano de cadastro, no mesmo formato da
 * aba "Resumo" do export Deals.xlsx do Groner — só que aqui com dados vivos
 * da API em vez de uma planilha estática.
 */
function buildPivotFunilAno(projetos) {
  const { funilOrdem, funilCategoria, categoriaCor, cadeiaPrincipal } = gronerFunis
  const canonicalLookup = new Map(funilOrdem.map((nome) => [normalizeFunilNome(nome), nome]))
  const OUTROS_KEY = 'Outros / não mapeados'

  const porFunilAno = new Map()
  const anosSet = new Set()

  for (const p of projetos) {
    const rawNome = p.funil || p.etapa || 'Sem Funil'
    const funil = canonicalLookup.get(normalizeFunilNome(rawNome)) ?? OUTROS_KEY
    const ano = p.dataInclusao ? p.dataInclusao.slice(0, 4) : 'Sem data'
    anosSet.add(ano)

    if (!porFunilAno.has(funil)) porFunilAno.set(funil, new Map())
    const anos = porFunilAno.get(funil)
    anos.set(ano, (anos.get(ano) ?? 0) + 1)
  }

  const anos = [...anosSet].sort()
  const ordemComOutros = [...funilOrdem, OUTROS_KEY]
  const linhas = ordemComOutros
    .filter((funil) => porFunilAno.has(funil))
    .map((funil) => {
      const anosMap = porFunilAno.get(funil)
      const total = [...anosMap.values()].reduce((s, v) => s + v, 0)
      return {
        funil,
        categoria: funilCategoria[funil] ?? 'outros',
        cor: categoriaCor[funilCategoria[funil]] ?? '#94a3b8',
        cadeiaPrincipal: cadeiaPrincipal.includes(funil),
        porAno: anos.map((ano) => anosMap.get(ano) ?? 0),
        total,
      }
    })

  return { anos, linhas }
}

/**
 * A API do Groner não expõe cidade/estado de forma confiável (ver mappers.js
 * para o histórico). Esses campos vêm do enriquecimento por planilha
 * (Deals.xlsx), casado por Código = Projeto.id.
 */
function buildGeografia(projetos) {
  const porEstadoMap = new Map()
  const porConcessionariaMap = new Map()

  for (const p of projetos) {
    const extra = dealsEnriquecido[String(p.id)]
    const estado = p.estado ?? extra?.estado
    const concessionaria = p.concessionaria ?? extra?.concessionaria
    if (estado) porEstadoMap.set(estado, (porEstadoMap.get(estado) ?? 0) + 1)
    if (concessionaria) porConcessionariaMap.set(concessionaria, (porConcessionariaMap.get(concessionaria) ?? 0) + 1)
  }

  const porEstado = [...porEstadoMap.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  const porConcessionaria = [...porConcessionariaMap.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

  return { porEstado, porConcessionaria }
}

function buildPorCategoria(porFunil) {
  const { categoriaOrdem, categoriaLabel, categoriaCor } = gronerFunis
  const porCategoriaMap = new Map(categoriaOrdem.map((key) => [key, { categoria: key, label: categoriaLabel[key], cor: categoriaCor[key], quantidade: 0 }]))

  for (const f of porFunil) {
    const entry = porCategoriaMap.get(f.categoria)
    if (entry) entry.quantidade += f.quantidade
  }

  return [...porCategoriaMap.values()]
}

// --- Loaders com cache: buscam do Groner e já devolvem só os campos que o
// frontend usa (nunca o objeto bruto). Compartilhados entre /api/summary e
// /api/raw/* para não bater na API do Groner mais de uma vez por TTL.

export function loadProjetosBrutos() {
  return cached('projetos-brutos', TTL_MS, () => gronerGetAll('Projeto', {}, { pageSize: 500, maxPages: 40, concurrency: 12 }))
}

export function loadVendasBrutas() {
  return cached('vendas-brutas', TTL_MS, () => gronerGetAll('Venda', {}, { pageSize: 500, concurrency: 12 }))
}

export function loadPropostasBrutas() {
  return cached('propostas-brutas', TTL_MS, () => gronerGetAll('PreProposta', {}, { pageSize: 500, maxPages: 40, concurrency: 12 }))
}

export function loadTarefasBrutas() {
  return cached('tarefas-brutas', TTL_MS, () => gronerGetAll('Tarefa', {}, { pageSize: 500, maxPages: 20, concurrency: 12 }))
}

async function preferirSincronizado(entity, fallback) {
  try {
    const synced = await loadSyncedEntity(entity)
    if (synced) return synced
  } catch (err) {
    console.error(`[sync] falha ao ler ${entity}; usando API do Groner:`, err.message)
  }
  return fallback()
}

export function loadProjetosDados() {
  return cached('projetos-dados', TTL_MS, async () => {
    const dados = await preferirSincronizado('projetos', async () => {
      const raw = await loadProjetosBrutos()
      const items = stripSensitive(raw.items.map((item) => mapProjeto(item, dealsEnriquecido)))
      return { items, totalItems: raw.totalItems }
    })
    // Corrige registros gravados por versões antigas da sincronização (vendedor em objeto,
    // datas 0001-01-01, cidade da loja) e recalcula os dias derivados da data de hoje.
    const agora = Date.now()
    return { ...dados, items: dados.items.map((p) => normalizarProjetoLido(p, dealsEnriquecido, agora)) }
  })
}

export function loadVendasDados() {
  return cached('vendas-dados', TTL_MS, () => preferirSincronizado('vendas', async () => {
    const raw = await loadVendasBrutas()
    const items = stripSensitive(raw.items.map((item) => mapVenda(item, salesEnriquecido)))
    return { items, totalItems: raw.totalItems }
  }))
}

export function loadPropostasDados() {
  return cached('propostas-dados', TTL_MS, () => preferirSincronizado('propostas', async () => {
    const raw = await loadPropostasBrutas()
    const items = stripSensitive(raw.items.map(mapProposta))
    return { items, totalItems: raw.totalItems }
  }))
}

export function loadTarefasDados() {
  return cached('tarefas-dados', TTL_MS, () => preferirSincronizado('tarefas', async () => {
    const raw = await loadTarefasBrutas()
    const items = stripSensitive(raw.items.map(mapTarefa))
    return { items, totalItems: raw.totalItems }
  }))
}

export function loadUsinasBrutas() {
  return cached('usinas-brutas', TTL_MS, () => solarzListarUsinas())
}

app.use(cors())
app.use(express.json({ limit: '6mb' }))

const syncCacheKeys = {
  projetos: 'projetos-dados',
  vendas: 'vendas-dados',
  propostas: 'propostas-dados',
  tarefas: 'tarefas-dados',
}
app.use('/api/sync/groner', createSyncRouter({
  onFinalized: (entity) => {
    invalidate(syncCacheKeys[entity])
    invalidate('summary')
  },
  onChanged: (entity) => {
    invalidate(syncCacheKeys[entity])
    invalidate('summary')
  },
}))

app.use('/api/engenharia', createEngenhariaRouter({
  carregarProjetos: loadProjetosDados,
  carregarPropostas: loadPropostasDados,
  statusSync: async () => {
    const s = await getSyncStatuses()
    return s.configured ? (s.entities.projetos ?? null) : null
  },
}))

// Download do Deals em .xlsx (link assinado emitido pela ferramenta MCP deals_exportar).
app.use('/api/deals', createDealsRouter({ get: gronerGet }))

app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.get('/api/summary', async (req, res) => {
  try {
    if (req.query.refresh === '1') {
      ;[
        'summary',
        'projetos-brutos', 'vendas-brutas', 'propostas-brutas', 'tarefas-brutas',
        'projetos-dados', 'vendas-dados', 'propostas-dados', 'tarefas-dados',
      ].forEach(invalidate)
    }

    const summary = await cached('summary', TTL_MS, async () => {
      const [leadsPage, vendasAll, propostasAll, projetosAll] = await Promise.all([
        gronerGet('Lead', { pageNumber: 1, pageSize: 1 }),
        loadVendasDados(),
        loadPropostasDados(),
        loadProjetosDados(),
      ])

      const vendas = vendasAll.items
      const valorTotalVendas = vendas.reduce((sum, v) => sum + (v.valorTotal || 0), 0)
      const comissaoTotalVendas = vendas.reduce((sum, v) => sum + (v.valorComissao || 0), 0)

      const porVendedorMap = new Map()
      for (const v of vendas) {
        const key = v.vendedor || 'Sem vendedor'
        const cur = porVendedorMap.get(key) || { vendedor: key, quantidade: 0, valorTotal: 0 }
        cur.quantidade += 1
        cur.valorTotal += v.valorTotal || 0
        porVendedorMap.set(key, cur)
      }
      const porVendedor = [...porVendedorMap.values()].sort((a, b) => b.valorTotal - a.valorTotal)

      const porMesMap = new Map()
      for (const v of vendas) {
        if (!v.dataVenda) continue
        const mes = v.dataVenda.slice(0, 7) // YYYY-MM
        const cur = porMesMap.get(mes) || { mes, quantidade: 0, valorTotal: 0 }
        cur.quantidade += 1
        cur.valorTotal += v.valorTotal || 0
        porMesMap.set(mes, cur)
      }
      const porMes = [...porMesMap.values()].sort((a, b) => a.mes.localeCompare(b.mes))

      const projetos = projetosAll.items
      const porFunil = buildPorFunil(projetos)
      const porCategoria = buildPorCategoria(porFunil)
      const { porEstado, porConcessionaria } = buildGeografia(projetos)
      const pivotFunilAno = buildPivotFunilAno(projetos)

      const syncStatus = await getSyncStatuses()
      const sourceUpdatedAt = Object.values(syncStatus.entities || {})
        .map((status) => status?.sourceUpdatedAt || status?.finishedAt || status?.lastSuccessfulRunAt)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null
      return {
        geradoEm: new Date().toISOString(),
        sourceUpdatedAt,
        syncStatus,
        leads: {
          total: leadsPage.totalItems ?? 0,
        },
        projetos: {
          total: projetosAll.totalItems ?? projetos.length,
          amostra: projetos.length,
          porFunil,
          porCategoria,
          porEstado,
          porConcessionaria,
          pivotFunilAno,
        },
        vendas: {
          total: vendasAll.totalItems ?? vendas.length,
          valorTotal: valorTotalVendas,
          comissaoTotal: comissaoTotalVendas,
          ticketMedio: vendas.length ? valorTotalVendas / vendas.length : 0,
          porVendedor,
          porMes,
        },
        prepropostas: {
          total: propostasAll.totalItems ?? 0,
          aceitas: propostasAll.items.filter((proposta) => proposta.aceita).length,
          valorTotalAceita: propostasAll.items.filter((proposta) => proposta.aceita).reduce((sum, proposta) => sum + (proposta.preco || 0), 0),
          valorTotalGeral: propostasAll.items.reduce((sum, proposta) => sum + (proposta.preco || 0), 0),
        },
      }
    })

    res.json(summary)
  } catch (err) {
    console.error(err)
    res.status(err.status || 500).json({ error: err.message })
  }
})

// --- Endpoints "raw": listas completas e já mapeadas/sanitizadas, para as
// páginas de Vendas / Validação de Cadastro / Indicador de Tarefas filtrarem
// e agregarem no próprio navegador (só dados nossos, nunca o token do Groner).

app.get('/api/raw/vendas', async (_req, res) => {
  try {
    const vendasAll = await loadVendasDados()
    res.json(vendasAll.items)
  } catch (err) {
    console.error(err)
    res.status(err.status || 500).json({ error: err.message })
  }
})

app.get('/api/raw/projetos', async (_req, res) => {
  try {
    const projetosAll = await loadProjetosDados()
    res.json(projetosAll.items)
  } catch (err) {
    console.error(err)
    res.status(err.status || 500).json({ error: err.message })
  }
})

app.get('/api/raw/propostas', async (_req, res) => {
  try {
    const propostasAll = await loadPropostasDados()
    res.json(propostasAll.items)
  } catch (err) {
    console.error(err)
    res.status(err.status || 500).json({ error: err.message })
  }
})

app.get('/api/raw/tarefas', async (_req, res) => {
  try {
    const tarefasAll = await loadTarefasDados()
    res.json(tarefasAll.items)
  } catch (err) {
    console.error(err)
    res.status(err.status || 500).json({ error: err.message })
  }
})

// --- SolarZ (monitoramento de usinas instaladas) ---

app.get('/api/raw/usinas', async (_req, res) => {
  // Bug real (22/09/2026): a SolarZ (monitoramento ao vivo) recusando a
  // autenticação (401 — credencial expirada/regenerada no painel deles)
  // derrubava a aba inteira, mesmo já tendo 126 usinas de relatório
  // cacheadas localmente (server/data/usinas-relatorio.json). Degrada: sem
  // status ao vivo, mas com todo o resto (investimento, desempenho mensal,
  // geração do relatório) — em vez de uma tela em branco com um erro técnico.
  let usinasAoVivo = []
  let avisoIntegracaoSolarZ = null
  try {
    usinasAoVivo = await loadUsinasBrutas()
  } catch (err) {
    console.error('[SolarZ] falha ao buscar status ao vivo — seguindo só com o relatório:', err.message)
    avisoIntegracaoSolarZ =
      err.status === 401
        ? 'Não foi possível atualizar o status ao vivo da SolarZ: credencial de API recusada (401). É provável que o usuário/senha de API tenha sido regerado no painel da SolarZ (Configurações → Usuário de API) — gere um novo e atualize SOLARZ_USER/SOLARZ_PASSWORD. Os dados abaixo são do último relatório importado.'
        : `Não foi possível atualizar o status ao vivo da SolarZ (${err.message}). Os dados abaixo são do último relatório importado.`
  }

  try {
    const mapeadas = usinasAoVivo.map(mapUsina)
    const completas = usinasRelatorio.usinas?.length ? mesclarUsinasComRelatorio(mapeadas, usinasRelatorio) : mapeadas
    res.json(stripSensitive({ usinas: completas, avisoIntegracaoSolarZ }))
  } catch (err) {
    console.error(err)
    res.status(err.status || 500).json({ error: err.message })
  }
})

app.get('/api/raw/usinas/resumo-relatorio', (_req, res) => {
  res.json(stripSensitive({ extraidoEm: usinasRelatorio.extraidoEm ?? null, resumo: usinasRelatorio.resumo ?? {} }))
})

// --- Pieta (plataforma PIEP — integração de projetos) ---

app.get('/api/raw/pieta/resumo', async (_req, res) => {
  try {
    const resumo = await cached('pieta-resumo', TTL_MS, pietaResumo)
    res.json(stripSensitive(mapPietaResumo(resumo)))
  } catch (err) {
    console.error(err)
    res.status(err.status || 500).json({ error: err.message })
  }
})

app.get('/api/raw/pieta/projeto/:projectId', async (req, res) => {
  try {
    const detalhe = await cached(`pieta-projeto-${req.params.projectId}`, TTL_MS, () => pietaDetalheProjeto(req.params.projectId))
    res.json(stripSensitive(mapPietaProjetoDetalhe(detalhe)))
  } catch (err) {
    console.error(err)
    res.status(err.status || 500).json({ error: err.message })
  }
})

// Serve o build estático só no modo "node server/index.js" local
// (`npm start`). Na Vercel os arquivos estáticos são servidos direto pela
// CDN, sem passar pela function.
if (process.env.NODE_ENV === 'production' && !process.env.VERCEL) {
  const path = await import('node:path')
  const distPath = path.resolve(process.cwd(), 'dist')
  app.use(express.static(distPath))
  app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')))
}

export default app
