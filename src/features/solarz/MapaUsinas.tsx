import { useMemo, useState, type ReactNode } from 'react'
import type { UsinaRaw, UsinasRawResponse } from '../../api/types'
import { DetailRow, Modal } from '../../components/Modal'
import { currency, decimal } from '../../lib/palette'
import { dataCurtaBr } from '../../lib/datas'
import { energiaCurta } from '../../lib/formatoGrafico'
import { FarolDiario } from './FarolDiario'
import { CONTORNOS_UF, MAPA_ALTURA, MAPA_LARGURA } from './mapaBrasil'
import {
  COR_STATUS, STATUS_DESEMPENHO, entraNoMapa, posicaoAproximada, potenciaPorRegiao, resumoParque, statusDe, ufValida, type StatusDesempenho,
} from './usinasMapa'

const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
const nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct = (v: number | null | undefined) => (v != null && Number.isFinite(v) ? `${nf1.format(v * 100)}%` : '—')
const dataBr = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : null)
const dataHoraBr = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—')

const serieMensal = (u: UsinaRaw) => u.mensal ?? u.mensal2026 ?? []

function Cartao({ icone, titulo, valor, nota }: { icone: ReactNode; titulo: string; valor: string; nota: string }) {
  return (
    <section className="flex min-w-0 items-start justify-between gap-3 rounded-[14px] border border-[var(--border)] bg-[var(--surface)] px-[18px] py-4 shadow-[var(--shadow-card)]">
      <div className="min-w-0">
        <h3 className="flex items-center gap-[7px] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]"><span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" />{titulo}</h3>
        <p className="mt-1 text-[27px] font-bold leading-tight tracking-tight tabular-nums text-[var(--text-primary)]">{valor}</p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">{nota}</p>
      </div>
      <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-text)]">{icone}</span>
    </section>
  )
}

const IconeSol = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
)
const IconeRaio = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M13 2 4 14h6l-1 8 9-12h-6z" /></svg>
)
const IconeGrafico = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="m7 14 4-4 3 3 5-6" /></svg>
)

function Painel({ id, titulo, subtitulo, children }: { id?: string; titulo: string; subtitulo?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 min-w-0 rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] sm:p-5">
      <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">{titulo}</h3>
      {subtitulo && <p className="mb-4 mt-0.5 text-xs text-[var(--text-muted)]">{subtitulo}</p>}
      {children}
    </section>
  )
}

/** Rosca de status: um anel por status, na ordem da legenda. */
function Rosca({ partes, total }: { partes: { status: StatusDesempenho; qtd: number }[]; total: number }) {
  const R = 42
  const C = 2 * Math.PI * R
  let acumulado = 0
  return (
    <svg viewBox="0 0 100 100" className="h-40 w-40 shrink-0" role="img" aria-label={partes.map((p) => `${p.status}: ${p.qtd}`).join('; ')}>
      <circle cx="50" cy="50" r={R} fill="none" stroke="var(--track-bg)" strokeWidth="12" />
      {total > 0 && partes.map((p) => {
        const tam = (p.qtd / total) * C
        const el = p.qtd > 0 && (
          <circle key={p.status} cx="50" cy="50" r={R} fill="none" stroke={COR_STATUS[p.status]} strokeWidth="12"
            strokeDasharray={`${Math.max(0, tam - 0.8)} ${C}`} strokeDashoffset={-acumulado} transform="rotate(-90 50 50)" />
        )
        acumulado += tam
        return el
      })}
      <text x="50" y="50" textAnchor="middle" className="fill-[var(--text-primary)]" fontSize="18" fontWeight="700">{nf0.format(total)}</text>
      <text x="50" y="63" textAnchor="middle" className="fill-[var(--text-muted)]" fontSize="7">usinas</text>
    </svg>
  )
}

function MapaBrasil({ usinas }: { usinas: UsinaRaw[] }) {
  const pontos = useMemo(() => usinas.filter(entraNoMapa).map((u) => ({ u, p: posicaoAproximada(u), s: statusDe(u) })).filter((x) => x.p), [usinas])
  // Desenha "Sem dado" primeiro e "Crítico" por cima, para o que pede atenção não ficar escondido.
  const ordem: StatusDesempenho[] = ['Sem dado', 'Dentro do esperado', 'Atenção', 'Crítico']
  const ordenados = [...pontos].sort((a, b) => ordem.indexOf(a.s) - ordem.indexOf(b.s))
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${MAPA_LARGURA} ${MAPA_ALTURA}`} className="mx-auto block h-auto w-full max-w-[760px]" role="img" aria-label={`Mapa do Brasil com ${pontos.length} usinas por UF`}>
        {CONTORNOS_UF.map((c) => (
          <path key={c.uf} d={c.d} fill="var(--track-bg)" stroke="var(--border-strong)" strokeWidth="1" strokeLinejoin="round">
            <title>{c.uf}</title>
          </path>
        ))}
        {ordenados.map(({ u, p, s }, i) => (
          <circle key={`${u.id ?? u.nome}-${i}`} cx={p![0]} cy={p![1]} r="6.5" fill={COR_STATUS[s]} stroke="var(--viz-ring)" strokeWidth="1.5">
            <title>{`${u.nome} · ${u.cidade ? `${u.cidade}/` : ''}${ufValida(u.estado)} · ${s}`}</title>
          </circle>
        ))}
      </svg>
      <ul className="mt-2 flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm text-[var(--text-secondary)] md:absolute md:right-0 md:top-0 md:mt-0 md:flex-col">
        {STATUS_DESEMPENHO.map((s) => (
          <li key={s} className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: COR_STATUS[s] }} aria-hidden="true" />{s}</li>
        ))}
      </ul>
    </div>
  )
}

const opcoes = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => Boolean(x && x.trim())))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function Seletor({ rotulo, valor, onMudar, itens }: { rotulo: string; valor: string; onMudar: (v: string) => void; itens: string[] }) {
  return (
    <label className="min-w-0">
      <span className="sr-only">{rotulo}</span>
      <select value={valor} onChange={(e) => onMudar(e.target.value)}
        className="h-9 w-full rounded-[9px] border border-[var(--border-strong)] bg-[var(--input-bg)] px-2.5 text-sm text-[var(--text-primary)] focus:border-icf-green focus:outline-none">
        <option value="">{rotulo}: Todos</option>
        {itens.map((i) => <option key={i} value={i}>{i}</option>)}
      </select>
    </label>
  )
}

const FILTROS_VAZIOS = { busca: '', uf: '', cidade: '', concessionaria: '', classe: '', status: '' }

function EtiquetaStatus({ s }: { s: StatusDesempenho }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium text-[var(--text-primary)]"
      style={{ background: `color-mix(in srgb, ${COR_STATUS[s]} 20%, transparent)` }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: COR_STATUS[s] }} aria-hidden="true" />{s}
    </span>
  )
}

function TabelaCompleta({ usinas, rodapeDireita, onAbrir }: { usinas: UsinaRaw[]; rodapeDireita: string; onAbrir: (u: UsinaRaw) => void }) {
  const [f, setF] = useState(FILTROS_VAZIOS)
  const muda = (k: keyof typeof FILTROS_VAZIOS) => (v: string) => setF((x) => ({ ...x, [k]: v }))
  const ativos = Object.values(f).some(Boolean)
  const base = useMemo(() => [...usinas].sort((a, b) => (a.fonte === 'solarz' ? 0 : 1) - (b.fonte === 'solarz' ? 0 : 1) || (b.potenciaKwp ?? -1) - (a.potenciaKwp ?? -1) || a.nome.localeCompare(b.nome, 'pt-BR')), [usinas])
  const filtradas = base.filter((u) => {
    if (f.uf && ufValida(u.estado) !== f.uf) return false
    if (f.cidade && u.cidade !== f.cidade) return false
    if (f.concessionaria && u.concessionaria !== f.concessionaria) return false
    if (f.classe && u.classe !== f.classe) return false
    if (f.status && statusDe(u) !== f.status) return false
    if (f.busca) {
      const q = sem(f.busca)
      if (![u.nome, u.cliente, u.cidade].some((x) => x && sem(x).includes(q))) return false
    }
    return true
  })
  const cidades = opcoes(usinas.filter((u) => !f.uf || ufValida(u.estado) === f.uf).map((u) => u.cidade))
  const th = 'sticky top-0 z-10 whitespace-nowrap bg-[var(--surface-hover)] px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]'
  const td = 'max-w-[13rem] truncate whitespace-nowrap border-b border-[var(--border)] px-3 py-2.5'
  const colunas = ['Usina', 'Cliente', 'Cidade', 'UF', 'Potência (kWp)', 'Mês/ano', 'Geração (kWh)', 'Desemp. mês', 'Status']
  return (
    <>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_repeat(5,minmax(0,1fr))_auto]">
        <label className="min-w-0">
          <span className="sr-only">Buscar usina, cliente ou cidade</span>
          <input value={f.busca} onChange={(e) => muda('busca')(e.target.value)} placeholder="Buscar usina, cliente ou cidade…"
            className="h-9 w-full rounded-[9px] border border-[var(--border-strong)] bg-[var(--input-bg)] px-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-icf-green focus:outline-none" />
        </label>
        <Seletor rotulo="UF" valor={f.uf} onMudar={(v) => setF((x) => ({ ...x, uf: v, cidade: '' }))} itens={opcoes(usinas.map((u) => ufValida(u.estado)))} />
        <Seletor rotulo="Cidade" valor={f.cidade} onMudar={muda('cidade')} itens={cidades} />
        <Seletor rotulo="Concessionária" valor={f.concessionaria} onMudar={muda('concessionaria')} itens={opcoes(usinas.map((u) => u.concessionaria))} />
        <Seletor rotulo="Classe" valor={f.classe} onMudar={muda('classe')} itens={opcoes(usinas.map((u) => u.classe))} />
        <Seletor rotulo="Status" valor={f.status} onMudar={muda('status')} itens={[...STATUS_DESEMPENHO]} />
        <button type="button" onClick={() => setF(FILTROS_VAZIOS)} disabled={!ativos}
          className="h-9 whitespace-nowrap rounded-[9px] border border-[var(--border-strong)] px-3.5 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] disabled:opacity-50">
          Limpar filtros
        </button>
      </div>
      <div className="max-h-[560px] overflow-auto rounded-[10px] border border-[var(--border)]">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              {colunas.map((c, i) => (
                <th key={c} scope="col" className={`${th} ${[4, 6, 7].includes(i) ? 'text-right' : 'text-left'}`}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtradas.map((u, i) => (
              <tr key={`${u.id ?? 'r'}-${i}`} onClick={() => onAbrir(u)} className="cursor-pointer hover:bg-[var(--surface-hover)]">
                <td className={`${td} font-medium text-[var(--text-primary)]`}>{u.nome}</td>
                <td className={`${td} text-[var(--text-secondary)]`}>{u.cliente ?? '—'}</td>
                <td className={`${td} text-[var(--text-secondary)]`}>{u.cidade ?? '—'}</td>
                <td className={`${td} text-[var(--text-secondary)]`}>{ufValida(u.estado) ?? '—'}</td>
                <td className={`${td} text-right tabular-nums text-[var(--text-primary)]`}>{u.potenciaKwp != null ? `${nf1.format(u.potenciaKwp)} kWp` : '—'}</td>
                <td className={`${td} text-[var(--text-secondary)]`}>{u.mesAnoRecente ?? '—'}</td>
                <td className={`${td} text-right tabular-nums text-[var(--text-primary)]`}>{u.geracaoKwhMes != null ? `${nf0.format(u.geracaoKwhMes)} kWh` : '—'}</td>
                <td className={`${td} text-right tabular-nums text-[var(--text-secondary)]`}>{pct(u.desempenhoMesPct)}</td>
                <td className={td}><EtiquetaStatus s={statusDe(u)} /></td>
              </tr>
            ))}
            {!filtradas.length && (
              <tr><td colSpan={colunas.length} className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">Nenhuma usina com esses filtros.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-[var(--text-muted)]">
        <span>{nf0.format(filtradas.length)} {filtradas.length === 1 ? 'usina exibida' : 'usinas exibidas'}</span>
        <span>{rodapeDireita}</span>
      </div>
    </>
  )
}

function FichaUsina({ u, onFechar }: { u: UsinaRaw; onFechar: () => void }) {
  const serie = serieMensal(u)
  return (
    <Modal title={u.nome} onClose={onFechar}>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <DetailRow label="Cliente" value={u.cliente} />
          <DetailRow label="Classe" value={u.classe} />
          <DetailRow label="Plano" value={u.plano} />
          <DetailRow label="Potência" value={`${decimal.format(u.potenciaKwp ?? 0)} kWp`} />
          <DetailRow label="Total investido" value={u.totalInvestido != null ? currency.format(u.totalInvestido) : '—'} />
          <DetailRow label="Concessionária" value={u.concessionaria} />
          <DetailRow label="Cidade/UF" value={u.cidade ? `${u.cidade}/${u.estado}` : '—'} />
          <DetailRow label="Data de instalação" value={dataCurtaBr(u.dataInstalacao)} />
          <DetailRow label="Status de monitoramento (tempo real)" value={u.statusMonitoramento ?? 'Sem monitoramento premium'} />
          <DetailRow label="Status de desempenho (méd. 3M)" value={<EtiquetaStatus s={statusDe(u)} />} />
          <DetailRow label="Fonte dos dados" value={u.fonte === 'solarz' ? `SolarZ ao vivo (${dataHoraBr(u.dadoEm)})` : 'Relatório importado'} />
          <DetailRow label="UC" value={u.unidadesConsumidoras?.length ? u.unidadesConsumidoras.join(', ') : '—'} />
          <DetailRow label="Tickets abertos" value={u.ticketsAbertos != null ? String(u.ticketsAbertos) : '—'} />
          <DetailRow label="Mês de referência" value={u.mesAnoRecente ?? '—'} />
          <DetailRow label="Desempenho do mês" value={pct(u.desempenhoMesPct)} />
          <DetailRow label="Desempenho 12M" value={pct(u.desempenho12mPct)} />
          {u.observacao && <div className="mt-3 rounded-lg bg-[var(--surface-hover)] p-3 text-xs text-[var(--text-secondary)]">{u.observacao}</div>}
        </div>
        <div>
          <p className="mb-1 text-xs text-[var(--text-muted)]">{`Geração mensal ${u.anoMensal ?? 2026}`}</p>
          <ul className="space-y-1">
            {serie.map((m) => (
              <li key={m.mes} className="flex justify-between text-xs">
                <span className="text-[var(--text-secondary)]">{m.mes}/{String(u.anoMensal ?? 2026).slice(2)}{m.parcial ? ' (parcial)' : ''}</span>
                <span className="text-[var(--text-secondary)]">
                  {m.geracaoKwh != null ? energiaCurta(m.geracaoKwh) : '—'}
                  {m.desempenhoPct != null && <span className="ml-2 text-[var(--text-muted)]">({pct(m.desempenhoPct)})</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  )
}

/** Tela "Mapa das Usinas SolarZ": cabeçalho, cartões, rosca de status, potência por região, farol diário, mapa e lista completa. */
export function MapaUsinas({ resposta, hoje }: { resposta: UsinasRawResponse; hoje: string }) {
  const usinas = resposta.usinas
  const origem = resposta.origemDados
  const [aberta, setAberta] = useState<UsinaRaw | null>(null)
  const r = useMemo(() => resumoParque(usinas, hoje), [usinas, hoje])
  const regioes = useMemo(() => potenciaPorRegiao(usinas), [usinas])
  const maxMw = Math.max(0.0001, ...regioes.map((x) => x.mw))
  const atualizado = dataBr(origem?.solarzAtualizadoEm) ?? 'sem carga da API'
  const semUf = usinas.length - usinas.filter(entraNoMapa).length

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0 max-w-3xl">
          <h2 className="text-xl font-bold leading-tight tracking-tight text-[var(--text-primary)]">Mapa das Usinas</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Visão consolidada do parque de geração distribuída monitorado pela ITYOU Solar: localização, potência instalada e status de desempenho de cada usina.</p>
        </div>
        <div className="text-right text-xs leading-5 text-[var(--text-secondary)]">
          <p><b className="text-[var(--text-primary)]">{nf0.format(usinas.length)}</b> usinas espalhadas pelo Brasil</p>
          <p>Fonte: API SolarZ (carga diária)</p>
          <p>Última atualização: <b className="text-[var(--text-primary)]">{atualizado}</b></p>
        </div>
      </header>

      {resposta.avisoIntegracaoSolarZ && (
        <p role="alert" className="rounded-lg border border-[var(--st-risco)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text-secondary)]">{resposta.avisoIntegracaoSolarZ}</p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Cartao icone={<IconeSol />} titulo="Usinas monitoradas" valor={nf0.format(r.total)} nota={`Última atualização · ${atualizado}`} />
        <Cartao icone={<IconeRaio />} titulo="Potência total" valor={`${nf2.format(r.kwp / 1000)} MW`} nota={`${nf0.format(r.kwp)} kWp instalados`} />
        <Cartao icone={<IconeGrafico />} titulo={`Geração do mês (${r.ref.curto})`} valor={`${nf1.format(r.geracaoKwh / 1000)} MWh`} nota={`${nf0.format(r.fechadas)} de ${nf0.format(r.total)} usinas com geração fechada`} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Painel titulo="Status de Desempenho" subtitulo="Média dos últimos 3 meses de geração vs. prognóstico, por usina.">
          <div className="flex flex-wrap items-center gap-6">
            <Rosca partes={r.status} total={r.total} />
            <ul className="min-w-[13rem] flex-1 space-y-2 text-sm">
              {r.status.map((s) => (
                <li key={s.status} className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-2 font-medium text-[var(--text-primary)]"><span className="h-3 w-3 rounded-full" style={{ background: COR_STATUS[s.status] }} aria-hidden="true" />{s.status}</span>
                  <span className="tabular-nums text-[var(--text-secondary)]">{nf0.format(s.qtd)} ({nf1.format(r.total ? (100 * s.qtd) / r.total : 0)}%)</span>
                </li>
              ))}
            </ul>
          </div>
        </Painel>
        <Painel titulo="Potência por Região" subtitulo="Soma da potência instalada (kWp), convertida em MW.">
          <ul className="space-y-2.5">
            {regioes.map((x) => (
              <li key={x.regiao} className="grid grid-cols-[7.5rem_minmax(0,1fr)_3.5rem] items-center gap-3 text-sm">
                <span className="font-medium text-[var(--text-primary)]">{x.regiao}</span>
                <span className="h-2 rounded bg-[var(--track-bg)]" aria-hidden="true">
                  <span className="block h-full rounded bg-[var(--viz-1)]" style={{ width: `${(100 * x.mw) / maxMw}%` }} />
                </span>
                <span className="text-right font-semibold tabular-nums text-[var(--text-primary)]" title={`${nf0.format(x.qtd)} usinas`}>{nf2.format(x.mw)}</span>
              </li>
            ))}
          </ul>
        </Painel>
      </div>

      <Painel titulo="Farol Diário — Evolução da Conectividade"
        subtitulo="Contagem diária do farol de monitoramento do painel SolarZ (status de conectividade dos coletores de dados de cada usina — diferente do Status de Desempenho acima). Fonte: captura diária da API SolarZ.">
        <FarolDiario historico={origem?.farolHistorico ?? []} hoje={hoje} />
      </Painel>

      <Painel titulo="Mapa Geográfico das Usinas"
        subtitulo={`Localização aproximada pela UF cadastrada. ${nf0.format(semUf)} de ${nf0.format(usinas.length)} usinas sem UF informada não aparecem no mapa.`}>
        <MapaBrasil usinas={usinas} />
      </Painel>

      <Painel id="lista-usinas" titulo="Usinas (lista completa)" subtitulo="Filtre por UF, cidade, concessionária, classe ou status, ou busque pelo nome da usina/cliente.">
        <TabelaCompleta usinas={usinas} onAbrir={setAberta}
          rodapeDireita={`${nf0.format(usinas.length)} usinas no total · última atualização, ${atualizado}`} />
      </Painel>

      {aberta && <FichaUsina u={aberta} onFechar={() => setAberta(null)} />}
    </div>
  )
}
