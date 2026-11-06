import { useMemo, useState } from 'react'
import { number } from '../../lib/palette'
import { dataCurtaBr } from '../../lib/datas'
import { MESES_NOME } from '../indicadores/calculos'
import { COR_ATRASO, COR_OK, Colunas, Kpi, Legenda, ListaBarras, Painel, Rosca, Vazio } from '../indicadores/ui'
import { SLA_PIETA_DIAS, contarSla as contarPor, resumirSla, type ChamadoSla } from './sla'

const pct1 = (v: number) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
const unicos = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b, 'pt-BR'))
const CAMPO = 'rounded-md border border-[var(--ind-borda)] bg-[var(--ind-card)] px-2.5 py-1.5 text-[13px] text-[var(--ind-texto)] focus:border-[var(--ind-acento)] focus:outline-none'

interface F { cliente: string; ano: string; mes: string; distribuidora: string; uf: string; status: string; aberto: '' | 'sim' | 'nao' }
const VAZIO: F = { cliente: '', ano: '', mes: '', distribuidora: '', uf: '', status: '', aberto: '' }

/** Dashboard de SLA de Atendimento da Pieta: prazo de {SLA_PIETA_DIAS} dias entre a criação e a finalização do projeto. */
export function SlaAtendimento({ chamados }: { chamados: ChamadoSla[] }) {
  const [f, setF] = useState<F>(VAZIO)
  const set = (p: Partial<F>) => setF((x) => ({ ...x, ...p }))
  const filtrados = useMemo(() => chamados.filter((c) => {
    if (f.cliente && !c.cliente.toLowerCase().includes(f.cliente.toLowerCase())) return false
    if (f.ano && c.ano !== f.ano) return false
    if (f.mes && c.mes.slice(5) !== f.mes) return false
    if (f.distribuidora && c.distribuidora !== f.distribuidora) return false
    if (f.uf && c.uf !== f.uf) return false
    if (f.status && c.status !== f.status) return false
    if (f.aberto === 'sim' && c.finalizado) return false
    if (f.aberto === 'nao' && !c.finalizado) return false
    return true
  }), [chamados, f])

  const r = resumirSla(filtrados)
  const finalizados = filtrados.filter((c) => c.finalizado)
  const abertos = filtrados.filter((c) => !c.finalizado)
  const pctOk = r.finalizados ? (100 * r.atendidos) / r.finalizados : 0
  const etapas = contarPor(abertos, (c) => c.status)
  const anos = contarPor(filtrados, (c) => c.ano).sort((a, b) => a.nome.localeCompare(b.nome))
  const estados = contarPor(filtrados, (c) => c.uf)
  const meses = [...contarPor(finalizados, (c) => c.mes)].sort((a, b) => a.nome.localeCompare(b.nome))
  const ativos = Object.values(f).filter(Boolean).length
  const opt = (v: string[]) => v.map((x) => <option key={x} value={x}>{x}</option>)

  return (
    <div className="sla-pieta grid gap-4 text-[var(--ind-texto)]">
      <section aria-label="Filtros" className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--ind-borda)] bg-[var(--ind-fundo)] p-3">
        {([
          ['Cliente', <input key="c" value={f.cliente} onChange={(e) => set({ cliente: e.target.value })} placeholder="Todos" className={CAMPO} />],
          ['Ano', <select key="a" value={f.ano} onChange={(e) => set({ ano: e.target.value })} className={CAMPO}><option value="">Todos</option>{opt(unicos(chamados.map((c) => c.ano)))}</select>],
          ['Mês', <select key="m" value={f.mes} onChange={(e) => set({ mes: e.target.value })} className={CAMPO}><option value="">Todos</option>{MESES_NOME.map((n, i) => <option key={n} value={String(i + 1).padStart(2, '0')}>{n}</option>)}</select>],
          ['Distribuidora', <select key="d" value={f.distribuidora} onChange={(e) => set({ distribuidora: e.target.value })} className={CAMPO}><option value="">Todas</option>{opt(unicos(chamados.map((c) => c.distribuidora)))}</select>],
          ['Estado', <select key="e" value={f.uf} onChange={(e) => set({ uf: e.target.value })} className={CAMPO}><option value="">Todos</option>{opt(unicos(chamados.map((c) => c.uf)))}</select>],
          ['Status', <select key="s" value={f.status} onChange={(e) => set({ status: e.target.value })} className={CAMPO}><option value="">Todos</option>{opt(unicos(chamados.map((c) => c.status)))}</select>],
          ['Em aberto', <select key="o" value={f.aberto} onChange={(e) => set({ aberto: e.target.value as F['aberto'] })} className={CAMPO}><option value="">Todos</option><option value="sim">Sim</option><option value="nao">Não</option></select>],
        ] as [string, JSX.Element][]).map(([rot, el]) => (
          <label key={rot} className="flex min-w-[130px] flex-col gap-1 text-[10px] font-bold uppercase tracking-wider text-[var(--ind-mudo)]">{rot}{el}</label>
        ))}
        <button type="button" onClick={() => setF(VAZIO)} disabled={!ativos} className="rounded-md border border-[var(--ind-borda)] px-3 py-1.5 text-xs text-[var(--ind-mudo)] disabled:opacity-50">Limpar filtros</button>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi rotulo="Total de chamados" valor={number.format(r.total)} sub="Conta ICF ENERGY" cor="#55596a" />
        <Kpi rotulo="Em aberto" valor={number.format(r.abertos)} sub={`${pct1(r.total ? (100 * r.abertos) / r.total : 0)} do total`} cor="#c6740a" />
        <Kpi rotulo="Total finalizado" valor={number.format(r.finalizados)} sub={`${pct1(r.total ? (100 * r.finalizados) / r.total : 0)} do total`} cor="#1f6fd6" />
        <Kpi rotulo={`SLA atendido (≤${SLA_PIETA_DIAS}d)`} valor={number.format(r.atendidos)} sub={`${pct1(pctOk)} dos finalizados`} cor={COR_OK} />
        <Kpi rotulo="SLA extrapolado" valor={number.format(r.extrapolados)} sub={`${pct1(r.finalizados ? 100 - pctOk : 0)} dos finalizados`} cor={COR_ATRASO} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="grid content-start gap-4">
          <Painel titulo="SLA atendido">
            <div className="flex flex-col items-center gap-3">
              <Rosca tamanho={170} espessura={20} partes={[{ nome: 'Atendido', valor: r.atendidos, cor: COR_OK }, { nome: 'Extrapolado', valor: r.extrapolados, cor: COR_ATRASO }]} centro={<><b className="ind-titulo text-3xl">{pct1(pctOk)}</b><span className="text-[11px] text-[var(--ind-mudo)]">dentro do prazo</span></>} />
              <Legenda itens={[{ nome: `Atendido ${r.atendidos}`, cor: COR_OK }, { nome: `Extrapolado ${r.extrapolados}`, cor: COR_ATRASO }]} />
            </div>
          </Painel>
          <Painel titulo="Em aberto por etapa" nota={`${etapas.length} etapa(s)`}><ListaBarras itens={etapas.map((e) => ({ nome: e.nome, valor: e.total }))} cor={COR_ATRASO} /></Painel>
          <Painel titulo="Chamados por ano"><Colunas altura={110} colunas={anos.map((a) => ({ rotulo: a.nome, partes: [{ nome: 'Chamados', valor: a.total, cor: '#1f6fd6' }] }))} /></Painel>
        </div>
        <div className="grid content-start gap-4">
          <Painel titulo="SLA atendido × extrapolado por mês" nota={`${meses.length} mês(es)`}>
            <Colunas altura={160} larguraMin={34} colunas={meses.map((m) => ({ rotulo: m.nome.slice(2), partes: [{ nome: 'Atendido', valor: m.atendidos, cor: COR_OK }, { nome: 'Extrapolado', valor: m.atrasados, cor: COR_ATRASO }] }))} />
            <Legenda itens={[{ nome: 'Atendido', cor: COR_OK }, { nome: 'Extrapolado', cor: COR_ATRASO }]} />
          </Painel>
          <Painel titulo="Chamados por estado" nota={`${estados.length} estado(s)`}><Colunas altura={130} larguraMin={34} colunas={estados.map((e) => ({ rotulo: e.nome, partes: [{ nome: 'Chamados', valor: e.total, cor: '#1f6fd6' }] }))} /></Painel>
          <Painel titulo="Clientes com chamados em aberto" nota={`${abertos.length} chamado(s)`}>
            {!abertos.length ? <Vazio /> : (
              <div className="ind-scroll max-h-[320px] overflow-auto">
                <table className="w-full text-[13px]">
                  <thead><tr className="text-left text-[10px] uppercase tracking-wider text-[var(--ind-mudo)]"><th className="py-1.5 pr-3">Cliente</th><th className="pr-3">Etapa</th><th className="pr-3 text-right">Dias</th><th>Última alteração</th></tr></thead>
                  <tbody>{[...abertos].sort((a, b) => b.dias - a.dias).map((c) => (
                    <tr key={c.id} className="border-t border-[var(--ind-borda)]"><td className="py-1.5 pr-3">{c.cliente}</td><td className="pr-3">{c.status}</td><td className="pr-3 text-right tabular-nums" style={c.atendido ? undefined : { color: COR_ATRASO }}>{c.dias}</td><td>{dataCurtaBr(c.ultimaAlteracao)}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </Painel>
        </div>
      </div>
    </div>
  )
}
