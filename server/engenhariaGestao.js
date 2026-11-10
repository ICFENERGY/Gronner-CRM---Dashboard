/**
 * Gestão diária da Engenharia: estuda cada card dos funis de engenharia (08 a 14 e 18), aponta o problema
 * e sugere o plano de ação. O plano combinado pela equipe fica salvo no Neon até o card sair da etapa
 * (ou até alguém marcar como feito).
 *
 * Regras (natureza, responsável, dependência e próximo passo de cada etapa) vêm do Painel de Gestão da
 * Engenharia (Manual de Regras e Operação, seção 4). O prazo (SLA) de cada etapa é o do Groner
 * (server/data/sla-etapas.json); na falta dele vale o prazo do manual.
 *
 * Natureza da etapa:
 *   acao    — Ação ICF: o SLA vale; passou do prazo é atraso da Engenharia
 *   espera  — espera externa (cliente, distribuidor, concessionária): passou do prazo é "cobrar"
 *   repouso — sem SLA; deveria sair do estoque
 */
import { chaveEtapa, ENG_ETAPAS, numeroFunil } from './indicadores.js'

export const NOMES_FUNIL = {
  '08': 'Engenharia',
  '09': 'Compras',
  '10': 'Homologação',
  '11': 'Instalação',
  '13': 'Suporte Cliente',
  '14': 'Manutenção (Pós Venda)',
  '18': 'Parceria Técnica',
}

const semAcento = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '')

// [funil, etapa, natureza, prazo do manual, extras]
const REGRAS_BRUTAS = [
  ['08', 'Criar Projeto->Proposta', 'acao', 3, { papel: 'Projetista', plano: 'Distribuir por projetista (mais antigos primeiro), criar o projeto e a proposta.', dep: 'Conta de luz, foto do telhado e do padrão de entrada' }],
  ['08', 'Criar Abordagem', 'acao', 3, { papel: 'Projetista', plano: 'Status fora do fluxo: mover para Criar Projeto ou devolver ao Comercial.', dep: 'Nenhuma' }],
  ['08', 'Pendencias Tecnicas->Projetos', 'acao', 2, { pend: true, papel: 'Projetista', plano: 'Resolver a pendência técnica e devolver para aprovação.', dep: 'Informação do cliente ou do vendedor' }],
  ['08', 'Aprovar Proposta Criada', 'acao', 1, { papel: 'Coordenação', plano: 'Decidir hoje: aprovar ou devolver com o motivo.', dep: 'Nenhuma' }],
  ['08', 'Proposta Criada Aprovada', 'acao', 5, { papel: 'Vendedor', plano: 'Comercial apresenta e fecha; passou do prazo, revalidar preço e kit.', dep: 'Decisão do cliente' }],
  ['08', 'Aprovacao Tecnica - Venda', 'repouso', 0, { plano: 'Limpar estoque: mover para a etapa certa ou arquivar.' }],
  ['09', 'Pedido a Pagar', 'acao', 2, { papel: 'Financeiro', plano: 'Confirmar o pagamento do pedido e liberar a compra.', dep: 'Financeiro' }],
  ['09', 'Comp. Enviado ao Distribuidor', 'espera', 3, { terceiro: 'Distribuidor', papel: 'Compras', plano: 'Cobrar a confirmação e a data de entrega do kit.', dep: 'Distribuidor' }],
  ['09', 'Pedido Faturado', 'espera', 3, { terceiro: 'Distribuidor', papel: 'Compras', plano: 'Cobrar a nota fiscal e a data de despacho.', dep: 'Distribuidor' }],
  ['09', 'Pedido em Rota de Entrega', 'espera', 5, { terceiro: 'Transportadora', papel: 'Compras', plano: 'Cobrar a previsão de entrega e confirmar o recebimento.', dep: 'Transportadora' }],
  ['09', 'Pedido Entregue', 'repouso', 0, { plano: 'Mover para o funil de instalação ou arquivar.' }],
  ['10', 'Pieta - Criacao do Projeto', 'acao', 4, { ord: 2, papel: 'Homologador', plano: 'Montar o projeto e protocolar na concessionária.', dep: 'Documentos do cliente, ART' }],
  ['10', 'Pendencia ICF', 'acao', 5, { ord: 3, pend: true, papel: 'Homologador', plano: 'Resolver a pendência interna e reprotocolar.', dep: 'Engenharia' }],
  ['10', 'Pieta - Parecer Solicitado', 'espera', 15, { ord: 3, terceiro: 'Concessionária', papel: 'Homologador', plano: 'Cobrar o parecer de acesso na concessionária.', dep: 'Concessionária' }],
  ['10', 'Parecer Emitido', 'acao', 2, { ord: 4, lib: true, papel: 'Homologação / Instalação', plano: 'Agendar instalador e kit: a obra está liberada.', dep: 'Kit e material C.A.' }],
  ['10', 'Aguardando Vistoria', 'espera', 5, { ord: 9, terceiro: 'Concessionária', papel: 'Homologador', plano: 'Cobrar a data da vistoria e a troca do relógio.', dep: 'Concessionária' }],
  ['10', 'Pendencia Vist. Concessionaria', 'acao', 5, { ord: 9, pend: true, papel: 'Homologador', plano: 'Corrigir o apontamento da vistoria e pedir nova visita.', dep: 'Técnico, concessionária' }],
  ['10', 'Vistoria Aprovada', 'acao', 3, { ord: 9, papel: 'Homologador', plano: 'Pedir a troca do relógio e a compensação.', dep: 'Concessionária' }],
  ['10', 'Fazer Compensacao', 'acao', 3, { ord: 9, papel: 'Homologador', plano: 'Solicitar a compensação de créditos na concessionária.', dep: 'Concessionária' }],
  ['10', 'Relogio Trocado', 'repouso', 0, { ord: 10, plano: 'Mover em lote para a gestão da usina (monitoramento, termo, dossiê).' }],
  ['11', 'Pendencia de Instalacao', 'acao', 5, { ord: 7, pend: true, papel: 'Técnico', plano: 'Destravar com o dono nominal e dar prazo.', dep: 'Material, instalador, cliente' }],
  ['11', 'Agendar Instalacao', 'acao', 5, { ord: 5, papel: 'Implantação', plano: 'Agendar a instalação com cliente e instalador.', dep: 'Parecer, kit e material C.A.' }],
  ['11', 'Instalador Homologado', 'acao', 5, { ord: 5, papel: 'Implantação', plano: 'Agendar a instalação com cliente e instalador.', dep: 'Parecer, kit e material C.A.' }],
  ['11', 'Instalacao Agendada', 'espera', 5, { ord: 6, terceiro: 'Data agendada', papel: 'Técnico', plano: 'Confirmar a data e a equipe; executar.', dep: 'Clima, equipe, cliente' }],
  ['11', 'Diario de Obra / Obra Andamento', 'acao', 5, { ord: 7, papel: 'Técnico', plano: 'Concluir a obra e registrar o diário.', dep: 'Material, equipe' }],
  ['11', 'Pendencia de Obra', 'acao', 5, { ord: 7, pend: true, papel: 'Técnico', plano: 'Destravar com o dono nominal e dar prazo.', dep: 'Material, instalador, cliente' }],
  ['11', 'Instalacao Concluida', 'acao', 2, { ord: 8, papel: 'Técnico', plano: 'Pedir a vistoria e mover o card.', dep: 'Nenhuma' }],
  ['11', 'Instalacao App Monitoramento', 'acao', 3, { ord: 11, papel: 'Pós-obra', plano: 'Cadastrar a usina no SolarZ e instalar o app do cliente.', dep: 'Inversor conectado' }],
  ['11', 'App Monitor Instalado', 'repouso', 0, { ord: 11, plano: 'Seguir para o termo de aceite ou arquivar.' }],
  ['11', 'Termo de Aceite', 'espera', 7, { ord: 12, terceiro: 'Cliente', papel: 'Pós-obra', plano: 'Cobrar a assinatura do termo de aceite.', dep: 'Cliente' }],
  ['11', 'Dossie', 'acao', 3, { ord: 14, papel: 'Pós-obra', plano: 'Montar e enviar o dossiê e encerrar.', dep: 'Nenhuma' }],
  ['11', 'Dossie Enviado', 'repouso', 0, { plano: 'Arquivar.' }],
  ['13', 'Area Projetos/Engenharia', 'acao', 2, { papel: 'Projetos', plano: 'Engenharia responde ao chamado.', dep: 'Nenhuma' }],
  ['13', 'Em Andamento', 'acao', 5, { papel: 'Suporte', plano: 'Concluir o atendimento.', dep: 'Cliente' }],
  ['13', 'Suporte Cliente', 'acao', 1, { papel: 'Suporte', plano: 'Triar por criticidade e responder.', dep: 'Cliente' }],
  ['13', 'Suporte Concluido', 'repouso', 0, { plano: 'Arquivar.' }],
  ['14', 'Relato da Pendencia', 'acao', 2, { papel: 'Suporte', plano: 'Registrar a causa e definir a correção.', dep: 'Cliente' }],
  ['14', 'Orcamento Manutencao', 'acao', 3, { papel: 'Suporte', plano: 'Fechar o orçamento e enviar ao cliente.', dep: 'Cliente' }],
  ['14', 'Aguardo Aprovacao Cliente', 'espera', 5, { terceiro: 'Cliente', papel: 'Suporte', plano: 'Cobrar a aprovação do orçamento.', dep: 'Cliente' }],
  ['14', 'Pos Venda Manutencao', 'acao', 2, { papel: 'Suporte', plano: 'Triar e agendar a manutenção.', dep: 'Cliente' }],
  ['14', 'Manutencao Concluida', 'repouso', 0, { plano: 'Arquivar.' }],
  ['14', 'Servico Descartado', 'repouso', 0, { plano: 'Arquivar.' }],
  ['18', 'Novo Instalador', 'acao', 2, { papel: 'Parcerias', plano: 'Fazer o primeiro contato e abrir a consulta na base de prestadores.', dep: 'Instalador' }],
  ['18', 'Consulta Base Dados_ Prestador', 'acao', 2, { papel: 'Parcerias', plano: 'Consultar o prestador na base e decidir se segue para entrevista.', dep: 'Nenhuma' }],
  ['18', 'Entrevista', 'espera', 5, { terceiro: 'Instalador', papel: 'Parcerias', plano: 'Agendar ou cobrar a entrevista com o instalador.', dep: 'Instalador' }],
  ['18', 'Documentos Necessarios', 'espera', 7, { terceiro: 'Instalador', papel: 'Parcerias', plano: 'Cobrar os documentos que faltam do instalador.', dep: 'Instalador' }],
  ['18', 'Assinar Contrato (Instalador)', 'espera', 5, { terceiro: 'Instalador', papel: 'Parcerias', plano: 'Cobrar a assinatura do contrato de parceria.', dep: 'Instalador' }],
  ['18', 'Aprovado', 'repouso', 0, { plano: 'Parceiro aprovado: mover para a base de instaladores ou arquivar.' }],
  ['18', 'Reprovado', 'repouso', 0, { plano: 'Arquivar.' }],
]

const REGRAS = new Map(REGRAS_BRUTAS.map(([funil, etapa, nat, sla, extra]) => [`${funil}|${semAcento(etapa)}`, { funil, etapa, nat, sla, ...extra }]))

const REGRA_PADRAO = {
  nat: 'acao', sla: 5, papel: 'Líder da etapa', dep: 'A definir',
  plano: 'Etapa sem regra no manual: classificar a natureza e o SLA e definir o próximo passo.',
}

export function regraDaEtapa(funil, etapa) {
  return REGRAS.get(`${funil}|${semAcento(etapa)}`) ?? null
}

const arredonda = (n) => Math.round(n * 10) / 10

/**
 * Diagnóstico de um card (linha de /cards) em um funil de engenharia, ou null se o funil não é de engenharia.
 * @param prazos tabela de prazo por etapa (sla-etapas.json); prevalece sobre o prazo do manual
 */
export function diagnosticarCard(card, { prazos = {} } = {}) {
  const funil = numeroFunil(card.funil)
  if (!funil || !ENG_ETAPAS[funil]) return null
  const regra = regraDaEtapa(funil, card.etapa)
  const base = regra ?? REGRA_PADRAO
  const prazoGroner = prazos[chaveEtapa(card.funil, card.etapa)]
  const prazo = base.nat === 'repouso' ? null : (typeof prazoGroner === 'number' && prazoGroner > 0 ? prazoGroner : base.sla)
  const dias = card.diasFluxo == null ? null : Math.max(0, card.diasFluxo)
  const etapa = card.etapa ?? ''

  let status = 'ok'
  const problemas = []
  if (base.nat === 'repouso') {
    status = 'repouso'
    problemas.push(`Etapa de repouso há ${dias == null ? '?' : Math.floor(dias)} dia(s): o card não tem ação a cumprir e deveria sair do estoque.`)
  } else if (dias == null) {
    problemas.push('Sem data de entrada na etapa no Groner: não dá para medir o prazo.')
  } else if (base.nat === 'acao') {
    const margem = Math.max(1, Math.round(prazo * 0.3))
    if (dias > prazo) {
      status = 'late'
      problemas.push(`${arredonda(dias)} dias na etapa "${etapa}", prazo ${prazo}: passou ${arredonda(dias - prazo)} dia(s) do SLA.`)
    } else if (dias >= prazo - margem) {
      status = 'risk'
      problemas.push(`${arredonda(dias)} de ${prazo} dias na etapa "${etapa}": nos últimos 30% do prazo.`)
    }
  } else if (dias > prazo) {
    status = 'cobrar'
    problemas.push(`Espera de ${base.terceiro ?? 'terceiro'} há ${arredonda(dias)} dias, prazo de cobrança ${prazo}: cobrança vencida.`)
  }
  if (base.pend && status !== 'ok') problemas.push('É uma pendência: trava a obra ou a homologação enquanto não for resolvida.')
  if (base.lib && dias != null && dias > 2) problemas.push('Parecer emitido e obra liberada sem agenda há mais de 2 dias.')
  if (dias != null && dias > 30 && base.nat !== 'repouso') problemas.push('Mais de 30 dias na mesma etapa: decidir avançar, devolver ou cancelar na sexta.')
  if (!regra) problemas.push('Etapa sem regra cadastrada: prazo e responsável são provisórios.')

  const escalar = dias != null && dias > 30 && base.nat !== 'repouso'
  const plano = escalar ? `${base.plano} Como passou de 30 dias, levar à sexta para decidir: avançar, devolver ou cancelar.` : base.plano

  // Ordem da pauta: pendência travando obra, liberada sem agenda, SLA estourado, maior valor.
  const peso = { late: 0, cobrar: 2, risk: 3, repouso: 5, ok: 9 }[status]
  const prioridade = [peso - (base.pend && status !== 'ok' ? 0.5 : 0) - (base.lib && dias > 2 ? 0.4 : 0), -(dias == null || prazo == null ? 0 : dias - prazo), -(card.valor || 0)]

  return {
    codigo: card.codigo,
    funil,
    funilNome: NOMES_FUNIL[funil],
    etapa,
    nome: card.nome ?? null,
    cidade: card.cidade ?? null,
    uf: card.uf ?? null,
    valor: card.valor ?? 0,
    ano: card.ano ?? null,
    mes: card.mes ?? null,
    dias: dias == null ? null : arredonda(dias),
    prazo,
    natureza: base.nat,
    status,
    problema: problemas.length ? problemas.join(' ') : 'Dentro do prazo.',
    planoSugerido: plano,
    papel: base.papel ?? null,
    terceiro: base.terceiro ?? null,
    dependeDe: base.dep ?? null,
    prioridade,
  }
}

export function comparaPrioridade(a, b) {
  for (let i = 0; i < a.prioridade.length; i++) if (a.prioridade[i] !== b.prioridade[i]) return a.prioridade[i] - b.prioridade[i]
  return 0
}

export function montarGestao(cards, { prazos = {} } = {}) {
  return cards.map((c) => diagnosticarCard(c, { prazos })).filter(Boolean).sort(comparaPrioridade)
}

export function resumoGestao(itens) {
  const conta = (f) => itens.filter(f).length
  return {
    total: conta((x) => x.status !== 'repouso'),
    atrasados: conta((x) => x.status === 'late'),
    emRisco: conta((x) => x.status === 'risk'),
    cobrar: conta((x) => x.status === 'cobrar'),
    repouso: conta((x) => x.status === 'repouso'),
    valorAtrasado: Math.round(itens.filter((x) => x.status === 'late').reduce((s, x) => s + (x.valor || 0), 0)),
  }
}

// ─── Ações combinadas (guardadas até o card sair da etapa) ───────────────────

export const ENTIDADE_ACOES = 'engenharia'
export const chaveAcao = (codigo, funil) => `acao:${codigo}:${funil}`
const ID_CARD = /^\d{1,9}$/
const ID_FUNIL = /^\d{2}$/

export function validarAcao({ codigo, funil }, corpo, card) {
  const erro = (m) => Object.assign(new Error(m), { status: 400 })
  if (!ID_CARD.test(String(codigo)) || !ID_FUNIL.test(String(funil)) || !ENG_ETAPAS[funil]) throw erro('Card ou funil inválido')
  if (!card) throw erro('Card não encontrado nos funis de engenharia')
  const limpa = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
  const acao = limpa(corpo?.acao, 300)
  const responsavel = limpa(corpo?.responsavel, 80)
  const prazo = String(corpo?.prazo ?? '')
  if (acao.length < 3) throw erro('Descreva a ação (o que será feito)')
  if (!responsavel) throw erro('Informe o responsável')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(prazo) || Number.isNaN(Date.parse(`${prazo}T12:00:00`))) throw erro('Prazo inválido')
  return { acao, responsavel, prazo }
}

/**
 * Junta as ações salvas ao diagnóstico. Ação de card que mudou de etapa (ou saiu dos funis de
 * engenharia) é dada como resolvida; devolve também as ações que precisam ser gravadas como resolvidas.
 */
export function juntarAcoes(itens, linhas, { agora = new Date() } = {}) {
  const porChave = new Map(itens.map((i) => [chaveAcao(i.codigo, i.funil), i]))
  const resolver = []
  const abertas = {}
  for (const { chave, dados } of linhas) {
    if (!dados || dados.concluida) continue
    const item = porChave.get(chave)
    if (!item || semAcento(item.etapa) !== semAcento(dados.etapa)) {
      resolver.push({ chave, dados: { ...dados, concluida: true, concluidaEm: agora.toISOString(), motivo: 'card mudou de etapa' } })
      continue
    }
    abertas[chave] = dados
  }
  return { abertas, resolver }
}
