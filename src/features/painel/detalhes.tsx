import type { ReactNode } from 'react'
import { MARCOS } from '../../../shared/engenharia.js'
import { currency, number } from '../../lib/palette'
import { dma } from '../engenharia/formato'
import { Selo } from '../engenharia/componentes/Selo'
import type { Painel } from './calculos'

/** O que a gaveta mostra: uma lista, já recortada pelo que foi clicado. */
export type Detalhe =
  | { tipo: 'vendas'; titulo: string; vendedor?: string; uf?: string; chave?: string }
  | { tipo: 'propostas'; titulo: string }
  | { tipo: 'engenharia'; titulo: string; marco?: string; concessionaria?: string; somenteAtrasados?: boolean; alemDaMeta?: boolean }
  | { tipo: 'tarefas'; titulo: string; responsavel?: string }
  | { tipo: 'usinas'; titulo: string; status?: string }
  | { tipo: 'analise'; titulo: string; pagina: 'geral' | 'vendas' | 'cadastro' | 'tarefas' | 'monitoramento' | 'pieta' }

function Tabela<T>({ linhas, colunas, chave, vazio = 'Nada para mostrar.' }: { linhas: T[]; colunas: { rotulo: string; dir?: boolean; render: (x: T) => ReactNode }[]; chave: (x: T) => string | number; vazio?: string }) {
  if (!linhas.length) return <p className="py-10 text-center text-sm text-[var(--text-muted)]">{vazio}</p>
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-[var(--surface-solid)] text-left text-xs text-[var(--text-muted)]">
          <tr>{colunas.map((c) => <th key={c.rotulo} className={`border-b border-[var(--border)] px-3 py-2 font-medium ${c.dir ? 'text-right' : ''}`}>{c.rotulo}</th>)}</tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={chave(l)} className="border-b border-[var(--border)] last:border-0">
              {colunas.map((c) => <td key={c.rotulo} className={`px-3 py-1.5 ${c.dir ? 'text-right tabular-nums' : ''}`}>{c.render(l)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const Resumo = ({ children }: { children: ReactNode }) => <p className="mb-3 text-sm text-[var(--text-secondary)]">{children}</p>
const NOME_MARCO = Object.fromEntries(MARCOS.map((m) => [m.k, m.nome]))

export function ConteudoDetalhe({ detalhe, painel, onModoReuniao }: { detalhe: Detalhe; painel: Painel; onModoReuniao: () => void }) {
  if (detalhe.tipo === 'vendas') {
    const linhas = painel.vendas
      .filter((v) => (!detalhe.vendedor || v.vendedor === detalhe.vendedor) && (!detalhe.uf || (v.estado ?? 'Não informado') === detalhe.uf) && (!detalhe.chave || v.dataVenda.startsWith(detalhe.chave)))
      .sort((a, b) => b.dataVenda.localeCompare(a.dataVenda))
    const total = linhas.reduce((a, v) => a + (v.valorTotal || 0), 0)
    return (
      <>
        <Resumo>{number.format(linhas.length)} vendas · {currency.format(total)} · ticket médio {currency.format(linhas.length ? total / linhas.length : 0)}</Resumo>
        <Tabela linhas={linhas} chave={(v) => v.id} colunas={[
          { rotulo: 'Data', render: (v) => dma(v.dataVenda) },
          { rotulo: 'Cliente', render: (v) => v.nome },
          { rotulo: 'Vendedor', render: (v) => v.vendedor },
          { rotulo: 'Cidade/UF', render: (v) => [v.cidade, v.estado].filter(Boolean).join('/') || '—' },
          { rotulo: 'Status', render: (v) => v.statusNome },
          { rotulo: 'Valor', dir: true, render: (v) => currency.format(v.valorTotal || 0) },
        ]} />
      </>
    )
  }

  if (detalhe.tipo === 'propostas') {
    const linhas = [...painel.propostas].sort((a, b) => b.dataInclusao.localeCompare(a.dataInclusao))
    return (
      <>
        <Resumo>{number.format(linhas.length)} propostas no período · {number.format(linhas.filter((p) => p.aceita).length)} aceitas</Resumo>
        <Tabela linhas={linhas} chave={(p) => p.id} colunas={[
          { rotulo: 'Criada em', render: (p) => dma(p.dataInclusao) },
          { rotulo: 'Projeto', render: (p) => p.projeto ?? '—' },
          { rotulo: 'Vendedor', render: (p) => p.vendedorNome ?? '—' },
          { rotulo: 'Etapa', render: (p) => p.etapaProjeto ?? '—' },
          { rotulo: 'Aceita', render: (p) => (p.aceita ? 'Sim' : 'Não') },
          { rotulo: 'kWp', dir: true, render: (p) => (p.kwP != null ? number.format(p.kwP) : '—') },
          { rotulo: 'Valor', dir: true, render: (p) => (p.preco != null ? currency.format(p.preco) : '—') },
        ]} />
      </>
    )
  }

  if (detalhe.tipo === 'engenharia') {
    const meta = painel.kpis.meta
    const linhas = painel.cards.filter((c) =>
      (!detalhe.marco || c.marco === detalhe.marco)
      && (!detalhe.concessionaria || (c.concessionaria ?? 'Não informado') === detalhe.concessionaria)
      && (!detalhe.somenteAtrasados || c.cor === 'atrasado')
      && (!detalhe.alemDaMeta || (c.diasDesdeVenda ?? 0) > meta))
    return (
      <>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <Resumo>{linhas.length} cards · {linhas.filter((c) => c.cor === 'atrasado').length} atrasados · {linhas.filter((c) => c.cor === 'atrasado' && !c.acao).length} sem plano</Resumo>
          <button type="button" onClick={onModoReuniao} className="rounded-md bg-icf-green px-3 py-1.5 text-sm font-semibold text-icf-navy">Abrir modo reunião</button>
        </div>
        <Tabela linhas={linhas} chave={(c) => c.id} colunas={[
          { rotulo: 'Card', render: (c) => <span className="font-mono">{c.id}</span> },
          { rotulo: 'Situação', render: (c) => <Selo cor={c.cor} /> },
          { rotulo: 'Marco', render: (c) => `${c.marco} · ${NOME_MARCO[c.marco]}` },
          { rotulo: 'Motivo', render: (c) => <span className="text-[var(--text-secondary)]">{c.motivos[0] ?? 'Dentro do prazo'}</span> },
          { rotulo: 'Ação combinada', render: (c) => (c.acao ? `${c.acao.acao} (${c.acao.dono})` : <span className="text-[var(--text-muted)]">sem plano</span>) },
          { rotulo: 'Local', render: (c) => [c.cidade, c.estado].filter(Boolean).join('/') || '—' },
        ]} />
      </>
    )
  }

  if (detalhe.tipo === 'tarefas') {
    const linhas = painel.atrasadas.filter((t) => !detalhe.responsavel || (t.responsaveis.length ? t.responsaveis : ['Sem responsável']).includes(detalhe.responsavel))
    return (
      <>
        <Resumo>{linhas.length} tarefas atrasadas</Resumo>
        <Tabela linhas={linhas} chave={(t) => t.id} colunas={[
          { rotulo: 'Prazo', render: (t) => dma(t.dataEntrega) },
          { rotulo: 'Tarefa', render: (t) => t.titulo ?? '—' },
          { rotulo: 'Projeto', render: (t) => t.projeto ?? '—' },
          { rotulo: 'Responsáveis', render: (t) => t.responsaveis.join(', ') || '—' },
          { rotulo: 'Tipo', render: (t) => t.tipo ?? '—' },
          { rotulo: 'Status', render: (t) => t.status ?? '—' },
        ]} />
      </>
    )
  }

  if (detalhe.tipo === 'usinas') {
    const linhas = painel.usinas.filter((u) => !detalhe.status || (u.statusDesempenho ?? 'Sem dado') === detalhe.status)
    return (
      <>
        <Resumo>{linhas.length} usinas</Resumo>
        <Tabela linhas={linhas} chave={(u) => `${u.id ?? ''}-${u.nome}`} colunas={[
          { rotulo: 'Usina', render: (u) => u.nome },
          { rotulo: 'Cidade/UF', render: (u) => [u.cidade, u.estado].filter(Boolean).join('/') || '—' },
          { rotulo: 'Potência', dir: true, render: (u) => (u.potenciaKwp != null ? `${number.format(u.potenciaKwp)} kWp` : '—') },
          { rotulo: 'Desempenho 3M', dir: true, render: (u) => (u.desempenhoMedio3mPct != null ? `${Math.round(u.desempenhoMedio3mPct * 100)}%` : '—') },
          { rotulo: 'Status', render: (u) => u.statusDesempenho ?? 'Sem dado' },
          { rotulo: 'Monitoramento', render: (u) => u.statusMonitoramento ?? '—' },
        ]} />
      </>
    )
  }

  return null
}
