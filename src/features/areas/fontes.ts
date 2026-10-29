import { useMemo, useRef, useState } from 'react'
import { api } from '../../api/client'
import { useRawData } from '../../api/useRawData'
import { textoDe } from '../painel/calculos'
import { hojeSP } from '../painel/periodo'
import { dataHoraBr, type Filtros, type Fontes } from './calculos'
import { gravarFiltros, lerFiltros, type FonteAtualizacao } from './ui'

/** Horário de cada carga do Groner (lido do banco, sem consultar o Groner). */
export function useSincronizacao() {
  const { data } = useRawData('sync-status', api.getSyncStatus)
  return (entidade: string, rotulo: string): FonteAtualizacao => {
    const s = data?.entities?.[entidade]
    return { fonte: rotulo, quando: dataHoraBr(s?.sourceUpdatedAt ?? s?.finishedAt ?? s?.lastSuccessfulRunAt) }
  }
}

/** Ano, mês e vendedor: os mesmos em Vendas e Financeiro, lembrados no navegador. */
export function useFiltros() {
  const [filtros, setFiltros] = useState<Filtros>(lerFiltros)
  const mudar = (f: Filtros) => { setFiltros(f); gravarFiltros(f) }
  return { filtros, mudar }
}

/** Fontes do Groner usadas por Vendas e Financeiro. */
export function useFontesGroner() {
  const vendas = useRawData('vendas', api.getVendasRaw)
  const propostas = useRawData('propostas', api.getPropostasRaw)
  const projetos = useRawData('projetos', api.getProjetosRaw)
  const tarefas = useRawData('tarefas', api.getTarefasRaw)
  const fontes: Fontes = useMemo(() => ({
    vendas: vendas.data, propostas: propostas.data, projetos: projetos.data, tarefas: tarefas.data,
    usinas: null, pietaResumo: null, pietaMetricas: null,
  }), [vendas.data, propostas.data, projetos.data, tarefas.data])
  const opcoes = useMemo(() => {
    const nomes = new Set<string>()
    for (const v of vendas.data ?? []) { const n = textoDe(v.vendedor).trim(); if (n) nomes.add(n) }
    for (const p of propostas.data ?? []) { const n = textoDe(p.vendedorNome).trim(); if (n) nomes.add(n) }
    const anos = new Set<string>([hojeSP().slice(0, 4)])
    for (const d of [...(vendas.data ?? []).map((v) => v.dataVenda), ...(propostas.data ?? []).map((p) => p.dataInclusao)]) {
      const a = typeof d === 'string' ? d.slice(0, 4) : ''
      if (/^\d{4}$/.test(a)) anos.add(a)
    }
    return { vendedores: [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR')), anos: [...anos].sort().reverse() }
  }, [vendas.data, propostas.data])
  return { vendas, propostas, projetos, tarefas, fontes, opcoes }
}

/** Hora em que um dado consultado ao vivo (sem data própria) chegou ao navegador. */
export function useChegada(chegou: boolean) {
  const quando = useRef<string | null>(null)
  if (chegou && !quando.current) quando.current = new Date().toISOString()
  return quando.current
}
