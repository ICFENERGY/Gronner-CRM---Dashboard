import { gronerFunis } from '../../shared/gronerFunis.js'
import type { FunilResumo, CategoriaResumo, PivotFunilAno, ProjetoRaw } from '../api/types'

/**
 * Réplica no frontend da agregação que o backend faz em server/app.js, para
 * o Dashboard poder filtrar (Ano/Vendedor/Estado) sem depender do /api/summary
 * pré-agregado. Mesma lógica, mesmas fontes (Projeto raw), resultado idêntico
 * quando nenhum filtro está ativo.
 */
function normalizeFunilNome(nome: string) {
  return nome
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}️]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const OUTROS_KEY = 'Outros / não mapeados'

export function buildPorFunil(projetos: ProjetoRaw[]): FunilResumo[] {
  const { funilOrdem, funilEtapas, funilCategoria, categoriaCor, cadeiaPrincipal } = gronerFunis
  const canonicalLookup = new Map<string, string>(funilOrdem.map((nome: string) => [normalizeFunilNome(nome), nome]))

  const porFunilMap = new Map<string, FunilResumo & { etapasMap: Map<string, number> }>()
  for (const funil of funilOrdem) {
    porFunilMap.set(funil, {
      funil,
      categoria: funilCategoria[funil] ?? 'outros',
      cor: categoriaCor[funilCategoria[funil]] ?? '#94a3b8',
      cadeiaPrincipal: cadeiaPrincipal.includes(funil),
      quantidade: 0,
      etapas: [],
      etapasMap: new Map((funilEtapas[funil] ?? []).map((nome: string) => [nome, 0])),
    })
  }
  porFunilMap.set(OUTROS_KEY, {
    funil: OUTROS_KEY,
    categoria: 'outros',
    cor: categoriaCor.outros ?? '#94a3b8',
    cadeiaPrincipal: false,
    quantidade: 0,
    etapas: [],
    etapasMap: new Map(),
  })

  for (const p of projetos) {
    const rawNome = p.funil || 'Sem Funil'
    const canonicalNome = canonicalLookup.get(normalizeFunilNome(rawNome))
    const entry = porFunilMap.get(canonicalNome ?? OUTROS_KEY) ?? porFunilMap.get(OUTROS_KEY)!
    entry.quantidade += 1

    const etapaNome = canonicalNome ? p.etapa || 'Sem etapa' : `${rawNome} — ${p.etapa || 'Sem etapa'}`
    entry.etapasMap.set(etapaNome, (entry.etapasMap.get(etapaNome) ?? 0) + 1)
  }

  return [...porFunilMap.values()].map((f) => ({
    funil: f.funil,
    categoria: f.categoria,
    cor: f.cor,
    cadeiaPrincipal: f.cadeiaPrincipal,
    quantidade: f.quantidade,
    etapas: [...f.etapasMap.entries()].map(([etapa, quantidade]) => ({ etapa, quantidade })),
  }))
}

export function buildPorCategoria(porFunil: FunilResumo[]): CategoriaResumo[] {
  const { categoriaOrdem, categoriaLabel, categoriaCor } = gronerFunis
  const map = new Map<string, CategoriaResumo>(
    categoriaOrdem.map((key: string) => [key, { categoria: key, label: categoriaLabel[key], cor: categoriaCor[key], quantidade: 0 }]),
  )
  for (const f of porFunil) {
    const entry = map.get(f.categoria)
    if (entry) entry.quantidade += f.quantidade
  }
  return [...map.values()]
}

export function buildPivotFunilAno(projetos: ProjetoRaw[]): PivotFunilAno {
  const { funilOrdem, funilCategoria, categoriaCor, cadeiaPrincipal } = gronerFunis
  const canonicalLookup = new Map<string, string>(funilOrdem.map((nome: string) => [normalizeFunilNome(nome), nome]))

  const porFunilAno = new Map<string, Map<string, number>>()
  const anosSet = new Set<string>()

  for (const p of projetos) {
    const rawNome = p.funil || 'Sem Funil'
    const funil = canonicalLookup.get(normalizeFunilNome(rawNome)) ?? OUTROS_KEY
    const ano = p.dataInclusao ? p.dataInclusao.slice(0, 4) : 'Sem data'
    anosSet.add(ano)
    if (!porFunilAno.has(funil)) porFunilAno.set(funil, new Map())
    const anos = porFunilAno.get(funil)!
    anos.set(ano, (anos.get(ano) ?? 0) + 1)
  }

  const anos = [...anosSet].sort()
  const ordemComOutros = [...funilOrdem, OUTROS_KEY]
  const linhas = ordemComOutros
    .filter((funil: string) => porFunilAno.has(funil))
    .map((funil: string) => {
      const anosMap = porFunilAno.get(funil)!
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

export function buildGeografia(projetos: ProjetoRaw[]) {
  const porEstadoMap = new Map<string, number>()
  const porConcessionariaMap = new Map<string, number>()
  for (const p of projetos) {
    if (p.estado) porEstadoMap.set(p.estado, (porEstadoMap.get(p.estado) ?? 0) + 1)
    if (p.concessionaria) porConcessionariaMap.set(p.concessionaria, (porConcessionariaMap.get(p.concessionaria) ?? 0) + 1)
  }
  const porEstado = [...porEstadoMap.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  const porConcessionaria = [...porConcessionariaMap.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
  return { porEstado, porConcessionaria }
}
