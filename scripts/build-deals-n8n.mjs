import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, execFile } from 'node:child_process'

const input = process.argv[2] || 'conversa-claude-codex/anexos/Deals.xlsx'
const output = process.argv[3] || 'conversa-claude-codex/anexos/Deals-formato-n8n.xlsx'
const TAR = process.platform === 'win32' ? 'C:\\Windows\\System32\\tar.exe' : 'tar'

const xmlEscape = (value) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&apos;')

const xmlUnescape = (value) => String(value ?? '')
  .replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"')
  .replaceAll('&apos;', "'").replaceAll('&amp;', '&')

function zipEntry(file, entry) {
  return execFileSync(TAR, ['-xOf', file, entry], { encoding: 'utf8', maxBuffer: 80 * 1024 * 1024 })
}

function sharedStrings(xml) {
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) =>
    [...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((part) => xmlUnescape(part[1])).join(''),
  )
}

function parseCells(sheetXml, strings) {
  const rows = []
  for (const rowMatch of sheetXml.matchAll(/<row\b[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = {}
    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*?)>([\s\S]*?)<\/c>|<c\b([^>]*?)\/>/g)) {
      const attrs = cellMatch[1] || cellMatch[3] || ''
      const body = cellMatch[2] || ''
      const ref = attrs.match(/\br="([A-Z]+\d+)"/i)?.[1]
      if (!ref) continue
      const type = attrs.match(/\bt="([^"]+)"/i)?.[1] || ''
      const value = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? ''
      const inline = body.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? ''
      const col = ref.match(/[A-Z]+/i)[0]
      let parsed = type === 's' ? strings[Number(value)] : type === 'inlineStr' ? xmlUnescape(inline) : value
      if (parsed === '') parsed = null
      cells[col] = parsed
    }
    rows.push(cells)
  }
  return rows
}

const sourceXml = zipEntry(input, 'xl/worksheets/sheet1.xml')
const strings = sharedStrings(zipEntry(input, 'xl/sharedStrings.xml'))
const rows = parseCells(sourceXml, strings)
const headers = rows.shift()
const source = rows.map((row) => Object.fromEntries(Object.entries(row).map(([col, value]) => [headers[col], value])))

const allowed = [
  'Código', 'Etapa', 'Status', 'Cidade', 'Estado', 'Concessionária', 'Consumo',
  'Proposta Aceita Potência', 'Proposta Aceita Geração mensal', 'Proposta Aceita Valor',
  'Data da venda', 'Data de atualização', 'Previsão de fechamento', 'Data de aceite da proposta',
  'Técnico', 'Projetista', 'Homologador', 'Vendedor', 'Tipo de Telhado', 'Fase energética',
  'Tipo de Edificação', 'Código da unidade consumidora', 'Data de início da instalação',
  'Data de término da instalação', 'Data de Assinatura do Contrato', 'URL do monitoramento',
  'Modelo do monitoramento', 'Data de término da garantia da instalação', 'Quantidade de propostas',
]
const numeric = new Set(['Consumo', 'Proposta Aceita Potência', 'Proposta Aceita Geração mensal', 'Proposta Aceita Valor', 'Quantidade de propostas'])
const dateColumns = new Set(['Data da venda', 'Data de atualização', 'Previsão de fechamento', 'Data de aceite da proposta', 'Data de início da instalação', 'Data de término da instalação', 'Data de Assinatura do Contrato', 'Data de término da garantia da instalação'])
const statusMap = new Map([
  ['FUNIL ENGENHARIA - CRIAR PROP', '1'], ['CRIAR PROJETO->PROPOSTA', '1'], ['CRIAR ABORDAGEM', '1'],
  ['APROVAR PROPOSTA CRIADA', '2'], ['PENDÊNCIAS TÉCNICAS->PROJETOS', '3'], ['APROVAÇÃO TECNICA - VENDA', '3'],
  ['PROPOSTA CRIADA APROVADA', '4'], ['AGUARDANDO ASSINATURA', 'G6'], ['DOCUMENTOS PENDENTES', 'G6'], ['PAGAMENTO REALIZADO', 'G6'],
  ['PIETA_CRIAÇÃO DO PROJETO', '5'], ['PIETA_PARECER SOLICITADO', '5'], ['PENDENCIA DE HOMOLOGAÇÃO', '6'], ['PENDENCIA ICF', '6'],
  ['PENDENCIA DOCUMENTAL/TECNICA', '6'], ['PARECER EMITIDO', '6'], ['PEDIDO ENTREGUE', '7'],
  ['INSTALADOR HOMOLOGADO', '9'], ['AGENDAR INSTALAÇÃO', '9'], ['INSTALAÇÃO AGENDADA', '10'], ['DIARIO DE OBRA', '11'], ['DIARIO DE OBRA / OBRA ANDAMENTO', '11'],
  ['OBRA ANDAMENTO', '11'], ['PENDENCIA DE OBRA', '11'], ['PENDENCIA DE INSTALAÇÃO', '11'], ['AGUARDANDO VISTORIA', '12'],
  ['PENDENCIA VIST. CONCESSIONARIA', '12'], ['RELÓGIO TROCADO', '13'], ['INSTALAÇÃO APP MONITORAMENTO', '13'],
  ['APP MONITOR INSTALADO', '14'], ['TERMO DE ACEITE', '15'], ['TERMO DE ACEITE ASSINADO', '15'], ['DOSSIE', '16'], ['DOSSIE ENVIADO', 'FIM'],
])

function normalize(value) {
  return String(value ?? '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}
function number(value) {
  if (value == null || value === '') return null
  const parsed = Number(String(value).replace(',', '.').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}
function date(value) {
  if (value == null || value === '') return null
  if (/^\d+(\.\d+)?$/.test(String(value))) {
    const serial = Number(value)
    if (serial > 20000 && serial < 80000) return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10)
  }
  const parsed = new Date(String(value))
  if (Number.isNaN(parsed.getTime())) return null
  if (parsed.getUTCFullYear() < 1950) return null
  return parsed.toISOString().slice(0, 10)
}
function marco(status) {
  const key = normalize(status).replace(/\s+/g, ' ')
  for (const [label, value] of statusMap) if (normalize(label).replace(/\s+/g, ' ') === key) return value
  return null
}
function daysSince(value, now = Date.now()) {
  const parsed = value ? Date.parse(value) : NaN
  return Number.isFinite(parsed) ? Math.max(0, Math.floor((now - parsed) / 86400000)) : null
}
function cellValue(value, column) {
  if (numeric.has(column)) return number(value)
  if (dateColumns.has(column)) return date(value)
  return value == null || value === '' ? null : String(value).trim()
}

// Referência = data da base (última "Data de atualização"), como nos painéis.
const today = Date.parse(source.map((row) => date(row['Data de atualização'])).filter(Boolean).sort().pop() ?? '') || Date.now()
const outputColumns = [...allowed, 'Marco', 'Momento', 'Dono nominal', 'Dias sem atualização', 'Dias desde a venda', 'Data de entrada no status', 'No fluxo da Engenharia']
const records = source.map((row) => {
  const record = Object.fromEntries(allowed.map((column) => [column, cellValue(row[column], column)]))
  const stage = normalize(record.Etapa)
  const status = normalize(record.Status)
  const marcoAtual = marco(record.Status)
  const fluxo = marcoAtual != null && /^(04\.|06\.|07\.|08\.|09\.|10\.|11\.)/.test(stage) && !(stage.startsWith('04.') && status !== normalize('FUNIL ENGENHARIA - CRIAR PROP'))
  record.Marco = marcoAtual
  record.Momento = marcoAtual === 'FIM' ? 'encerrado' : ['13', '14', '15', '16'].includes(marcoAtual) ? 'gestão da usina' : marcoAtual === 'G6' || (Number(marcoAtual) >= 1 && Number(marcoAtual) <= 4) ? 'pré-venda' : Number(marcoAtual) >= 5 ? 'implantação' : null
  record['Dono nominal'] = record.Técnico || record.Projetista || record.Homologador || null
  record['Dias sem atualização'] = daysSince(record['Data de atualização'], today)
  record['Dias desde a venda'] = daysSince(record['Data da venda'], today)
  record['Data de entrada no status'] = record['Data de atualização']
  record['No fluxo da Engenharia'] = fluxo ? 'sim' : 'não'
  return record
})

function columnName(index) {
  let name = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name
  return name
}
const shared = []
const sharedIndex = new Map()
const sharedValue = (value) => {
  const key = String(value)
  if (!sharedIndex.has(key)) { sharedIndex.set(key, shared.length); shared.push(key) }
  return sharedIndex.get(key)
}
const rowsXml = [
  `<row r="1">${outputColumns.map((column, i) => `<c r="${columnName(i)}1" t="s"><v>${sharedValue(column)}</v></c>`).join('')}</row>`,
  ...records.map((record, rowIndex) => `<row r="${rowIndex + 2}">${outputColumns.map((column, i) => {
    const value = record[column]
    if (value == null || value === '') return `<c r="${columnName(i)}${rowIndex + 2}"/>`
    if (typeof value === 'number') return `<c r="${columnName(i)}${rowIndex + 2}"><v>${value}</v></c>`
    return `<c r="${columnName(i)}${rowIndex + 2}" t="s"><v>${sharedValue(value)}</v></c>`
  }).join('')}</row>`),
].join('')
const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${columnName(outputColumns.length - 1)}${records.length + 1}"/><sheetData>${rowsXml}</sheetData></worksheet>`
const sharedXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.length}" uniqueCount="${shared.length}">${shared.map((value) => `<si><t>${xmlEscape(value)}</t></si>`).join('')}</sst>`
const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Deals" sheetId="1" r:id="rId1"/></sheets></workbook>`
const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`
const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'deals-n8n-'))
for (const [name, content] of [['[Content_Types].xml', types], ['_rels/.rels', rootRels], ['xl/workbook.xml', workbook], ['xl/_rels/workbook.xml.rels', rels], ['xl/worksheets/sheet1.xml', sheet], ['xl/sharedStrings.xml', sharedXml]]) {
  const target = path.join(temp, name)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content)
}
fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true })
// O tar escolhe o formato pela extensão: só grava zip (formato do xlsx) se o destino terminar em .zip.
const zipTemp = path.join(temp, 'saida.zip')
execFileSync(TAR, ['-a', '-c', '-f', zipTemp, '-C', temp, '[Content_Types].xml', '_rels', 'xl'])
fs.copyFileSync(zipTemp, path.resolve(output))
fs.rmSync(temp, { recursive: true, force: true })
console.log(JSON.stringify({ rows: records.length, columns: outputColumns.length, engineering: records.filter((record) => record['No fluxo da Engenharia'] === 'sim').length, output }, null, 2))
