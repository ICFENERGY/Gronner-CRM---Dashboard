/**
 * Executa os fluxos de carga completa como o n8n faria: roda o jsCode real de
 * cada nó na ordem das conexões, simulando só o Groner, o dashboard e a chamada
 * de subfluxo. Pega erros que os testes de estrutura não pegam (campo lido do
 * nó errado, variável indefinida, índice de lote fora de ordem).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const dir = 'n8n/dashboard-sync'
const ler = (nome) => JSON.parse(fs.readFileSync(`${dir}/${nome}.json`, 'utf8'))
const subfluxo = ler('buscar-pagina')

/** Roda um nó de código ("uma vez para todos os itens") com $ e $input do n8n. */
async function codigo(fluxo, nome, entrada, saidas) {
  const no = fluxo.nodes.find((n) => n.name === nome)
  assert.ok(no, `nó inexistente: ${nome}`)
  const $ = (outro) => {
    const itens = saidas.get(outro)
    if (!itens) throw new Error(`$('${outro}') sem saída — o nó não rodou antes de ${nome}`)
    return { first: () => itens[0], all: () => itens, item: itens[0] }
  }
  const $input = { first: () => entrada[0], all: () => entrada }
  const fn = new Function('$', '$input', `return (async () => {\n${no.parameters.jsCode}\n})()`)
  // Como o n8n: objeto devolvido sem a chave "json" é embrulhado em { json }.
  const saida = (await fn($, $input)).map((item) => (item && typeof item === 'object' && 'json' in item ? item : { json: item }))
  saidas.set(nome, saida)
  return saida
}

const proximo = (fluxo, nome, ramo = 0) => fluxo.connections[nome]?.main?.[ramo]?.[0]?.node ?? null

/**
 * Simula uma execução do subfluxo para uma página.
 * groner.pagina(pageNumber, pageSize) → { totalItems, list }
 */
async function rodarSubfluxo(paginaItem, groner, dashboard) {
  const s = new Map()
  s.set('Chamado pela rotina', [paginaItem])
  const req = paginaItem.json
  const corpo = groner.pagina(req.pageNumber, req.pageSize)
  s.set('Buscar página no Groner', [{ json: { Content: corpo } }])
  let atual = await codigo(subfluxo, 'Extrair página', s.get('Buscar página no Groner'), s)

  // IF "Detalhar projeto?" → ramo 0 (sim) ou 1 (não)
  if (atual[0].json.detalharProjeto === true) {
    const expandidos = await codigo(subfluxo, 'Expandir projetos', atual, s)
    groner.detalhes += expandidos.length
    s.set('Buscar detalhe do projeto', expandidos.map((e, i) => ({ json: { id: e.json.registro.id, tecnicoResponsavel: 'Técnico X' }, pairedItem: { item: i } })))
    s.set('Buscar campos personalizados', expandidos.map((_, i) => ({ json: [], pairedItem: { item: i } })))
    atual = await codigo(subfluxo, 'Consolidar detalhes', s.get('Buscar campos personalizados'), s)
  }
  atual = await codigo(subfluxo, 'Saída da página', atual, s)
  const lotes = await codigo(subfluxo, 'Processar lotes da página', atual, s)
  assert.equal(proximo(subfluxo, 'Processar lotes da página'), 'Enviar lote da página')
  const respostas = lotes.map((l) => ({ json: dashboard.receber(l.json) }))
  s.set('Enviar lote da página', respostas)
  const validados = await codigo(subfluxo, 'Validar lote da página', respostas, s)
  return codigo(subfluxo, 'Contar página processada', validados, s)
}

async function rodarCarga(slug, groner) {
  const fluxo = ler(`sincronizar-${slug}`)
  const s = new Map()
  const lotes = []
  const dashboard = {
    receber(lote) {
      assert.ok(lote.items.length <= 50, 'lote acima de 50')
      lotes.push(lote)
      return { ok: true, runId: lote.runId, batchIndex: lote.batchIndex, expectedTotal: lote.expectedTotal, received: lote.items.length, inserted: lote.items.length, updated: 0, unchanged: 0 }
    },
  }
  const entidade = await codigo(fluxo, 'Entidade', [{ json: {} }], s)
  const cfg = await codigo(fluxo, 'Configuração', entidade, s)
  s.set('Consultar total', [{ json: { Content: { totalItems: groner.total, list: [] } } }])
  const paginas = await codigo(fluxo, 'Gerar páginas', s.get('Consultar total'), s)
  const porPagina = []
  for (const p of paginas) porPagina.push(...await rodarSubfluxo(p, groner, dashboard))
  const soma = await codigo(fluxo, 'Somar e validar paginas', porPagina, s)
  assert.equal(proximo(fluxo, 'Somar e validar paginas'), 'Finalizar carga completa')
  return { cfg: cfg[0].json, paginas, lotes, finalizar: soma[0].json }
}

function grone(total, { status = () => 'VENDA REALIZADA', totalNaPagina = () => total } = {}) {
  return {
    total,
    detalhes: 0,
    pagina(n, tamanho) {
      const inicio = (n - 1) * tamanho
      const list = Array.from({ length: Math.max(0, Math.min(tamanho, total - inicio)) }, (_, i) => {
        const id = inicio + i + 1
        return { id, nome: `Cliente ${id}`, etapa: '09. HOMOLOGAÇÃO', status: { nome: status(id) }, aceita: id % 2 === 0 }
      })
      return { totalItems: totalNaPagina(n), list }
    },
  }
}

test('propostas: páginas de 100, lotes de 50 com índice global e finalização com o total', async () => {
  const groner = grone(230)
  const r = await rodarCarga('propostas', groner)
  assert.equal(r.cfg.tamanhoPagina, 100)
  assert.equal(r.paginas.length, 3)
  assert.deepEqual(r.lotes.map((l) => l.batchIndex), [1, 2, 3, 4, 5])
  assert.ok(r.lotes.every((l) => l.batchCount === 5 && l.expectedTotal === 230 && l.entity === 'propostas'))
  const ids = r.lotes.flatMap((l) => l.items.map((i) => i.id))
  assert.equal(new Set(ids).size, 230)
  assert.equal(r.finalizar.expectedTotal, 230)
  assert.equal(r.finalizar.batchCount, 5)
  assert.equal(r.finalizar.inserted, 230)
  assert.equal(r.finalizar.entity, 'propostas')
  assert.match(r.finalizar.runId, /^propostas-/)
  assert.equal(groner.detalhes, 0)
})

test('projetos: páginas de 500, detalhe só dos cards com marco e normalização aplicada', async () => {
  // Ids com id % 100 < 3 (32 entre 1 e 1.050) estão em status de marco da Engenharia.
  const groner = grone(1050, { status: (id) => (id % 100 < 3 ? 'PENDENCIA ICF' : 'VENDA REALIZADA') })
  const r = await rodarCarga('projetos', groner)
  assert.equal(r.paginas.length, 3)
  assert.equal(r.lotes.length, 21)
  assert.deepEqual(r.lotes.map((l) => l.batchIndex), Array.from({ length: 21 }, (_, i) => i + 1))
  assert.equal(groner.detalhes, 32)
  const comDetalhe = r.lotes.flatMap((l) => l.items).filter((i) => i.detalhe?.tecnicoResponsavel === 'Técnico X')
  assert.equal(comDetalhe.length, 32)
  assert.equal(r.finalizar.expectedTotal, 1050)
  assert.equal(r.finalizar.batchCount, 21)
})

test('total do Groner mudando no meio da carga interrompe antes de finalizar', async () => {
  const groner = grone(230, { totalNaPagina: (n) => (n === 2 ? 231 : 230) })
  await assert.rejects(() => rodarCarga('propostas', groner), /total do Groner mudou/)
})
