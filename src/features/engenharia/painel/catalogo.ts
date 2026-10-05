import { num } from '../formato'
import type { Painel } from '../tipos'

/** calcula: o dado existe e é confiável · proxy: aproximado, com ressalva · sem: falta campo ou histórico. */
export type Situacao = 'calcula' | 'proxy' | 'sem'

export interface Indicador {
  momento: string
  nome: string
  valor: string
  situacao: Situacao
  falta: string
}

export const ROTULO_SITUACAO: Record<Situacao, string> = { calcula: 'Calcula', proxy: 'Proxy', sem: 'Sem dado' }

/**
 * Os 16 indicadores do modelo, com o valor de hoje. Os de prazo dependem do
 * histórico de status, que passou a ser gravado pela sincronização: ficam
 * "sem dado" até haver passagens suficientes pelos marcos.
 */
export function catalogo(p: Painel): Indicador[] {
  return [
    { momento: 'Pré-venda', nome: 'Prazo de entrega da solução', valor: '—', situacao: 'sem', falta: 'Histórico de entrada no marco 1 e saída no 4 (a sincronização passou a gravar; precisa de algumas semanas)' },
    { momento: 'Pré-venda', nome: 'Retrabalho', valor: `${p.retrabalho.pct}% dos ${p.retrabalho.base} cards com proposta têm mais de uma`, situacao: 'proxy', falta: 'Marcar a reentrada na Engenharia. Mais de uma proposta também inclui revisões comerciais.' },
    { momento: 'Pré-venda', nome: 'Fila da Engenharia', valor: `${p.fila.n} cards nos marcos 1 a 3, ${p.fila.pendenciaTecnica} em pendência técnica, o mais antigo com ${p.fila.maisAntigo} dias sem atualização`, situacao: 'calcula', falta: 'Data de entrada, para medir a idade real da fila (vem do histórico)' },
    { momento: 'Pré-venda', nome: 'Esforço por projeto', valor: '—', situacao: 'sem', falta: 'Apontamento de horas por projeto, fora do Groner' },
    { momento: 'Implantação', nome: 'Ciclo da obra', valor: p.obra.idadeMediana != null ? `Mediana de ${num(p.obra.idadeMediana)} dias desde a venda nas ${p.obra.n} obras em andamento` : '—', situacao: 'proxy', falta: 'Data de ativação (troca do relógio) para fechar o ciclo — vem do histórico' },
    { momento: 'Implantação', nome: 'Prazo da homologação', valor: `${p.homologacao} cards em homologação em ${p.concessionarias.length} concessionárias`, situacao: 'sem', falta: 'Datas de protocolo e de parecer (marcos 5 e 6) — vêm do histórico' },
    { momento: 'Implantação', nome: 'Material no prazo', valor: '—', situacao: 'sem', falta: 'Status ou data de material C.A.; data prevista e real do kit' },
    { momento: 'Implantação', nome: 'Instalação no prazo', valor: '—', situacao: 'sem', falta: 'Preencher início e término da instalação (os campos já existem no Groner e estão vazios) e uma data prevista' },
    { momento: 'Gestão da usina', nome: 'Tempo de encerramento', valor: '—', situacao: 'sem', falta: 'Data de ativação e de dossiê enviado — vêm do histórico' },
    { momento: 'Gestão da usina', nome: 'Usinas monitoradas', valor: `${p.monitoramento.pct}% das ${p.monitoramento.base} usinas com relógio trocado; ${p.monitoramento.relogioSemMonitoramento} ainda sem monitoramento`, situacao: 'proxy', falta: 'Preencher URL e modelo do monitoramento (existem, vazios)' },
    { momento: 'Gestão da usina', nome: 'Desempenho da usina', valor: `Geração prevista em ${p.usina.geracaoPrevistaPct}% das usinas (${num(p.usina.geracaoPrevistaMWh, 1)} MWh/mês) e UC em ${p.usina.ucPct}%`, situacao: 'proxy', falta: 'Geração real mensal do SolarZ, ligada pela UC' },
    { momento: 'Gestão da usina', nome: 'Chamados de pós-venda', valor: '—', situacao: 'sem', falta: 'Data de abertura e de solução de cada chamado' },
    { momento: 'Todos', nome: 'Desvio de custo da obra', valor: '—', situacao: 'sem', falta: 'Custo previsto e realizado; trazer do Omie pelo código do card' },
    { momento: 'Todos', nome: 'Vistoria aprovada na 1ª tentativa', valor: '—', situacao: 'sem', falta: 'Campo sim/não na vistoria, ou repetição do status de vistoria no histórico' },
    { momento: 'Acompanhamento', nome: 'Gestão completa', valor: `${p.gestao.completaPct}% dos ${p.ativos} ativos têm dono nominal e prazo futuro (dono ${p.gestao.donoPct}%, prazo futuro ${p.gestao.prazoFuturoPct}%)`, situacao: 'calcula', falta: 'Tornar Técnico/Projetista/Homologador obrigatório e criar o prazo da próxima ação' },
    { momento: 'Acompanhamento', nome: 'Cards parados', valor: `${p.parados.pct}% dos ativos com mais de 15 dias sem atualização (${p.parados.vermelho} cards)`, situacao: 'calcula', falta: 'Data da última evidência; edições em massa zeram o contador' },
  ]
}

export const RECOMENDACOES: { titulo: string; texto: (p: Painel) => string }[] = [
  { titulo: 'Histórico de status: em andamento.', texto: () => 'A sincronização do n8n grava a data de cada mudança de status a cada 5 minutos. Os indicadores de prazo passam a sair sozinhos conforme os cards percorrem os marcos.' },
  { titulo: 'Alinhar a lista de status aos 16 marcos.', texto: () => 'Criar os status que faltam (material C.A. entregue, visita técnica, vistoria aprovada) e um status por marco, com os mesmos nomes. Trazer o “FUNIL ENGENHARIA - CRIAR PROP”, que hoje está no funil de vendas, para a etapa 08.' },
  { titulo: 'Usar os campos que já existem.', texto: () => 'Início e término da instalação, assinatura do contrato, URL e modelo do monitoramento e fim da garantia estão no Groner sem preenchimento. Preenchê-los fecha parte de Instalação no prazo e Usinas monitoradas sem customização.' },
  { titulo: 'Datas para a trilha paralela.', texto: () => 'Como o card tem um status só, kit e material C.A. (suprimentos) precisam de campos de data próprios, porque correm junto com a homologação.' },
  { titulo: 'Dono nominal obrigatório por etapa.', texto: (p) => `Projetista na pré-venda, homologador na homologação e técnico na instalação. Hoje só ${p.gestao.donoPct}% dos ativos têm um nome.` },
  { titulo: 'Prazo da próxima ação no lugar da previsão de fechamento.', texto: (p) => `A previsão é um campo comercial: ${p.gestao.prazoVencido} dos ${p.ativos} ativos estão com ela vencida. A ação combinada na Pauta Diária já cobre isso; o ideal é ter o campo no Groner.` },
  { titulo: 'Limpar a base.', texto: (p) => `Mover as ${p.historicoContrato} vendas antigas paradas em 06. CONTRATO para uma etapa de arquivo e os ${p.monitoramento.relogioSemMonitoramento} cards com relógio trocado para a gestão da usina. Evitar edições em massa, que zeram os dias sem atualização.` },
  { titulo: 'Ligar as fontes de fora.', texto: (p) => `Geração real do SolarZ pela UC (preenchida em ${p.usina.ucPct}% das usinas) e custos da obra do Omie pelo código do card.` },
]
