import { useMemo } from 'react'
import { api } from '../../api/client'
import { useRawData } from '../../api/useRawData'
import { hojeSP } from '../painel/periodo'
import { BarrasHorizontais } from '../painel/ui/graficos'
import { alertasDaArea, calcularHomologacao, dataHoraBr, decimal1, inteiro, type Fontes } from './calculos'
import { DetalheHomologacao } from './detalhe/DetalheHomologacao'
import { useChegada } from './fontes'
import { EtapasPieta } from './graficos'
import { tabelaHomologacao } from './indicadores'
import { AlertasArea, CabecalhoArea, CartaoGrafico, EstadoFonte, RodapeArea, SecaoDetalhe, TabelaIndicadores } from './ui'

/** Aba Pieta (fonte: PIETA): projetos, prazos, pendências e tempo por etapa. */
export function AbaHomologacao() {
  const resumo = useRawData('pieta-resumo', api.getPietaResumo)
  const metricas = useRawData('pieta-metricas', api.getPietaMetricas)
  const hoje = hojeSP()
  const fontesCalc: Fontes = useMemo(() => ({ vendas: null, propostas: null, projetos: null, tarefas: null, usinas: null, pietaResumo: resumo.data, pietaMetricas: metricas.data }), [resumo.data, metricas.data])
  const calc = useMemo(() => calcularHomologacao(fontesCalc, hoje), [fontesCalc, hoje])
  const tabela = useMemo(() => tabelaHomologacao(fontesCalc, hoje), [fontesCalc, hoje])
  const alertas = useMemo(() => alertasDaArea('homologacao', fontesCalc, hoje), [fontesCalc, hoje])
  const chegou = useChegada(Boolean(resumo.data))
  const m = metricas.data && !metricas.data.vazio ? metricas.data : null
  const tempos = (m?.tempoPorEtapa ?? []).filter((e) => e.mediaDias != null).map((e) => ({ nome: e.etapa, valor: e.mediaDias as number }))
  const fontes = [
    { fonte: 'PIETA (resumo, consulta ao vivo)', quando: dataHoraBr(chegou), extra: calc ? `${inteiro(calc.projetos.length)} projetos` : undefined },
    ...(m ? [{ fonte: 'PIETA (base detalhada)', quando: dataHoraBr(m.atualizadoEm), extra: calc?.cobertura ? `${inteiro(calc.cobertura.armazenados)} de ${inteiro(calc.cobertura.total)} projetos` : undefined }] : []),
  ]
  const erro = resumo.error ? (resumo.error.includes('PIETA_USER') ? 'integração com a PIETA ainda não ativada (faltam PIETA_USER e PIETA_PASSWORD)' : resumo.error) : null

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <CabecalhoArea area="homologacao" fontes={fontes} carregando={resumo.loading} escopo="Posição de hoje. Período e vendedor não se aplicam." />
      <AlertasArea area="homologacao" itens={alertas} alvoDetalhe="detalhe-homologacao" />
      {!resumo.data || !tabela || !calc ? (
        <EstadoFonte carregando={resumo.loading} erro={erro} vazio="Nenhum projeto no resumo da PIETA." />
      ) : (
        <>
          <TabelaIndicadores titulo="Indicadores da Pieta" tabela={tabela} />
          <div className="grid gap-4 lg:grid-cols-2">
            <CartaoGrafico titulo="Projetos em andamento por etapa (qtd.)" subtitulo="Posição de hoje no resumo da PIETA; a maior fila em cima.">
              <EtapasPieta dados={calc.etapas} />
            </CartaoGrafico>
            {tempos.length > 0 && (
              <CartaoGrafico titulo="Tempo médio por etapa (dias)" subtitulo={`Base detalhada${calc.cobertura ? `: ${inteiro(calc.cobertura.armazenados)} de ${inteiro(calc.cobertura.total)} projetos` : ''}; a etapa atual conta até hoje.`}>
                <BarrasHorizontais dados={tempos} formatar={(v) => decimal1(v)} rotulo={(v) => `${decimal1(v)} d`} rotuloValor="Média (dias)" larguraNome={190} />
              </CartaoGrafico>
            )}
          </div>
          <SecaoDetalhe id="detalhe-homologacao" titulo="Detalhe dos projetos na PIETA">
            <DetalheHomologacao resumo={resumo.data} />
          </SecaoDetalhe>
        </>
      )}
      <RodapeArea area="homologacao" fontes={fontes} />
    </div>
  )
}
