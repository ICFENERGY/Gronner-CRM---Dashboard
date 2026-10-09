import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const dir = 'n8n/dashboard-sync'
const slugs = ['projetos', 'tarefas', 'propostas', 'vendas']
const fluxos = slugs.map((slug) => ({
  slug,
  fluxo: JSON.parse(fs.readFileSync(`${dir}/sincronizar-${slug}.json`, 'utf8')),
}))
const pagina = JSON.parse(fs.readFileSync(`${dir}/buscar-pagina.json`, 'utf8'))
const incremental = JSON.parse(fs.readFileSync(`${dir}/sincronizar-alteracoes.json`, 'utf8'))

const no = (fluxo, nome) => fluxo.nodes.find((item) => item.name === nome)
const porNome = (fluxo, trecho) => fluxo.nodes.find((item) => item.name.includes(trecho))

test('mantém quatro rotinas independentes e escalonadas nas janelas de 08h e 18h', () => {
  const crons = fluxos.map(({ fluxo }) => {
    const agenda = no(fluxo, 'Agenda 08h e 18h (aguarda ativação)')
    assert.equal(agenda.disabled, true)
    return agenda.parameters.rule.interval[0].expression
  })
  assert.deepEqual(crons, ['0 8,18 * * *', '5 8,18 * * *', '10 8,18 * * *', '15 8,18 * * *'])
  assert.equal(new Set(fluxos.map(({ fluxo }) => fluxo.name)).size, 4)
})

test('processa cada pagina em lotes leves e usa pagina 100 para propostas', () => {
  const busca = pagina.nodes.find((item) => item.type === 'n8n-nodes-base.httpRequest' && item.parameters.queryParameters?.parameters?.some((x) => x.name === 'pageNumber'))
  assert.equal(busca.parameters.queryParameters.parameters.find((x) => x.name === 'pageSize').value, '={{ $json.pageSize }}')
  assert.equal(busca.parameters.queryParameters.parameters.find((x) => x.name === 'pageNumber').value, '={{ $json.pageNumber }}')

  for (const { slug, fluxo } of fluxos) {
    const config = fluxo.nodes.find((item) => item.name.includes('Configura'))
    assert.match(config.parameters.jsCode, /tamanhoLote: 50/)
    assert.ok(config.parameters.jsCode.includes("tamanhoPagina: entidade.slug === 'propostas' ? 100 : 500"))
    const exec = fluxo.nodes.find((item) => item.type === 'n8n-nodes-base.executeWorkflow')
    assert.equal(exec.parameters.mode, 'each')
    assert.equal(exec.parameters.options.waitForSubWorkflow, true)
    const soma = no(fluxo, 'Somar e validar paginas')
    assert.match(soma.parameters.jsCode, /received !== esperado/)
    assert.doesNotMatch(soma.parameters.jsCode, /flatMap/)
    if (slug === 'propostas') assert.match(config.parameters.jsCode, /propostas.*100/)
  }
})

test('calcula o indice global dos lotes da pagina', () => {
  const processar = porNome(pagina, 'Processar lotes da')
  const codigo = processar.parameters.jsCode
  assert.match(codigo, /batchIndex: \(entrada\.pageNumber - 1\) \* porPagina \+ indice \+ 1/)
  assert.match(codigo, /const porPagina = entrada\.pageSize \/ entrada\.tamanhoLote/)
  assert.equal((3 - 1) * (100 / 50) + 0 + 1, 5)
  assert.equal((3 - 1) * (100 / 50) + 1 + 1, 6)
})

test('envia lotes dentro da subexecucao e retorna somente contagens', () => {
  const processar = porNome(pagina, 'Processar lotes da')
  const enviar = porNome(pagina, 'Enviar lote da')
  const validar = porNome(pagina, 'Validar lote da')
  const contar = pagina.nodes.find((item) => item.parameters?.jsCode?.includes("received: soma('received')"))
  assert.match(processar.parameters.jsCode, /pageSize % entrada.tamanhoLote/)
  assert.ok(processar.parameters.jsCode.includes('batchIndex: (entrada.pageNumber - 1) * porPagina + indice + 1'))
  assert.match(enviar.parameters.url, /batches/)
  assert.match(validar.parameters.jsCode, /resposta\.runId !== runId/)
  assert.match(contar.parameters.jsCode, /received: soma/)
  assert.doesNotMatch(contar.parameters.jsCode, /items/)
  for (const { fluxo } of fluxos) {
    assert.equal(fluxo.nodes.some((item) => item.name === 'Upsert no dashboard'), false)
    assert.equal(fluxo.nodes.some((item) => item.name === 'Validar e preparar lotes'), false)
  }
})

test('usa finalizacao separada para remocoes', () => {
  for (const { fluxo } of fluxos) {
    const finalizar = no(fluxo, 'Finalizar carga completa')
    assert.match(finalizar.parameters.url, /finalize/)
    assert.equal(finalizar.credentials.httpHeaderAuth.name, 'Groner Dashboard - Sync')
  }
})

test('toda referência $("nó") nos códigos aponta para um nó existente', () => {
  for (const fluxo of [pagina, ...fluxos.map(({ fluxo }) => fluxo)]) {
    const nomes = new Set(fluxo.nodes.map((item) => item.name))
    for (const item of fluxo.nodes) {
      const codigo = item.parameters?.jsCode ?? ''
      for (const [, ref] of codigo.matchAll(/\$\('([^']+)'\)/g)) {
        assert.ok(nomes.has(ref), `${fluxo.name} › ${item.name} referencia nó inexistente: ${ref}`)
      }
    }
  }
})

test('regex dos códigos do n8n não perdem a barra invertida no gerador', () => {
  // Em template literal, "\d" vira "d": o filtro de fuso nunca casava e o incremental não achava nada.
  const extrair = incremental.nodes.find((item) => item.name === 'Extrair alterações').parameters.jsCode
  const fuso = new RegExp(extrair.match(/Date\.parse\(\/(\^.*?\$)\//)[1])
  assert.equal(fuso.test('2026-10-05T16:48:16.31'), true)
  for (const fluxo of [pagina, incremental, ...fluxos.map(({ fluxo }) => fluxo)]) {
    for (const item of fluxo.nodes) {
      const codigo = item.parameters?.jsCode ?? ''
      assert.doesNotMatch(codigo, /replace\(\/s\+\//, `${fluxo.name} › ${item.name}: /s+/ sem barra troca a letra s`)
      assert.doesNotMatch(codigo, /\/\^d\{4\}/, `${fluxo.name} › ${item.name}: \\d virou d`)
    }
  }
})

test('não salva execuções com dados comerciais nem versiona segredos', () => {
  const bruto = [
    fs.readFileSync(`${dir}/buscar-pagina.json`, 'utf8'),
    ...slugs.map((slug) => fs.readFileSync(`${dir}/sincronizar-${slug}.json`, 'utf8')),
  ].join('\n')
  assert.match(bruto, /\{tenant\}/)
  assert.doesNotMatch(bruto, /Bearer\s+[A-Za-z0-9._-]+/i)
  assert.doesNotMatch(bruto, /"id"\s*:\s*"[A-Za-z0-9]{10,}"\s*,\s*"name"\s*:\s*"GronerZap - Groner API leitura"/)
  for (const fluxo of [pagina, ...fluxos.map(({ fluxo }) => fluxo)]) {
    assert.equal(fluxo.settings.saveDataSuccessExecution, 'none')
    assert.equal(fluxo.settings.saveDataErrorExecution, 'none')
    assert.equal(fluxo.settings.saveManualExecutions, false)
  }
})

test('mantem fluxo incremental de 5 minutos desativado e protegido por cursor', () => {
  const agenda = incremental.nodes.find((item) => item.type === 'n8n-nodes-base.scheduleTrigger')
  assert.equal(agenda.disabled, true)
  assert.equal(agenda.parameters.rule.interval[0].expression, '*/5 * * * *')
  const cursor = incremental.nodes.find((item) => item.name === 'Ler cursor')
  const upsert = incremental.nodes.find((item) => item.name === 'Upsert incremental')
  assert.match(cursor.parameters.url, /\/cursor/)
  assert.match(upsert.parameters.url, /\/changes/)
  assert.match(incremental.nodes.find((item) => item.name === 'Configuração').parameters.jsCode, /cursorAnterior/)
  const busca = incremental.nodes.find((item) => item.name === 'Buscar página alterada')
  // Pagina sob demanda: para quando o card mais antigo da página fica antes do cursor.
  const paginacao = busca.parameters.options.pagination.pagination
  assert.equal(paginacao.maxRequests, 10)
  assert.match(paginacao.completeExpression, /cursorInicio/)
  assert.match(paginacao.completeExpression, /-03:00/)
  assert.equal(busca.parameters.queryParameters.parameters.some((item) => item.name === 'pageNumber'), false)
  assert.ok(busca.parameters.queryParameters.parameters.some((item) => item.name === 'ordenarPor'))
  assert.equal(busca.parameters.queryParameters.parameters.find((item) => item.name === 'ordenarPor').value, 'DataAtualizacao_DESC')
  assert.equal(busca.parameters.queryParameters.parameters.some((item) => item.name === 'ordem'), false)
  assert.equal(busca.parameters.queryParameters.parameters.some((item) => item.name === 'dataInicio'), false)
  assert.ok(incremental.nodes.some((item) => item.name === 'Buscar detalhe dos alterados'))
  assert.ok(incremental.nodes.some((item) => item.name === 'Buscar campos personalizados dos alterados'))
  assert.match(incremental.nodes.find((item) => item.name === 'Extrair alterações').parameters.jsCode, /Limite de páginas incrementais atingido/)
  assert.match(incremental.nodes.find((item) => item.name === 'Extrair alterações').parameters.jsCode, /-03:00/)
})
