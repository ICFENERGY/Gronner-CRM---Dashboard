import { useMemo, useState } from 'react'
import { MARCOS, MOMENTOS } from '../../../../shared/engenharia.js'
import { Secao, Selo, SeloNeutro } from '../componentes/Selo'
import type { Engenharia, Momento } from '../tipos'
import { LinhaCard } from './LinhaCard'
import { PrazosMarcos } from './PrazosMarcos'
import { ReguaMarcos } from './ReguaMarcos'
import { Veredito } from './Veredito'

export interface Identidade {
  codigo: string
  nome: string
  setCodigo: (v: string) => void
  setNome: (v: string) => void
}

const MK = Object.fromEntries(MARCOS.map((m, i) => [m.k, { ...m, i }]))
const POR_GRUPO = 5

/**
 * Pauta Diária da Engenharia: veredito por momento, régua dos marcos e a
 * lista do que discutir hoje (atrasados e em risco), agrupada por marco.
 */
export function PautaDiaria({ dados, identidade, onAtualizar }: { dados: Engenharia; identidade: Identidade; onAtualizar: (mensagem: string) => void }) {
  const [momento, setMomento] = useState<Momento | null>(null)
  const [marco, setMarco] = useState<string | null>(null)
  const [todos, setTodos] = useState(false)
  const [abertos, setAbertos] = useState<Set<number>>(new Set())
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())

  const { cards, prazos } = dados
  const filtrados = cards.filter((c) => (!momento || c.momento === momento) && (!marco || c.marco === marco))
  const lista = todos ? filtrados : filtrados.filter((c) => c.cor !== 'ok')

  // Grupos por marco: primeiro os com mais atrasados sem plano, depois mais atrasados, depois a ordem do fluxo.
  const grupos = useMemo(() => {
    const g = new Map<string, typeof lista>()
    lista.forEach((c) => g.set(c.marco, [...(g.get(c.marco) ?? []), c]))
    const conta = (k: string, f: (c: (typeof lista)[number]) => boolean) => (g.get(k) ?? []).filter(f).length
    return [...g.keys()]
      .sort((a, b) =>
        conta(b, (c) => c.cor === 'atrasado' && !c.acao) - conta(a, (c) => c.cor === 'atrasado' && !c.acao)
        || conta(b, (c) => c.cor === 'atrasado') - conta(a, (c) => c.cor === 'atrasado')
        || MK[a].i - MK[b].i)
      .map((k) => ({ k, cards: g.get(k)! }))
  }, [lista])

  const alternar = <T,>(set: Set<T>, v: T) => { const n = new Set(set); n.has(v) ? n.delete(v) : n.add(v); return n }
  const rotuloFiltro = marco ? `Marco ${marco} · ${MK[marco]?.nome}` : momento ? MOMENTOS[momento] : 'Todos os momentos'

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <Veredito cards={cards} meta={prazos.metaEntrega} filtro={momento} onFiltrar={(m) => { setMomento(m); setMarco(null) }} />

      <Secao titulo="Régua dos marcos" subtitulo="Número grande: cards no marco · em vermelho: atrasados. Clique para filtrar a pauta.">
        <ReguaMarcos cards={cards} prazos={prazos.sla} filtro={marco} onFiltrar={(k) => { setMarco(k); setMomento(null) }} />
      </Secao>

      <section className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">{todos ? 'Todos os cards' : 'Pauta de hoje'}</h2>
            <p className="text-xs text-[var(--text-secondary)]">
              {rotuloFiltro} · {lista.length} {todos ? 'cards' : 'cards fora do prazo ou em risco'} de {filtrados.length}. Ordem: ação vencida e atrasados sem plano primeiro.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(momento || marco) && (
              <button type="button" onClick={() => { setMomento(null); setMarco(null) }} className="rounded-full border border-[var(--border-strong)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)]">
                Limpar filtro
              </button>
            )}
            <button
              type="button"
              aria-pressed={todos}
              onClick={() => setTodos(!todos)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${todos ? 'border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--bg)]' : 'border-[var(--border-strong)] text-[var(--text-secondary)]'}`}
            >
              Mostrar também os no prazo
            </button>
          </div>
        </div>

        {grupos.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
            Nada fora do prazo ou em risco{momento || marco ? ' neste filtro' : ''}. Nenhum caso para discutir hoje.
          </p>
        ) : (
          grupos.map(({ k, cards: g }) => {
            const m = MK[k]
            const l = g.filter((c) => c.cor === 'atrasado').length
            const r = g.filter((c) => c.cor === 'risco').length
            const semPlano = g.filter((c) => c.cor === 'atrasado' && !c.acao).length
            const visiveis = expandidos.has(k) ? g : g.slice(0, POR_GRUPO)
            return (
              <div key={k} className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-1.5 border-b border-[var(--border)] px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
                  <span className="min-w-[38px] rounded-md bg-[var(--surface-hover)] px-2 py-1.5 text-center font-mono text-sm">{m.k}</span>
                  <div className="grid min-w-0 gap-0.5">
                    <h3 className="text-sm font-semibold">{m.nome}</h3>
                    <p className="text-sm text-[var(--text-secondary)]">
                      <b>Próximo passo:</b> {m.acao} <span className="text-[var(--text-muted)]">· {m.papel} · prazo do marco {prazos.sla[k]} dias</span>
                    </p>
                  </div>
                  <div className="col-span-2 flex flex-wrap gap-1.5 sm:col-span-1 sm:justify-end">
                    {l > 0 && <Selo cor="atrasado">{l} atrasados</Selo>}
                    {r > 0 && <Selo cor="risco">{r} em risco</Selo>}
                    {semPlano > 0 && <SeloNeutro>{semPlano} sem plano</SeloNeutro>}
                  </div>
                </div>
                {visiveis.map((c) => (
                  <LinhaCard
                    key={c.id}
                    card={c}
                    aberto={abertos.has(c.id)}
                    onAlternar={() => setAbertos(alternar(abertos, c.id))}
                    meta={prazos.metaEntrega}
                    podeEditar={dados.edicao.acoes}
                    identidade={identidade}
                    onSalvo={onAtualizar}
                  />
                ))}
                {g.length > POR_GRUPO && (
                  <button type="button" onClick={() => setExpandidos(alternar(expandidos, k))} className="block w-full border-t border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-left text-sm font-semibold text-[var(--accent-text)] md:pl-[100px]">
                    {expandidos.has(k) ? `Mostrar só os ${POR_GRUPO} primeiros` : `Mostrar os outros ${g.length - POR_GRUPO} cards deste marco`}
                  </button>
                )}
              </div>
            )
          })
        )}
      </section>

      <PrazosMarcos dados={dados} identidade={identidade} onSalvo={onAtualizar} />
    </div>
  )
}
