import type { PietaProjetoResumo } from '../../api/types'

/** SLA da Pieta: projeto finalizado em até 60 dias da criação. Vale só para a aba Pieta. */
export const SLA_PIETA_DIAS = 60

const DIA_MS = 86_400_000

/** UF pela distribuidora: "ENEL - SP" já traz; as demais pelo nome. */
const UF_POR_DISTRIBUIDORA: [RegExp, string][] = [
  [/CPFL|ELEKTRO|ENEL.*SP|EDP.*SP|BANDEIRANTE/i, 'SP'], [/LIGHT|ENEL.*RJ/i, 'RJ'], [/CEMIG/i, 'MG'], [/CELESC/i, 'SC'], [/COPEL/i, 'PR'],
  [/CEEE|RGE/i, 'RS'], [/COELBA/i, 'BA'], [/BRAS[ÍI]LIA|CEB/i, 'DF'],
]

export function ufDaDistribuidora(nome: string | null | undefined): string {
  const n = (nome ?? '').trim()
  const sufixo = /[-–]\s*([A-Z]{2})\s*$/.exec(n)
  if (sufixo) return sufixo[1]
  return UF_POR_DISTRIBUIDORA.find(([re]) => re.test(n))?.[1] ?? '—'
}

export interface ChamadoSla {
  id: number
  cliente: string
  status: string
  finalizado: boolean
  dias: number
  atendido: boolean
  ano: string
  mes: string
  distribuidora: string
  uf: string
  kwp: number | null
  ultimaAlteracao: string | null
}

export function chamadosSla(projetos: PietaProjetoResumo[], agora = Date.now()): ChamadoSla[] {
  const saida: ChamadoSla[] = []
  for (const p of projetos) {
    const criado = Date.parse(p.createdAt)
    if (!Number.isFinite(criado)) continue
    const finalizado = /finalizad/i.test(p.status)
    const fim = finalizado ? Date.parse(p.lastStatusChange ?? '') : NaN
    const dias = Math.max(0, Math.round(((Number.isFinite(fim) ? fim : agora) - criado) / DIA_MS))
    const d = new Date(criado)
    saida.push({
      id: p.projectId, cliente: p.clientName, status: p.status, finalizado, dias, atendido: dias <= SLA_PIETA_DIAS,
      ano: String(d.getFullYear()), mes: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      distribuidora: p.powerDistributor || '—', uf: ufDaDistribuidora(p.powerDistributor), kwp: p.power, ultimaAlteracao: p.lastStatusChange,
    })
  }
  return saida
}

export interface ResumoSla { total: number; abertos: number; finalizados: number; atendidos: number; extrapolados: number }

/** O SLA só é medido nos finalizados; os abertos aparecem à parte. */
export function resumirSla(c: ChamadoSla[]): ResumoSla {
  const fin = c.filter((x) => x.finalizado)
  const atendidos = fin.filter((x) => x.atendido).length
  return { total: c.length, abertos: c.length - fin.length, finalizados: fin.length, atendidos, extrapolados: fin.length - atendidos }
}

export interface ContagemSla { nome: string; total: number; atendidos: number; atrasados: number }

export function contarSla(c: ChamadoSla[], chave: (x: ChamadoSla) => string): ContagemSla[] {
  const m = new Map<string, ContagemSla>()
  for (const x of c) {
    const nome = chave(x)
    const g = m.get(nome) ?? { nome, total: 0, atendidos: 0, atrasados: 0 }
    g.total += 1
    if (x.atendido) g.atendidos += 1
    else g.atrasados += 1
    m.set(nome, g)
  }
  return [...m.values()].sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR'))
}
