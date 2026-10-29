import { useMemo } from 'react'
import { api } from '../../api/client'
import { useRawData } from '../../api/useRawData'
import { hojeSP } from '../painel/periodo'
import { alertasDaArea, calcularUsinas, dataHoraBr, inteiro, type Fontes } from './calculos'
import { DetalheUsinas } from './detalhe/DetalheUsinas'
import { GeracaoMensal } from './graficos'
import { tabelaUsinas } from './indicadores'
import { AlertasArea, CabecalhoArea, CartaoGrafico, EstadoFonte, RodapeArea, SecaoDetalhe, TabelaIndicadores } from './ui'

/** Aba Usinas (fonte: SolarZ): parque, geração do mês, desempenho, farol e tickets. */
export function AbaUsinas() {
  const usinas = useRawData('usinas', api.getUsinasRaw)
  const hoje = hojeSP()
  const fontesCalc: Fontes = useMemo(() => ({ vendas: null, propostas: null, projetos: null, tarefas: null, usinas: usinas.data, pietaResumo: null, pietaMetricas: null }), [usinas.data])
  const calc = useMemo(() => calcularUsinas(fontesCalc, hoje), [fontesCalc, hoje])
  const tabela = useMemo(() => tabelaUsinas(fontesCalc, hoje), [fontesCalc, hoje])
  const alertas = useMemo(() => alertasDaArea('usinas', fontesCalc, hoje), [fontesCalc, hoje])
  const origem = usinas.data?.origemDados
  const fontes = [
    { fonte: 'SolarZ (usinas premium)', quando: dataHoraBr(origem?.solarzAtualizadoEm), extra: origem ? `${inteiro(origem.usinasSolarz)} usinas` : undefined },
    ...(origem?.usinasRelatorio ? [{ fonte: 'Relatório importado (não premium)', quando: dataHoraBr(origem.relatorioExtraidoEm), extra: `${inteiro(origem.usinasRelatorio)} usinas` }] : []),
  ]

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <CabecalhoArea area="usinas" fontes={fontes.slice(0, 1)} carregando={usinas.loading} escopo="Posição de hoje; a geração é do último mês fechado. Período e vendedor não se aplicam." />
      <AlertasArea area="usinas" itens={alertas} alvoDetalhe="detalhe-usinas" />
      {!usinas.data || !tabela || !calc ? (
        <EstadoFonte carregando={usinas.loading} erro={usinas.error} vazio="Nenhuma usina cadastrada." />
      ) : (
        <>
          <TabelaIndicadores titulo="Indicadores de Usinas" tabela={tabela} />
          {calc.serie.length > 0 && (
            <CartaoGrafico titulo={`Geração real × prognóstico por mês (MWh) · ${calc.serie[0].chave.slice(0, 4)}`} subtitulo="Só usinas premium e meses fechados (o mês em curso não entra).">
              <GeracaoMensal dados={calc.serie} />
            </CartaoGrafico>
          )}
          <SecaoDetalhe id="detalhe-usinas" titulo="Detalhe das usinas">
            <DetalheUsinas resposta={usinas.data} />
          </SecaoDetalhe>
        </>
      )}
      <RodapeArea area="usinas" fontes={fontes} />
    </div>
  )
}
