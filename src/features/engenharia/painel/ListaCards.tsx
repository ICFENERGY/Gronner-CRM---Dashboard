import { useState } from 'react'
import { LIMITES_PARADO, MARCOS, MOMENTOS } from '../../../../shared/engenharia.js'
import { num } from '../formato'
import type { CardEngenharia, Momento } from '../tipos'

type Parado = 'verde' | 'amarelo' | 'vermelho'
const NOME_MARCO = Object.fromEntries(MARCOS.map((m) => [m.k, m.nome]))
const COR_PONTO: Record<Parado, string> = { verde: 'bg-green-500', amarelo: 'bg-amber-400', vermelho: 'bg-red-500' }

function parado(d: number | null): Parado {
  if (d == null || d > LIMITES_PARADO.amarelo) return 'vermelho'
  return d > LIMITES_PARADO.verde ? 'amarelo' : 'verde'
}

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" aria-pressed={ativo} onClick={onClick} className={`rounded-full border px-3 py-1 text-xs font-medium ${ativo ? 'border-icf-green bg-icf-green text-white' : 'border-[var(--border-strong)] text-[var(--text-secondary)]'}`}>
      {children}
    </button>
  )
}

/** Cards ativos, do mais parado ao mais recente, com filtros por momento e por cor. */
export function ListaCards({ cards, hoje }: { cards: CardEngenharia[]; hoje: string }) {
  const [momento, setMomento] = useState<Momento | null>(null)
  const [cor, setCor] = useState<Parado | null>(null)
  const linhas = cards
    .filter((c) => (!momento || c.momento === momento) && (!cor || parado(c.diasSemAtualizacao) === cor))
    .sort((a, b) => (b.diasSemAtualizacao ?? 0) - (a.diasSemAtualizacao ?? 0))
  const desdeVenda = (c: CardEngenharia) => (c.dataVenda ? Math.floor((Date.parse(`${hoje}T12:00:00-03:00`) - Date.parse(c.dataVenda)) / 86_400_000) : null)

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <Chip ativo={!momento} onClick={() => setMomento(null)}>Todos</Chip>
        {(Object.keys(MOMENTOS) as Momento[]).map((m) => <Chip key={m} ativo={momento === m} onClick={() => setMomento(m)}>{MOMENTOS[m]}</Chip>)}
      </div>
      <div className="flex flex-wrap gap-2">
        <Chip ativo={!cor} onClick={() => setCor(null)}>Todas as cores</Chip>
        <Chip ativo={cor === 'vermelho'} onClick={() => setCor('vermelho')}>Vermelho</Chip>
        <Chip ativo={cor === 'amarelo'} onClick={() => setCor('amarelo')}>Amarelo</Chip>
        <Chip ativo={cor === 'verde'} onClick={() => setCor('verde')}>Verde</Chip>
      </div>
      <div className="max-h-[520px] overflow-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[var(--surface-solid)] text-left font-mono text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
            <tr>
              {['Card', 'Marco atual', 'Status Groner', 'Dias sem atualização', 'Dias desde a venda', 'Dono nominal', 'Cidade', 'Concessionária', 'kWp'].map((h, i) => (
                <th key={h} className={`border-b border-[var(--border)] px-3 py-2.5 font-medium ${[3, 4, 8].includes(i) ? 'text-right' : ''}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((c) => (
              <tr key={c.id} className="border-b border-[var(--border)] last:border-0">
                <td className="px-3 py-2 font-mono">{c.id}</td>
                <td className="px-3 py-2">{c.marco} · {NOME_MARCO[c.marco]}</td>
                <td className="px-3 py-2 text-xs text-[var(--text-secondary)]">{c.status}</td>
                <td className="px-3 py-2 text-right font-mono"><span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${COR_PONTO[parado(c.diasSemAtualizacao)]}`} title={parado(c.diasSemAtualizacao)} />{c.diasSemAtualizacao ?? '—'}</td>
                <td className="px-3 py-2 text-right font-mono">{num(desdeVenda(c))}</td>
                <td className="px-3 py-2">{c.dono ?? <span className="text-[var(--text-muted)]">sem dono</span>}</td>
                <td className="px-3 py-2">{c.cidade ?? '—'}</td>
                <td className="px-3 py-2 text-xs">{c.concessionaria ?? '—'}</td>
                <td className="px-3 py-2 text-right font-mono">{num(c.kwp, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-[var(--text-muted)]">{linhas.length} cards. Use o número do card para abrir no Groner.</p>
    </div>
  )
}
