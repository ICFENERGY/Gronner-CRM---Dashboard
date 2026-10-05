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

const no = (fluxo, nome) => fluxo.nodes.find((item) => item.name === nome)

test('mantém quatro rotinas independentes e escalonadas nas janelas de 08h e 18h', () => {
  const crons = fluxos.map(({ fluxo }) => {
    const agenda = no(fluxo, 'Agenda 08h e 18h (aguarda ativação)')
    assert.equal(agenda.disabled, true)
    return agenda.parameters.rule.interval[0].expression
  })
  assert.deepEqual(crons, ['0 8,18 * * *', '5 8,18 * * *', '10 8,18 * * *', '15 8,18 * * *'])
  assert.equal(new Set(fluxos.map(({ fluxo }) => fluxo.name)).size, 4)
})

test('pagina em subexecuções de 500 e só prepara lotes após validar a carga completa', () => {
  const busca = no(pagina, 'Buscar página no Groner')
  assert.equal(busca.parameters.queryParameters.parameters.find((x) => x.name === 'pageSize').value, '={{ $json.pageSize }}')
  assert.equal(busca.parameters.queryParameters.parameters.find((x) => x.name === 'pageNumber').value, '={{ $json.pageNumber }}')

  for (const { fluxo } of fluxos) {
    assert.match(no(fluxo, 'Configuração').parameters.jsCode, /tamanhoPagina: 500/)
    assert.match(no(fluxo, 'Configuração').parameters.jsCode, /tamanhoLote: 50/)
    const exec = no(fluxo, 'Buscar páginas separadamente')
    assert.equal(exec.parameters.mode, 'each')
    assert.equal(exec.parameters.options.waitForSubWorkflow, true)
    const lotes = no(fluxo, 'Validar e preparar lotes').parameters.jsCode
    assert.match(lotes, /registros\.length !== totalEsperado/)
    assert.match(lotes, /ID duplicado entre páginas/)
  }
})

test('usa upsert idempotente em lotes e finalização separada para remoções', () => {
  for (const { fluxo } of fluxos) {
    const upsert = no(fluxo, 'Upsert no dashboard')
    const finalizar = no(fluxo, 'Finalizar carga completa')
    assert.equal(upsert.parameters.method, 'POST')
    assert.match(upsert.parameters.url, /\/api\/sync\/groner\/' \+ \$json\.entity \+ '\/batches/)
    assert.match(finalizar.parameters.url, /\/api\/sync\/groner\/' \+ \$json\.entity \+ '\/finalize/)
    assert.equal(upsert.credentials.httpHeaderAuth.name, 'Groner Dashboard - Sync')
    assert.equal(finalizar.credentials.httpHeaderAuth.name, 'Groner Dashboard - Sync')
    assert.match(no(fluxo, 'Validar confirmações').parameters.jsCode, /resposta\.runId !== cfg\.runId/)
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
