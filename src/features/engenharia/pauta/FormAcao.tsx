import { useState, type FormEvent } from 'react'
import { engenhariaApi, ErroApi } from '../api'
import { dma } from '../formato'
import type { CardEngenharia } from '../tipos'
import type { Identidade } from './PautaDiaria'

/** Ação combinada na reunião: o que será feito, por quem e até quando. */
export function FormAcao({
  card,
  podeEditar,
  identidade,
  onSalvo,
}: {
  card: CardEngenharia
  podeEditar: boolean
  identidade: Identidade
  onSalvo: (mensagem: string) => void
}) {
  const aberta = card.acao
  const [acao, setAcao] = useState(aberta?.acao ?? '')
  const [dono, setDono] = useState(aberta?.dono ?? card.dono ?? '')
  const [prazo, setPrazo] = useState(aberta?.prazo ?? '')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function comCodigo(fn: (codigo: string) => Promise<unknown>) {
    let codigo = identidade.codigo
    if (!codigo) {
      codigo = window.prompt('Código da equipe da Engenharia (fica salvo neste navegador):')?.trim() ?? ''
      if (!codigo) return false
      identidade.setCodigo(codigo)
    }
    if (!identidade.nome) {
      const nome = window.prompt('Seu nome, para registrar quem combinou a ação:')?.trim() ?? ''
      if (nome) identidade.setNome(nome)
    }
    try {
      await fn(codigo)
      return true
    } catch (e) {
      if (e instanceof ErroApi && e.status === 401) {
        identidade.setCodigo('')
        setErro('Código da equipe inválido. Tente de novo.')
      } else {
        setErro(e instanceof Error ? e.message : 'Não foi possível salvar.')
      }
      return false
    }
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    const ok = await comCodigo((codigo) => engenhariaApi.salvarAcao(card.id, { acao, dono, prazo, por: identidade.nome }, codigo))
    setEnviando(false)
    if (ok) onSalvo(`Ação do card ${card.id} salva.`)
  }

  async function concluir() {
    setErro(null)
    setEnviando(true)
    const ok = await comCodigo((codigo) => engenhariaApi.concluirAcao(card.id, identidade.nome, codigo))
    setEnviando(false)
    if (ok) onSalvo(`Ação do card ${card.id} marcada como feita.`)
  }

  const bloqueado = !podeEditar || enviando
  const ultima = aberta ?? card.acaoAnterior
  const campo = 'w-full rounded-md border border-[var(--border-strong)] bg-[var(--input-bg)] px-2.5 py-1.5 text-sm text-[var(--text-primary)] disabled:opacity-60'

  return (
    <form onSubmit={salvar} className="grid content-start gap-2.5">
      <h3 className="text-sm font-semibold">Ação combinada na reunião</h3>
      <label className="grid gap-1 text-xs text-[var(--text-muted)]">
        O que será feito
        <input className={campo} value={acao} onChange={(e) => setAcao(e.target.value)} placeholder="Ex.: cobrar parecer da concessionária por telefone" maxLength={280} disabled={bloqueado} required />
      </label>
      <div className="grid gap-2 sm:grid-cols-[1fr_150px]">
        <label className="grid gap-1 text-xs text-[var(--text-muted)]">
          Responsável (pessoa)
          <input className={campo} value={dono} onChange={(e) => setDono(e.target.value)} placeholder="Nome" maxLength={80} disabled={bloqueado} required />
        </label>
        <label className="grid gap-1 text-xs text-[var(--text-muted)]">
          Prazo
          <input className={campo} type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} disabled={bloqueado} required />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={bloqueado} className="rounded-md bg-icf-green px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
          {enviando ? 'Salvando…' : 'Salvar ação'}
        </button>
        {aberta && (
          <button type="button" onClick={concluir} disabled={bloqueado} className="rounded-md border border-[var(--border-strong)] px-3 py-1.5 text-sm font-semibold disabled:opacity-50">
            Marcar como feita
          </button>
        )}
        <span className="text-xs text-[var(--text-muted)]">
          {!podeEditar
            ? 'Somente leitura: edição desligada neste ambiente.'
            : ultima
              ? `Última alteração em ${dma(ultima.em)}${ultima.por ? ` por ${ultima.por}` : ''}${ultima.feita ? ' · ação anterior concluída' : ''}`
              : null}
        </span>
      </div>
      {erro && <p role="alert" className="text-xs font-semibold text-red-700 dark:text-red-300">{erro}</p>}
    </form>
  )
}
