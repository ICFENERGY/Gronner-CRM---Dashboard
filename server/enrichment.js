import fs from 'node:fs'
import path from 'node:path'

const DATA_DIR = path.resolve(process.cwd(), 'server/data')

/**
 * Dados extraídos de planilhas exportadas do próprio Groner (Deals.xlsx /
 * Sales.xlsx), usadas para enriquecer os registros vindos da API com campos
 * que ela não expõe (cidade/estado, kit técnico, composição de preço).
 * Chaveados por Código = mesmo id de Projeto/Venda na API — validado 1:1
 * antes de integrar (5584/5584 e 177/177 batendo por nome do cliente).
 * Contém só dados operacionais: CPF, e-mail, celular, data de nascimento,
 * renda e patrimônio foram descartados na extração e nunca chegam aqui.
 */
function loadJson(filename) {
  const filePath = path.join(DATA_DIR, filename)
  if (!fs.existsSync(filePath)) return {}
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch (err) {
    console.error(`Falha ao ler ${filename}:`, err.message)
    return {}
  }
}

export const dealsEnriquecido = loadJson('deals-enriquecido.json')
export const salesEnriquecido = loadJson('sales-enriquecido.json')

console.log(
  `Enriquecimento carregado: ${Object.keys(dealsEnriquecido).length} deals, ${Object.keys(salesEnriquecido).length} sales.`,
)
