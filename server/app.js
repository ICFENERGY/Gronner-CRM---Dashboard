import express from 'express'
import cors from 'cors'
import { gronerGet, gronerGetAll } from './gronerClient.js'
import { cached, invalidate } from './cache.js'
import { gronerFunis } from '../shared/gronerFunis.js'
import { mapVenda, mapProjeto, mapProposta, mapTarefa, mapUsina } from './mappers.js'
import { stripSensitive } from './sanitize.js'
import { dealsEnriquecido, salesEnriquecido } from './enrichment.js'
import { solarzListarUsinas } from './solarzClient.js'

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
    const rawNome = p.etapa || 'Sem Funil'
    const canonicalNome = canonicalLookup.get(normalizeFunilNome(rawNome))
    const entry = porFunilMap.get(canonicalNome) ?? porFunilMap.get(OUTROS_KEY)
    entry.quantidade += 1

    const etapaNome = canonicalNome ? p.status?.nome || 'Sem etapa' : `${rawNome} — ${p.status?.nome || 'Sem etapa'}`
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
    const rawNome = p.etapa || 'Sem Funil'
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
    if (!extra) continue

    if (extra.estado) porEstadoMap.set(extra.estado, (porEstadoMap.get(extra.estado) ?? 0) + 1)
    if (extra.concessionaria) porConcessionariaMap.set(extra.concessionaria, (porConcessionariaMap.get(extra.concessionaria) ?? 0) + 1)
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
  return cached('projetos-brutos', TTL_MS, () => gronerGetAll('Projeto', {}, { pageSize: 500, maxPages: 40 }))
}

export function loadVendasBrutas() {
  return cached('vendas-brutas', TTL_MS, () => gronerGetAll('Venda', {}, { pageSize: 500 }))
}

export function loadPropostasBrutas() {
  return cached('propostas-brutas', TTL_MS, () => gronerGetAll('PreProposta', {}, { pageSize: 500, maxPages: 40 }))
}

export function loadTarefasBrutas() {
  return cached('tarefas-brutas', TTL_MS, () => gronerGetAll('Tarefa', {}, { pageSize: 500, maxPages: 20 }))
}

export function loadUsinasBrutas() {
  return cached('usinas-brutas', TTL_MS, () => solarzListarUsinas())
}

app.use(cors())

app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.get('/api/summary', async (req, res) => {
  try {
    if (req.query.refresh === '1') {
      ;['summary', 'projetos-brutos', 'vendas-brutas', 'propostas-brutas', 'tarefas-brutas'].forEach(invalidate)
    }

    const summary = await cached('summary', TTL_MS, async () => {
      const [leadsPage, vendasAll, propostasAll, projetosAll] = await Promise.all([
        gronerGet('Lead', { pageNumber: 1, pageSize: 1 }),
        loadVendasBrutas(),
        loadPropostasBrutas(),
        loadProjetosBrutos(),
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

      return {
        geradoEm: new Date().toISOString(),
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
          aceitas: propostasAll.summary?.quantidadeTotalPrePropostaAceita ?? 0,
          valorTotalAceita: propostasAll.summary?.valorTotalPrePropostaAceita ?? 0,
          valorTotalGeral: propostasAll.summary?.valorTotalPreProposta ?? 0,
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
    const vendasAll = await loadVendasBrutas()
    res.json(stripSensitive(vendasAll.items.map((v) => mapVenda(v, salesEnriquecido))))
  } catch (err) {
    console.error(err)
    res.status(err.status || 500).json({ error: err.message })
  }
})

app.get('/api/raw/projetos', async (_req, res) => {
  try {
    const projetosAll = await loadProjetosBrutos()
    res.json(stripSensitive(projetosAll.items.map((p) => mapProjeto(p, dealsEnriquecido))))
  } catch (err) {
    console.error(err)
    res.status(err.status || 500).json({ error: err.message })
  }
})

app.get('/api/raw/propostas', async (_req, res) => {
  try {
    const propostasAll = await loadPropostasBrutas()
    res.json(stripSensitive(propostasAll.items.map(mapProposta)))
  } catch (err) {
    console.error(err)
    res.status(err.status || 500).json({ error: err.message })
  }
})

app.get('/api/raw/tarefas', async (_req, res) => {
  try {
    const tarefasAll = await loadTarefasBrutas()
    res.json(stripSensitive(tarefasAll.items.map(mapTarefa)))
  } catch (err) {
    console.error(err)
    res.status(err.status || 500).json({ error: err.message })
  }
})

// --- SolarZ (monitoramento de usinas instaladas) ---

app.get('/api/raw/usinas', async (_req, res) => {
  try {
    const usinas = await loadUsinasBrutas()
    res.json(stripSensitive(usinas.map(mapUsina)))
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
