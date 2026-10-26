/**
 * Modelo da Engenharia: os 16 marcos (3 momentos), o prazo proposto de cada
 * um e o "como resolver" usado na Pauta Diária. Fonte: painéis HTML do Fabio
 * ("Pauta Diária da Engenharia" e "Painel da Engenharia ICF Energy").
 *
 * Compartilhado entre o servidor (classificação) e o frontend (textos).
 * Os prazos aqui são a proposta inicial; os valores em vigor ficam salvos
 * no armazenamento da Engenharia e são editados pela tela de prazos.
 */

export const MOMENTOS = {
  pre: 'Pré-venda e venda',
  imp: 'Implantação',
  usi: 'Gestão da usina',
}

/** Ordem do fluxo. `paralelo` = trilha de suprimentos, fora da conta de entrega. */
export const MARCOS = [
  { k: '1', nome: 'Entrada em Criar projeto', mom: 'pre', sla: 2, papel: 'Projetista', acao: 'Pegar o card, criar o projeto e a proposta técnica.', dep: 'Conta de luz, foto do telhado e do padrão de entrada' },
  { k: '2', nome: 'Projeto criado', mom: 'pre', sla: 2, papel: 'Engenharia (EDITH apoia)', acao: 'Conferir dimensionamento, telhado e padrão de entrada e aprovar a proposta.', dep: 'Nenhuma' },
  { k: '3', nome: 'Conferência técnica', mom: 'pre', sla: 3, papel: 'Projetista', acao: 'Resolver a pendência técnica e devolver para aprovação.', dep: 'Informação do cliente ou do vendedor' },
  { k: '4', nome: 'Solução liberada', mom: 'pre', sla: 15, papel: 'Vendedor', acao: 'Apresentar e fechar. Passou do prazo: revalidar preço e kit antes de seguir.', dep: 'Decisão do cliente' },
  { k: 'G6', nome: 'Venda confirmada', mom: 'pre', sla: 5, papel: 'Comercial / Financeiro', acao: 'Contrato assinado e documentos completos; liberar para homologação e compra do kit.', dep: 'Cliente' },
  { k: '5', nome: 'Protocolo concessionária', mom: 'imp', sla: 15, papel: 'Homologador', acao: 'Montar o projeto, protocolar na concessionária e cobrar o parecer.', dep: 'Documentos do cliente, ART, concessionária' },
  { k: '6', nome: 'Parecer de acesso', mom: 'imp', sla: 10, papel: 'Homologador', acao: 'Responder a pendência da concessionária. Com parecer emitido, liberar a instalação.', dep: 'Concessionária' },
  { k: '7', nome: 'Kit entregue', mom: 'imp', sla: 10, papel: 'Suprimentos / Implantação', acao: 'Garantir o material C.A., definir o instalador e agendar.', dep: 'Material C.A. e parecer de acesso', paralelo: true },
  { k: '9', nome: 'Instalador definido', mom: 'imp', sla: 5, papel: 'Implantação', acao: 'Agendar a instalação com cliente e instalador.', dep: 'Parecer, kit e material C.A. no local' },
  { k: '10', nome: 'Instalação agendada', mom: 'imp', sla: 7, papel: 'Técnico / instalador', acao: 'Executar a instalação na data e registrar o diário de obra.', dep: 'Clima, material e equipe' },
  { k: '11', nome: 'Instalação concluída', mom: 'imp', sla: 7, papel: 'Técnico / instalador', acao: 'Resolver a pendência de obra e concluir a instalação.', dep: 'Material, instalador, cliente' },
  { k: '12', nome: 'Vistoria concessionária', mom: 'imp', sla: 7, papel: 'Homologador', acao: 'Pedir e acompanhar a vistoria e a troca do relógio.', dep: 'Concessionária' },
  { k: '13', nome: 'Relógio trocado', mom: 'usi', sla: 3, papel: 'Engenharia / pós-venda', acao: 'Cadastrar a usina no SolarZ e instalar o app do cliente.', dep: 'Inversor conectado à internet' },
  { k: '14', nome: 'Monitoramento SolarZ', mom: 'usi', sla: 5, papel: 'Implantação', acao: 'Emitir e enviar o termo de aceite ao cliente.', dep: 'Nenhuma' },
  { k: '15', nome: 'Termo de aceite', mom: 'usi', sla: 5, papel: 'Implantação', acao: 'Coletar a assinatura do termo e montar o dossiê.', dep: 'Assinatura do cliente' },
  { k: '16', nome: 'Dossiê', mom: 'usi', sla: 5, papel: 'Implantação / administrativo', acao: 'Enviar o dossiê e encerrar. A usina passa para o acompanhamento mensal.', dep: 'Nenhuma' },
]

/** Meta de entrega (dias da venda até a troca do relógio). */
export const META_ENTREGA_PADRAO = 60

/** Semáforo do Painel por dias sem atualização no card. */
export const LIMITES_PARADO = { verde: 7, amarelo: 15 }

/** Momento de cada marco; FIM = dossiê enviado (encerrado). */
export function momentoDoMarco(marco) {
  if (marco === 'FIM') return 'fim'
  return MARCOS.find((m) => m.k === marco)?.mom ?? null
}

/**
 * Regra de negócio (Fabio, ICF Energy): no Funil "11. INSTALAÇÃO", os status abaixo
 * já foram entregues. Não são cards rolando: são FINALIZADOS e contam como encerrados
 * (igual ao marco FIM), ficando fora da Pauta Diária, dos ativos, do semáforo e das
 * métricas de fila/obra. Os mesmos status em outros funis (ex.: 12. PÓS-VENDA)
 * seguem a regra normal dos marcos. Comparação sem acento, sem caixa e sem espaços repetidos.
 */
export const STATUS_FINALIZADOS_INSTALACAO = [
  'INSTALAÇÃO CONCLUÍDA',
  'INSTALAÇÃO APP MONITORAMENTO',
  'APP MONITOR INSTALADO',
  'TERMO DE ACEITE',
]

const normalizarTexto = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase()
const FINALIZADOS_NORMALIZADOS = new Set(STATUS_FINALIZADOS_INSTALACAO.map(normalizarTexto))

/** True se o card (funil + status) está finalizado pela regra do Funil 11. */
export function estaFinalizadoNaInstalacao(funil, status) {
  return /^11\./.test(normalizarTexto(funil)) && FINALIZADOS_NORMALIZADOS.has(normalizarTexto(status))
}
