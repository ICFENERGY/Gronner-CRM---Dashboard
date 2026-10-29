import { useMemo } from 'react'
import { DataTable } from '../../components/DataTable'
import { currency, number } from '../../lib/palette'
import { hojeSP } from '../painel/periodo'
import { BarrasHorizontais } from '../painel/ui/graficos'
import { alertasDaArea, calcularGeral, inteiro, reais } from './calculos'
import { textoEscopo } from './escopo'
import { useFiltros, useFontesGroner, useSincronizacao } from './fontes'
import { BarrasMensais } from './graficos'
import { tabelaGeral } from './indicadores'
import { AlertasArea, BarraFiltros, CabecalhoArea, CartaoGrafico, EstadoFonte, RodapeArea, SecaoDetalhe, TabelaIndicadores } from './ui'

const vazio = <p className="py-10 text-center text-sm text-[var(--text-muted)]">Sem dados no recorte escolhido.</p>

/**
 * Visão Geral (tela inicial): tudo o que o Groner CRM tem hoje no banco
 * (projetos e funil, propostas, vendas e tarefas). SolarZ e Pieta ficam nas abas delas.
 */
export function AbaGeral() {
  const { filtros, mudar } = useFiltros()
  const g = useFontesGroner()
  const sinc = useSincronizacao()
  const hoje = hojeSP()
  const calc = useMemo(() => calcularGeral(g.fontes, filtros, hoje), [g.fontes, filtros, hoje])
  const tabela = useMemo(() => tabelaGeral(g.fontes, filtros, hoje), [g.fontes, filtros, hoje])
  const alertas = useMemo(() => alertasDaArea('geral', g.fontes, hoje), [g.fontes, hoje])
  const fontes = [sinc('projetos', 'Projetos'), sinc('propostas', 'Propostas'), sinc('vendas', 'Vendas'), sinc('tarefas', 'Tarefas')]
  const principal = g.projetos.data && g.vendas.data && g.propostas.data
  const erro = g.projetos.error ?? g.vendas.error ?? g.propostas.error
  const funil = calc.funis.map((x) => ({ nome: x.funil, valor: x.qtd }))
  const etapas = calc.funis.flatMap((x) => x.etapas.map((e) => ({ chave: `${x.n}-${e.etapa}`, funil: x.funil, ...e })))

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <CabecalhoArea
        area="geral"
        fontes={fontes}
        carregando={!principal && !erro}
        escopo={`${textoEscopo(filtros, calc.iv, hoje)} Projetos ativos, funil, carteira e tarefas são a posição de hoje. SolarZ e Pieta ficam nas abas delas.`}
        filtros={<BarraFiltros filtros={filtros} onMudar={mudar} anos={g.opcoes.anos} vendedores={g.opcoes.vendedores} />}
      />
      <AlertasArea area="geral" itens={alertas} alvoDetalhe="detalhe-geral" />
      {!principal ? (
        <EstadoFonte carregando={!erro} erro={erro} vazio="Sem dados do Groner CRM no banco." />
      ) : (
        <>
          <TabelaIndicadores titulo="Indicadores da Visão Geral" tabela={tabela} />
          <CartaoGrafico titulo="Projetos ativos por funil (qtd.) · posição de hoje" subtitulo="Na ordem do fluxo do Groner. O detalhe por etapa está no fim da página.">
            {funil.length ? <BarrasHorizontais dados={funil} formatar={inteiro} rotuloValor="Projetos" larguraNome={240} /> : vazio}
          </CartaoGrafico>
          <div className="grid gap-4 lg:grid-cols-2">
            <CartaoGrafico titulo="Valor vendido por mês (R$) · 12 meses" subtitulo="O período escolhido em verde; o mês em curso está incompleto.">
              <BarrasMensais dados={calc.vendas.serie} formatar={reais} rotuloQtd={['venda', 'vendas']} />
            </CartaoGrafico>
            <CartaoGrafico titulo="Propostas criadas por mês (qtd.) · 12 meses" subtitulo="O período escolhido em verde; o mês em curso está incompleto.">
              <BarrasMensais dados={calc.seriePropostas} formatar={inteiro} rotuloQtd={['aceita', 'aceitas']} />
            </CartaoGrafico>
            <CartaoGrafico titulo="Projetos novos por origem do lead (qtd.)" subtitulo="Projetos criados no período.">
              {calc.porOrigem.length ? <BarrasHorizontais dados={calc.porOrigem} formatar={inteiro} rotuloValor="Projetos" larguraNome={220} /> : vazio}
            </CartaoGrafico>
            <CartaoGrafico titulo="Projetos ativos por vendedor (qtd.)" subtitulo="Vendedor responsável pelo projeto · posição de hoje.">
              {calc.porVendedor.length ? <BarrasHorizontais dados={calc.porVendedor} formatar={inteiro} rotuloValor="Projetos" larguraNome={200} /> : vazio}
            </CartaoGrafico>
            <CartaoGrafico titulo="Projetos ativos por UF (qtd.)" subtitulo="Posição de hoje.">
              {calc.porUf.length ? <BarrasHorizontais dados={calc.porUf} formatar={inteiro} rotuloValor="Projetos" larguraNome={120} /> : vazio}
            </CartaoGrafico>
            <CartaoGrafico titulo="Tarefas atrasadas por responsável (qtd.)" subtitulo="Posição de hoje; uma tarefa com dois responsáveis conta para os dois.">
              {calc.atrasadasPorResponsavel.length ? <BarrasHorizontais dados={calc.atrasadasPorResponsavel} formatar={inteiro} rotuloValor="Tarefas" larguraNome={200} /> : vazio}
            </CartaoGrafico>
          </div>
          <SecaoDetalhe id="detalhe-geral" titulo="Detalhe: funil completo por etapa e cidades">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <DataTable
                title={`Projetos ativos por funil e etapa (${etapas.length} etapas com projetos)`}
                rows={etapas}
                maxHeight={420}
                columns={[
                  { key: 'funil', label: 'Funil', render: (r) => r.funil },
                  { key: 'etapa', label: 'Etapa', render: (r) => r.etapa },
                  { key: 'qtd', label: 'Projetos (qtd.)', align: 'right', render: (r) => number.format(r.qtd) },
                  { key: 'valor', label: 'Valor (R$)', align: 'right', render: (r) => (r.valor ? currency.format(r.valor) : '—') },
                ]}
              />
              <DataTable
                title="Cidades com mais projetos ativos"
                rows={calc.porCidade}
                maxHeight={420}
                columns={[
                  { key: 'nome', label: 'Cidade/UF', render: (r) => r.nome },
                  { key: 'valor', label: 'Projetos (qtd.)', align: 'right', render: (r) => number.format(r.valor) },
                ]}
              />
            </div>
          </SecaoDetalhe>
        </>
      )}
      <RodapeArea area="geral" fontes={fontes} />
    </div>
  )
}
