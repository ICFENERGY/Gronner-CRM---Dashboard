import { useState } from 'react'
import { MARCOS } from '../../../../shared/engenharia.js'
import { engenhariaApi, ErroApi } from '../api'
import { dma } from '../formato'
import type { Engenharia } from '../tipos'
import type { Identidade } from './PautaDiaria'

/** Prazos por marco e regras do semáforo. Editar exige o código de administração. */
export function PrazosMarcos({ dados, identidade, onSalvo }: { dados: Engenharia; identidade: Identidade; onSalvo: (m: string) => void }) {
  const [sla, setSla] = useState<Record<string, number>>(dados.prazos.sla)
  const [meta, setMeta] = useState(dados.prazos.metaEntrega)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const pode = dados.edicao.prazos

  async function salvar() {
    const codigo = window.prompt('Código de administração da Engenharia:')?.trim()
    if (!codigo) return
    setErro(null)
    setEnviando(true)
    try {
      await engenhariaApi.salvarPrazos({ sla, metaEntrega: meta, por: identidade.nome }, codigo)
      onSalvo('Prazos salvos. O semáforo foi recalculado.')
    } catch (e) {
      setErro(e instanceof ErroApi && e.status === 401 ? 'Código de administração inválido.' : e instanceof Error ? e.message : 'Não foi possível salvar.')
    } finally {
      setEnviando(false)
    }
  }

  const campo = 'w-16 rounded border border-[var(--border-strong)] bg-[var(--input-bg)] px-1.5 py-1 text-right font-mono text-sm disabled:opacity-60'

  return (
    <details className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-3">
      <summary className="cursor-pointer text-sm font-semibold">Prazos por marco e regras do semáforo</summary>
      <div className="mt-3 grid gap-4">
        <div className="grid max-w-[90ch] gap-1 text-sm text-[var(--text-secondary)]">
          <p><b>Atrasado:</b> passou do prazo do marco, a obra já passou da meta de entrega, ou a ação combinada na reunião venceu.</p>
          <p><b>Em risco:</b> está nos últimos 30% do prazo do marco, a projeção de entrega passa da meta, ou a ação vence hoje ou amanhã.</p>
          <p><b>No prazo:</b> o resto. Card sem dono nominal no Groner é contado à parte e não muda a cor.</p>
          <p><b>Dias no marco:</b> contados desde a entrada no marco, pelo histórico de status que a sincronização grava a cada 5 minutos. Quando ainda não há histórico, a data é a do último status no Groner e aparece com “≈”.</p>
          <p><b>Projeção de entrega:</b> dias desde a venda + o que falta do prazo do marco atual + os prazos dos marcos seguintes até a vistoria (troca do relógio). O kit (marco 7) corre em paralelo e fica fora da conta.</p>
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          {dados.prazos.proposta ? 'Proposta inicial. A ATENA ajusta e a Diretoria aprova.' : `Prazos salvos em ${dma(dados.prazos.salvoEm)}.`}
        </p>
        <div className="grid gap-x-5 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {MARCOS.map((m) => (
            <label key={m.k} className="flex items-center justify-between gap-2 text-sm">
              <span>{m.k} · {m.nome}</span>
              <input className={campo} type="number" min={1} max={120} value={sla[m.k]} disabled={!pode} onChange={(e) => setSla({ ...sla, [m.k]: Number(e.target.value) })} />
            </label>
          ))}
          <label className="flex items-center justify-between gap-2 text-sm">
            <span><b>Meta de entrega</b> (venda → relógio)</span>
            <input className={campo} type="number" min={10} max={365} value={meta} disabled={!pode} onChange={(e) => setMeta(Number(e.target.value))} />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {pode ? (
            <button type="button" onClick={salvar} disabled={enviando} className="rounded-md bg-icf-green px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
              {enviando ? 'Salvando…' : 'Salvar prazos'}
            </button>
          ) : (
            <span className="text-xs text-[var(--text-muted)]">Edição dos prazos desligada neste ambiente.</span>
          )}
          {erro && <span role="alert" className="text-xs font-semibold text-red-700 dark:text-red-300">{erro}</span>}
        </div>
      </div>
    </details>
  )
}
