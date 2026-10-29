import { useMemo } from 'react'
import { DataTable } from '../../components/DataTable'
import { ErrorBoundary } from '../../components/ErrorBoundary'
import { currency, number } from '../../lib/palette'
import { hojeSP } from '../painel/periodo'
import { BarrasHorizontais } from '../painel/ui/graficos'
import { alertasDaArea, calcularComercial, pctTxt, reais } from './calculos'
import { DetalheVendas } from './detalhe/DetalheVendas'
import { textoEscopo } from './escopo'
import { useFiltros, useFontesGroner, useSincronizacao } from './fontes'
import { BarrasMensais } from './graficos'
import { tabelaVendas } from './indicadores'
import { AlertasArea, BarraFiltros, CabecalhoArea, CartaoGrafico, EstadoFonte, RodapeArea, SecaoDetalhe, TabelaIndicadores } from './ui'

/**
 * Aba Vendas (fonte: Groner CRM): o aprofundamento comercial (conversão,
 * ticket, ranking por vendedor). O resumo de vendas e propostas fica na Visão Geral.
 */
export function AbaVendas() {
  const { filtros, mudar } = useFiltros()
  const g = useFontesGroner()
  const sinc = useSincronizacao()
  const hoje = hojeSP()
  const calc = useMemo(() => calcularComercial(g.fontes, filtros, hoje), [g.fontes, filtros, hoje])
  const tabela = useMemo(() => tabelaVendas(g.fontes, filtros, hoje), [g.fontes, filtros, hoje])
  const alertas = useMemo(() => alertasDaArea('vendas', g.fontes, hoje), [g.fontes, hoje])
  const porVendedor = calc.vendedores.filter((v) => v.vendido > 0).map((v) => ({ nome: v.vendedor, valor: Math.round(v.vendido) }))
  const fontes = [sinc('vendas', 'Vendas'), sinc('propostas', 'Propostas'), sinc('projetos', 'Projetos')]
  const principal = g.vendas.data && g.propostas.data
  const erro = g.vendas.error ?? g.propostas.error

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <CabecalhoArea
        area="vendas"
        fontes={fontes}
        carregando={!principal && !erro}
        escopo={`${textoEscopo(filtros, calc.iv, hoje)} O resumo de vendas e propostas está na Visão Geral; aqui fica o aprofundamento.`}
        filtros={<BarraFiltros filtros={filtros} onMudar={mudar} anos={g.opcoes.anos} vendedores={g.opcoes.vendedores} />}
      />
      <AlertasArea area="vendas" itens={alertas} alvoDetalhe="detalhe-vendas" />
      {!principal ? (
        <EstadoFonte carregando={!erro} erro={erro} vazio="Nenhuma venda sincronizada do Groner CRM." />
      ) : (
        <>
          <TabelaIndicadores titulo="Indicadores de Vendas" tabela={tabela} />
          <DataTable
            title={`Ranking de vendedores no período (${calc.vendedores.length})`}
            rows={calc.vendedores}
            maxHeight={360}
            columns={[
              { key: 'vendedor', label: 'Vendedor', render: (r) => r.vendedor },
              { key: 'vendido', label: 'Valor vendido (R$)', align: 'right', render: (r) => currency.format(r.vendido) },
              { key: 'vendas', label: 'Vendas (qtd.)', align: 'right', render: (r) => number.format(r.vendas) },
              { key: 'ticket', label: 'Ticket médio (R$)', align: 'right', render: (r) => (r.ticket != null ? currency.format(r.ticket) : '—') },
              { key: 'propostas', label: 'Propostas (qtd.)', align: 'right', render: (r) => number.format(r.propostas) },
              { key: 'aceitas', label: 'Aceitas (qtd.)', align: 'right', render: (r) => number.format(r.aceitas) },
              { key: 'taxa', label: 'Taxa de aceite (%)', align: 'right', render: (r) => (r.taxa != null ? pctTxt(r.taxa) : '—') },
            ]}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <CartaoGrafico titulo="Valor vendido por vendedor (R$)" subtitulo="No período escolhido.">
              {porVendedor.length ? <BarrasHorizontais dados={porVendedor} formatar={reais} rotuloValor="Vendido" larguraNome={190} /> : <p className="py-10 text-center text-sm text-[var(--text-muted)]">Nenhuma venda no período.</p>}
            </CartaoGrafico>
            <CartaoGrafico titulo="Ticket médio por mês (R$) · 12 meses" subtitulo="Valor vendido ÷ nº de vendas de cada mês; mês sem venda mostra 0.">
              <BarrasMensais dados={calc.serieTicket} formatar={reais} rotuloQtd={['venda', 'vendas']} />
            </CartaoGrafico>
          </div>
          <SecaoDetalhe id="detalhe-vendas" titulo="Detalhe das vendas do período">
            <ErrorBoundary variante="cartao">
              <DetalheVendas vendas={calc.atual.vendas} />
            </ErrorBoundary>
          </SecaoDetalhe>
        </>
      )}
      <RodapeArea area="vendas" fontes={fontes} />
    </div>
  )
}
