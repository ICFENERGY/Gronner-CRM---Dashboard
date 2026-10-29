import { BarChartGeneric } from '../../../components/BarChartGeneric'
import { Secao } from '../componentes/Selo'
import { num } from '../formato'
import type { Engenharia } from '../tipos'
import { catalogo, RECOMENDACOES, ROTULO_SITUACAO, type Situacao } from './catalogo'
import { FluxoMarcos } from './FluxoMarcos'
import { ListaCards } from './ListaCards'

const COR_SITUACAO: Record<Situacao, string> = {
  calcula: 'text-green-700 dark:text-green-300',
  proxy: 'text-amber-800 dark:text-amber-300',
  sem: 'text-red-700 dark:text-red-300',
}
const FUNDO_SITUACAO: Record<Situacao, string> = { calcula: 'bg-green-500', proxy: 'bg-amber-400', sem: 'bg-red-500' }
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function Etiqueta({ s }: { s: Situacao }) {
  return (
    <span className={`inline-flex w-max items-center gap-1.5 rounded-full border border-[var(--border-strong)] px-2 py-0.5 font-mono text-[11px] ${COR_SITUACAO[s]}`}>
      <i className="inline-block h-1.5 w-1.5 rounded-full bg-current" />{ROTULO_SITUACAO[s]}
    </span>
  )
}

function Bloco({ rotulo, valor, detalhe, s, semDado }: { rotulo: string; valor: string; detalhe: string; s: Situacao; semDado?: boolean }) {
  return (
    <div className="grid content-start gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <span className="font-mono text-[11px] uppercase tracking-wide text-[var(--text-muted)]">{rotulo}</span>
      <span className={semDado ? 'text-base font-semibold text-[var(--text-muted)]' : 'font-mono text-3xl font-medium tabular-nums'}>{valor}</span>
      <span className="text-xs text-[var(--text-secondary)]">{detalhe}</span>
      <Etiqueta s={s} />
    </div>
  )
}

function BarrasH({ itens, sufixo = '' }: { itens: { nome: string; valor: number }[]; sufixo?: string }) {
  const max = Math.max(1, ...itens.map((i) => i.valor))
  return (
    <div className="grid gap-1.5">
      {itens.map((i) => (
        <div key={i.nome} className="grid grid-cols-[minmax(110px,170px)_minmax(0,1fr)_40px] items-center gap-2.5 text-sm">
          <span className="truncate">{i.nome}</span>
          <span className="h-2.5 overflow-hidden rounded bg-[var(--track-bg)]"><span className="block h-full rounded bg-icf-green" style={{ width: `${(100 * i.valor) / max}%` }} /></span>
          <span className="text-right font-mono text-xs text-[var(--text-secondary)]">{i.valor}{sufixo}</span>
        </div>
      ))}
    </div>
  )
}

/** Painel da Engenharia: indicadores do modelo calculados ao vivo a partir do Groner sincronizado. */
export function PainelEngenharia({ dados }: { dados: Engenharia }) {
  const p = dados.painel
  const kpis = catalogo(p)
  const conta = { calcula: 0, proxy: 0, sem: 0 } as Record<Situacao, number>
  kpis.forEach((k) => conta[k.situacao]++)
  const vendas = p.vendas.map((v) => ({ name: `${MESES[Number(v.mes.slice(5, 7)) - 1]}/${v.mes.slice(2, 4)}`, value: v.n }))

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <Secao titulo="A base mostra onde cada card está; os prazos vêm do histórico que começou a ser gravado" subtitulo={`${p.universo} cards no fluxo da Engenharia (${p.ativos} ativos, ${p.encerrados} encerrados, incluindo os já entregues no Funil 11). Fora: ${p.historicoContrato} vendas antigas paradas em 06. CONTRATO.`}>
        <div className="grid gap-5 md:grid-cols-[1.4fr_1fr]">
          <p className="max-w-[62ch] text-sm text-[var(--text-secondary)]">
            O Groner guarda só a posição atual (etapa e status). A sincronização do n8n agora grava a data de cada mudança de status, então os indicadores de prazo (entrega da solução, homologação, instalação, encerramento) passam a ser calculados à medida que os cards percorrem os marcos. O resto depende de campos que já existem no Groner e estão vazios.
          </p>
          <div className="grid content-start gap-2">
            <span className="font-mono text-[11px] uppercase tracking-wide text-[var(--text-muted)]">16 indicadores do modelo</span>
            <div className="flex h-3.5 gap-0.5 overflow-hidden rounded" role="img" aria-label={`${conta.calcula} calculam, ${conta.proxy} com proxy, ${conta.sem} sem dado`}>
              {(['calcula', 'proxy', 'sem'] as Situacao[]).map((s) => <span key={s} className={FUNDO_SITUACAO[s]} style={{ flex: conta[s] }} />)}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
              {(['calcula', 'proxy', 'sem'] as Situacao[]).map((s) => <span key={s}><i className={`mr-1.5 inline-block h-2.5 w-2.5 rounded-sm align-[-1px] ${FUNDO_SITUACAO[s]}`} /><b className="font-mono">{conta[s]}</b> {s === 'calcula' ? 'calculam' : s === 'proxy' ? 'com proxy' : 'sem dado'}</span>)}
            </div>
          </div>
        </div>
      </Secao>

      <div className="grid gap-3">
        <h2 className="text-base font-semibold">Painel da Diretoria</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Bloco rotulo="Prazo de entrega da solução" valor="Sem dado ainda" detalhe="Sai do histórico de entrada e saída da Engenharia, que começou a ser gravado." s="sem" semDado />
          <Bloco rotulo="Ciclo da obra" valor={p.obra.idadeMediana != null ? `${num(p.obra.idadeMediana)} d` : '—'} detalhe={`Idade mediana das ${p.obra.n} obras em andamento, desde a venda.`} s="proxy" />
          <Bloco rotulo="Desempenho da usina" valor="Sem dado" detalhe={`A geração prevista existe (${num(p.usina.geracaoPrevistaMWh, 1)} MWh/mês). Falta a geração real do SolarZ.`} s="sem" semDado />
          <Bloco rotulo="Gestão completa" valor={`${p.gestao.completaPct}%`} detalhe={`Cards com dono nominal e prazo futuro. ${p.gestao.semDono} de ${p.ativos} sem dono nominal; ${p.gestao.prazoVencido} com previsão vencida.`} s="calcula" />
        </div>
      </div>

      <div className="grid gap-3">
        <h2 className="text-base font-semibold">Carteira e fila</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Bloco rotulo="Cards ativos" valor={num(p.ativos)} detalhe={`${num(p.kwpAtivo)} kWp e R$ ${num(p.valorAtivo / 1e6, 2)} mi em propostas aceitas`} s="calcula" />
          <Bloco rotulo="Parados há mais de 15 dias" valor={`${p.parados.pct}%`} detalhe={`${p.parados.vermelho} cards em vermelho, ${p.parados.amarelo} em amarelo`} s="calcula" />
          <Bloco rotulo="Fila da Engenharia" valor={num(p.fila.n)} detalhe={`Marcos 1 a 3. ${p.fila.pendenciaTecnica} em pendência técnica.`} s="calcula" />
          <Bloco rotulo="Relógio trocado, sem monitoramento" valor={num(p.monitoramento.relogioSemMonitoramento)} detalhe="Ativados, mas sem SolarZ, termo e dossiê." s="calcula" />
        </div>
      </div>

      <Secao titulo="Fluxo atual por marco" subtitulo="Cada card no marco em que está hoje. A cor usa os dias sem atualização no card.">
        <FluxoMarcos painel={p} />
      </Secao>

      <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
        <BarChartGeneric title="Vendas por mês, últimos 12 meses (cards do fluxo da Engenharia)" data={vendas} ordenarPorValor={false} />
        <Secao titulo="Cards entre protocolo e vistoria, por concessionária" subtitulo="O prazo por concessionária sai do histórico de status (protocolo → parecer).">
          <BarrasH itens={p.concessionarias.map((c) => ({ nome: c.nome, valor: c.n }))} />
        </Secao>
      </div>

      <Secao titulo="Os 16 indicadores com o dado de hoje">
        <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--bg)] text-left font-mono text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
              <tr>{['Momento', 'Indicador', 'Valor hoje', 'Situação', 'O que falta'].map((h) => <th key={h} className="border-b border-[var(--border)] px-3 py-2.5 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {kpis.map((k) => (
                <tr key={k.nome} className="border-b border-[var(--border)] align-top last:border-0">
                  <td className="px-3 py-2">{k.momento}</td>
                  <td className="min-w-[150px] px-3 py-2 font-semibold">{k.nome}</td>
                  <td className="min-w-[220px] px-3 py-2">{k.valor}</td>
                  <td className="px-3 py-2"><Etiqueta s={k.situacao} /></td>
                  <td className="min-w-[240px] px-3 py-2 text-[var(--text-secondary)]">{k.falta}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Secao>

      <Secao titulo="O que a base tem, o que existe vazio e o que não existe" subtitulo={`Preenchimento nos ${p.universo} cards do fluxo da Engenharia (ativos e encerrados).`}>
        <div className="grid gap-5 md:grid-cols-3">
          <div className="grid content-start gap-2"><h3 className="text-sm font-semibold">Bem preenchidos</h3><BarrasH sufixo="%" itens={p.preenchimento.filter((c) => c.grupo === 'cheio').map((c) => ({ nome: c.rotulo, valor: c.pct }))} /></div>
          <div className="grid content-start gap-2"><h3 className="text-sm font-semibold">Existem, mas quase vazios</h3><BarrasH sufixo="%" itens={p.preenchimento.filter((c) => c.grupo === 'vazio').map((c) => ({ nome: c.rotulo, valor: c.pct }))} /></div>
          <div className="grid content-start gap-2">
            <h3 className="text-sm font-semibold">Não existem e precisam ser criados</h3>
            <ul className="grid list-disc gap-1 pl-5 text-sm text-[var(--text-secondary)]">
              <li>Data de kit entregue e de material C.A. entregue (marcos 7 e 8)</li>
              <li>Próxima ação e prazo da próxima ação no Groner</li>
              <li>Vistoria aprovada na 1ª tentativa (sim/não)</li>
              <li>Custos previsto e realizado da obra (Omie, pelo código do card)</li>
              <li>Geração real mensal (SolarZ, pela UC)</li>
            </ul>
            <p className="text-xs text-[var(--text-muted)]">As datas dos demais marcos agora vêm do histórico de status gravado pela sincronização.</p>
          </div>
        </div>
      </Secao>

      <Secao titulo="O que mudar para fechar os indicadores">
        <ol className="grid max-w-[80ch] list-decimal gap-3 pl-6 text-sm marker:font-mono marker:text-[var(--accent-text)]">
          {RECOMENDACOES.map((r) => <li key={r.titulo}><b className="font-semibold">{r.titulo}</b> {r.texto(p)}</li>)}
        </ol>
      </Secao>

      <Secao titulo="Cards ativos, do mais parado ao mais recente">
        <ListaCards cards={dados.cards} hoje={dados.hoje} />
      </Secao>
    </div>
  )
}
