import { MARCOS } from '../../../../shared/engenharia.js'
import { Selo } from '../componentes/Selo'
import { dm, dma, ESTILO_COR, num } from '../formato'
import type { CardEngenharia } from '../tipos'
import { FormAcao } from './FormAcao'
import type { Identidade } from './PautaDiaria'

const MK = Object.fromEntries(MARCOS.map((m, i) => [m.k, { ...m, i }]))

/** Uma linha da pauta: código, motivo, tempo no marco e o plano. Abre o detalhe ao clicar. */
export function LinhaCard({
  card,
  aberto,
  onAlternar,
  meta,
  podeEditar,
  identidade,
  onSalvo,
}: {
  card: CardEngenharia
  aberto: boolean
  onAlternar: () => void
  meta: number
  podeEditar: boolean
  identidade: Identidade
  onSalvo: (mensagem: string) => void
}) {
  const escala = Math.max(card.prazo * 1.5, 1)
  const pct = Math.min(100, (100 * card.dias) / escala)
  const marcaPrazo = (100 * card.prazo) / escala

  return (
    <>
      <button
        type="button"
        aria-expanded={aberto}
        onClick={onAlternar}
        className="grid w-full grid-cols-[64px_minmax(0,1fr)_22px] items-center gap-3 border-t border-[var(--border)] px-4 py-2.5 text-left first:border-t-0 hover:bg-[var(--surface-hover)] md:grid-cols-[72px_minmax(0,1.3fr)_minmax(130px,.9fr)_minmax(0,1.4fr)_22px]"
      >
        <span className="font-mono text-sm font-medium">{card.id}</span>
        <span className="grid min-w-0 gap-0.5 text-sm">
          <span className="justify-self-start"><Selo cor={card.cor} /></span>
          <span>{card.motivos[0] ?? 'Dentro do prazo'}</span>
          {card.motivos[1] && <span className="text-xs text-[var(--text-muted)]">{card.motivos[1]}</span>}
        </span>
        <span className="col-start-2 grid gap-1 md:col-start-auto">
          <span className="relative h-1.5 overflow-hidden rounded bg-[var(--track-bg)]">
            <span className={`absolute inset-y-0 left-0 rounded ${ESTILO_COR[card.cor].barra}`} style={{ width: `${pct}%` }} />
            <em className="absolute -inset-y-0.5 w-0.5 bg-[var(--text-secondary)]" style={{ left: `${marcaPrazo}%` }} />
          </span>
          <small className="font-mono text-[11px] text-[var(--text-muted)]">
            {card.estimado ? '≈' : ''}{card.dias}d de {card.prazo}d · {card.cidade ?? '—'}{card.estado ? `/${card.estado}` : ''}
          </small>
        </span>
        <span className="col-start-2 min-w-0 text-sm md:col-start-auto">
          {card.acao ? (
            <>
              <b className="font-semibold">{card.acao.acao}</b>
              <span className={`block text-xs ${card.acaoVencida ? `font-semibold ${ESTILO_COR.atrasado.texto}` : 'text-[var(--text-secondary)]'}`}>
                {card.acao.dono} · até {dm(card.acao.prazo)}
              </span>
            </>
          ) : (
            <>
              <span className={card.cor === 'atrasado' ? `font-semibold ${ESTILO_COR.atrasado.texto}` : 'text-[var(--text-secondary)]'}>
                {card.cor === 'atrasado' ? 'Sem plano: definir ação, dono e prazo' : 'Sem ação registrada'}
              </span>
              <span className="block text-xs text-[var(--text-muted)]">{card.dono ?? 'Sem dono nominal'}</span>
            </>
          )}
        </span>
        <span aria-hidden="true" className={`col-start-3 row-start-1 text-[var(--text-muted)] transition-transform md:col-start-auto md:row-start-auto ${aberto ? 'rotate-90' : ''}`}>›</span>
      </button>
      {aberto && <Detalhe card={card} meta={meta} podeEditar={podeEditar} identidade={identidade} onSalvo={onSalvo} />}
    </>
  )
}

function Detalhe({ card, meta, podeEditar, identidade, onSalvo }: { card: CardEngenharia; meta: number; podeEditar: boolean; identidade: Identidade; onSalvo: (m: string) => void }) {
  const m = MK[card.marco]
  const proximo = m ? MARCOS[m.i + 1] : undefined
  return (
    <div className="grid gap-5 border-t border-dashed border-[var(--border)] bg-[var(--bg)] px-4 pb-5 pt-3 md:grid-cols-2 md:pl-[100px]">
      <div className="grid content-start gap-4">
        <div>
          <h3 className="mb-1.5 text-sm font-semibold">Situação</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-[var(--text-muted)]">Status no Groner</dt><dd>{card.status ?? '—'}</dd>
            <dt className="text-[var(--text-muted)]">No marco desde</dt><dd>{card.estimado ? '≈ ' : ''}{dma(card.desde)} · {card.dias} dias (prazo {card.prazo})</dd>
            {card.diasDesdeVenda != null && (<><dt className="text-[var(--text-muted)]">Entrega</dt><dd>Dia {card.diasDesdeVenda} desde a venda ({dma(card.dataVenda)}). Projeção: dia {card.projecao}, meta {meta}</dd></>)}
            <dt className="text-[var(--text-muted)]">Local</dt><dd>{card.cidade ?? '—'}{card.estado ? `/${card.estado}` : ''} · {card.concessionaria ?? 'concessionária não informada'}</dd>
            <dt className="text-[var(--text-muted)]">Potência</dt><dd>{card.kwp != null ? `${num(card.kwp, 1)} kWp` : '—'}</dd>
            <dt className="text-[var(--text-muted)]">Dono no Groner</dt><dd>{card.dono ?? <span className={ESTILO_COR.atrasado.texto}>sem dono nominal</span>}</dd>
            <dt className="text-[var(--text-muted)]">Vendedor</dt><dd>{card.vendedor ?? '—'}</dd>
            <dt className="text-[var(--text-muted)]">Última atualização</dt><dd>{dma(card.dataUltimaAtualizacao)} · {card.diasSemAtualizacao ?? '—'} dias</dd>
          </dl>
        </div>
        {m && (
          <div className="grid gap-2 text-sm">
            <h3 className="text-sm font-semibold">Como resolver</h3>
            <p className="border-l-[3px] border-icf-green pl-2.5"><b>O que precisa acontecer:</b> {m.acao}</p>
            <p className="border-l-[3px] border-icf-green pl-2.5"><b>Quem age:</b> {m.papel}{card.dono ? ` · no Groner: ${card.dono}` : ''}</p>
            <p className="border-l-[3px] border-icf-green pl-2.5"><b>Depende de:</b> {m.dep}</p>
            {proximo && <p className="border-l-[3px] border-icf-green pl-2.5"><b>Sai deste marco quando:</b> o card chega em {proximo.k} · {proximo.nome}</p>}
          </div>
        )}
        {card.passagens.length > 0 && (
          <div>
            <h3 className="mb-1.5 text-sm font-semibold">Histórico de marcos</h3>
            <div className="grid gap-0.5 font-mono text-xs text-[var(--text-secondary)]">
              {card.passagens.map((p, i) => (
                <div key={i}>{dma(p.em)} · {p.de ?? '—'} → {p.para ?? '—'} ({p.statusNovo})</div>
              ))}
            </div>
          </div>
        )}
      </div>
      <FormAcao key={`${card.id}-${card.acao?.em ?? ''}`} card={card} podeEditar={podeEditar} identidade={identidade} onSalvo={onSalvo} />
    </div>
  )
}
