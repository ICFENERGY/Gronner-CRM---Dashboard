import { useMemo } from 'react'
import { DataTable } from '../../components/DataTable'
import { currency } from '../../lib/palette'
import { hojeSP } from '../painel/periodo'
import { alertasDaArea, calcularFinanceiro, reais } from './calculos'
import { textoEscopo } from './escopo'
import { useFiltros, useFontesGroner, useSincronizacao } from './fontes'
import { BarrasMensais } from './graficos'
import { tabelaFinanceiro } from './indicadores'
import { AlertasArea, BarraFiltros, CabecalhoArea, CartaoGrafico, EstadoFonte, RodapeArea, SecaoDetalhe, TabelaIndicadores } from './ui'

const diaBr = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—')

/** Aba Financeiro (fonte: Groner): propostas aceitas, resultado das vendas e o funil financeiro. */
export function AbaFinanceiro() {
  const { filtros, mudar } = useFiltros()
  const g = useFontesGroner()
  const sinc = useSincronizacao()
  const hoje = hojeSP()
  const calc = useMemo(() => calcularFinanceiro(g.fontes, filtros, hoje), [g.fontes, filtros, hoje])
  const tabela = useMemo(() => tabelaFinanceiro(g.fontes, filtros, hoje), [g.fontes, filtros, hoje])
  const alertas = useMemo(() => alertasDaArea('financeiro', g.fontes, hoje), [g.fontes, hoje])
  const fontes = [sinc('vendas', 'Vendas'), sinc('propostas', 'Propostas'), sinc('projetos', 'Projetos')]
  const principal = g.propostas.data && g.projetos.data && g.vendas.data
  const erro = g.propostas.error ?? g.projetos.error ?? g.vendas.error
  const semVenda = [...calc.aceitas.listaSemVenda].sort((a, b) => (Number(b.preco) || 0) - (Number(a.preco) || 0))

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <CabecalhoArea
        area="financeiro"
        fontes={fontes}
        carregando={!principal && !erro}
        escopo={`${textoEscopo(filtros, calc.iv, hoje)} O funil financeiro e a carteira são a posição de hoje.`}
        filtros={<BarraFiltros filtros={filtros} onMudar={mudar} anos={g.opcoes.anos} vendedores={g.opcoes.vendedores} />}
      />
      <AlertasArea area="financeiro" itens={alertas} alvoDetalhe="detalhe-financeiro" />
      {!principal ? (
        <EstadoFonte carregando={!erro} erro={erro} vazio="Sem dados do Groner." />
      ) : (
        <>
          <TabelaIndicadores titulo="Indicadores do Financeiro" tabela={tabela} />
          <CartaoGrafico titulo="Valor em propostas aceitas por mês (R$) · 12 meses" subtitulo="Pelo mês de criação da proposta; uma por projeto em cada mês. O período escolhido em verde.">
            <BarrasMensais dados={calc.serie} formatar={reais} rotuloQtd={['projeto', 'projetos']} />
          </CartaoGrafico>
          <SecaoDetalhe id="detalhe-financeiro" titulo="Propostas aceitas no período ainda sem venda">
            <DataTable
              title={`${semVenda.length} ${semVenda.length === 1 ? 'proposta' : 'propostas'} · maior valor primeiro`}
              rows={semVenda}
              maxHeight={360}
              columns={[
                { key: 'data', label: 'Criada em', render: (r) => diaBr(r.dataInclusao) },
                { key: 'projeto', label: 'Projeto', render: (r) => r.projeto ?? r.titulo ?? `#${r.projetoId}` },
                { key: 'etapa', label: 'Etapa do projeto', render: (r) => r.etapaProjeto ?? '—' },
                { key: 'vendedor', label: 'Vendedor', render: (r) => r.vendedorNome ?? '—' },
                { key: 'preco', label: 'Valor (R$)', align: 'right', render: (r) => currency.format(Number(r.preco) || 0) },
              ]}
            />
          </SecaoDetalhe>
        </>
      )}
      <RodapeArea area="financeiro" fontes={fontes} />
    </div>
  )
}
