/**
 * Regras da tela "Mapa das Usinas": região do IBGE por UF, posição aproximada no mapa (centro da UF com um
 * deslocamento fixo por cidade e por usina, sem endereço exato), mês de referência e agregações dos cartões.
 * Funções puras, sem React.
 */
import type { UsinaRaw } from '../../api/types'
import { CONTORNOS_UF } from './mapaBrasil'

export const REGIOES = ['Sudeste', 'Sul', 'Norte', 'Nordeste', 'Centro-Oeste'] as const
export type Regiao = (typeof REGIOES)[number] | 'Não informado'

const UF_REGIAO: Record<string, Regiao> = {
  AC: 'Norte', AM: 'Norte', AP: 'Norte', PA: 'Norte', RO: 'Norte', RR: 'Norte', TO: 'Norte',
  AL: 'Nordeste', BA: 'Nordeste', CE: 'Nordeste', MA: 'Nordeste', PB: 'Nordeste', PE: 'Nordeste', PI: 'Nordeste', RN: 'Nordeste', SE: 'Nordeste',
  DF: 'Centro-Oeste', GO: 'Centro-Oeste', MS: 'Centro-Oeste', MT: 'Centro-Oeste',
  ES: 'Sudeste', MG: 'Sudeste', RJ: 'Sudeste', SP: 'Sudeste',
  PR: 'Sul', RS: 'Sul', SC: 'Sul',
}

/** UF válida em maiúsculas, ou null ("Pendente", vazio, texto livre). */
export function ufValida(uf: string | null | undefined): string | null {
  const s = (uf ?? '').trim().toUpperCase()
  return UF_REGIAO[s] ? s : null
}

export const regiaoDaUf = (uf: string | null | undefined): Regiao => UF_REGIAO[ufValida(uf) ?? ''] ?? 'Não informado'

export const STATUS_DESEMPENHO = ['Dentro do esperado', 'Atenção', 'Crítico', 'Sem dado'] as const
export type StatusDesempenho = (typeof STATUS_DESEMPENHO)[number]
export const statusDe = (u: UsinaRaw): StatusDesempenho =>
  (STATUS_DESEMPENHO as readonly string[]).includes(u.statusDesempenho ?? '') ? (u.statusDesempenho as StatusDesempenho) : 'Sem dado'

/** Cor de cada status (tokens do tema; as mesmas no mapa, na rosca e na legenda). */
export const COR_STATUS: Record<StatusDesempenho, string> = {
  'Dentro do esperado': 'var(--st-ok)',
  Atenção: 'var(--st-risco)',
  Crítico: 'var(--st-atrasado)',
  'Sem dado': 'var(--viz-outros)',
}

const MESES_NOME = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const MESES_ABREV = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']

/** Último mês fechado em relação a hoje (AAAA-MM-DD): { rotulo:'setembro/2026', curto:'SET/26' }. */
export function mesReferencia(hoje: string) {
  let a = Number(hoje.slice(0, 4))
  let m = Number(hoje.slice(5, 7)) - 1
  if (m === 0) { m = 12; a -= 1 }
  return { rotulo: `${MESES_NOME[m - 1]}/${a}`, curto: `${MESES_ABREV[m - 1]}/${String(a).slice(2)}` }
}

/** Números dos três cartões e da rosca. */
export function resumoParque(usinas: UsinaRaw[], hoje: string) {
  const ref = mesReferencia(hoje)
  const kwp = usinas.reduce((s, u) => s + (u.potenciaKwp ?? 0), 0)
  const comPotencia = usinas.filter((u) => u.potenciaKwp != null).length
  const fechadas = usinas.filter((u) => u.mesAnoRecente === ref.rotulo && u.geracaoKwhMes != null)
  const geracaoKwh = fechadas.reduce((s, u) => s + (u.geracaoKwhMes ?? 0), 0)
  const status = STATUS_DESEMPENHO.map((s) => ({ status: s, qtd: usinas.filter((u) => statusDe(u) === s).length }))
  return { ref, total: usinas.length, kwp, comPotencia, geracaoKwh, fechadas: fechadas.length, status }
}

/** Entra no mapa quem tem UF cadastrada. */
export const entraNoMapa = (u: UsinaRaw) => Boolean(ufValida(u.estado))

/** Potência por região (MW), da maior para a menor, das usinas com potência; "Não informado" (potência sem UF) por último, se houver. */
export function potenciaPorRegiao(usinas: UsinaRaw[]) {
  const soma = new Map<Regiao, { kwp: number; qtd: number }>()
  for (const u of usinas) {
    if (u.potenciaKwp == null) continue
    const r = regiaoDaUf(u.estado)
    const cur = soma.get(r) ?? { kwp: 0, qtd: 0 }
    cur.kwp += u.potenciaKwp ?? 0
    cur.qtd += 1
    soma.set(r, cur)
  }
  const linhas = [...REGIOES, 'Não informado' as const].map((regiao) => ({ regiao, mw: (soma.get(regiao)?.kwp ?? 0) / 1000, qtd: soma.get(regiao)?.qtd ?? 0 }))
  const conhecidas = linhas.filter((l) => l.regiao !== 'Não informado').sort((a, b) => b.mw - a.mw)
  const semUf = linhas.find((l) => l.regiao === 'Não informado')!
  return semUf.qtd ? [...conhecidas, semUf] : conhecidas
}

// ---------- posição no mapa ----------
type Ponto = [number, number]
const ANEIS: Record<string, Ponto[][]> = Object.fromEntries(
  CONTORNOS_UF.map((c) => [c.uf, c.d.split('M').filter(Boolean).map((anel) => anel.replace('Z', '').split('L').map((p) => p.split(',').map(Number) as Ponto))]),
)
const CAIXA: Record<string, { w: number; h: number }> = Object.fromEntries(
  Object.entries(ANEIS).map(([uf, aneis]) => {
    const xs = aneis.flat().map((p) => p[0]); const ys = aneis.flat().map((p) => p[1])
    return [uf, { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }]
  }),
)
const CENTRO: Record<string, Ponto> = Object.fromEntries(CONTORNOS_UF.map((c) => [c.uf, [c.cx, c.cy]]))

function dentroDaUf(uf: string, [x, y]: Ponto) {
  let dentro = false
  for (const anel of ANEIS[uf] ?? []) {
    for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
      const [xi, yi] = anel[i]; const [xj, yj] = anel[j]
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro
    }
  }
  return dentro
}

/** Hash FNV-1a de 32 bits → [0, 1). Determinístico: o mesmo texto cai sempre no mesmo lugar. */
function hash01(s: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h / 2 ** 32
}

/**
 * Posição aproximada de uma usina: centro da UF, deslocado por cidade (mesma cidade, mesmo grupo) e um pouco por
 * usina, para os pontos não se sobreporem; o ponto fica sempre dentro da UF. Nunca usa endereço nem coordenada.
 */
export function posicaoAproximada(u: Pick<UsinaRaw, 'id' | 'nome' | 'cidade' | 'estado'>): Ponto | null {
  const uf = ufValida(u.estado)
  if (!uf || !CENTRO[uf]) return null
  const [cx, cy] = CENTRO[uf]
  const { w, h } = CAIXA[uf]
  const raio = Math.min(Math.min(w, h) * 0.3, 55)
  const cidade = (u.cidade ?? '').trim().toUpperCase()
  const chave = `${u.id ?? ''}|${u.nome}`
  for (let tentativa = 0, fator = 1; tentativa < 8; tentativa++, fator *= 0.7) {
    const ac = 2 * Math.PI * hash01(`${uf}|${cidade}|${tentativa}`)
    const rc = cidade ? raio * Math.sqrt(hash01(`r|${cidade}|${tentativa}`)) * fator : 0
    const au = 2 * Math.PI * hash01(`${chave}|${tentativa}`)
    const ru = Math.min(7, raio * 0.4) * Math.sqrt(hash01(`ru|${chave}|${tentativa}`))
    const p: Ponto = [cx + rc * Math.cos(ac) + ru * Math.cos(au), cy + rc * Math.sin(ac) + ru * Math.sin(au)]
    if (dentroDaUf(uf, p)) return p
  }
  return [cx, cy]
}
