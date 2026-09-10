/**
 * Cada mapper aqui é uma allowlist explícita de campos do Groner.
 * Alguns recursos (PreProposta, sobretudo) embutem objetos gigantes com
 * dados internos e até credenciais (ver sanitize.js) — nunca repassamos o
 * objeto bruto para o frontend, só os campos que a interface realmente usa.
 */

/**
 * Não cruzamos Venda com Projeto/Proposta via API aqui: testamos os dois
 * caminhos possíveis (Venda.id === Projeto.id, e Venda.propostaId ->
 * Proposta) e os dois se mostraram não confiáveis nos dados reais do tenant
 * — em parte por IDs que não coincidem, em parte porque propostas antigas já
 * foram removidas do Groner. Em vez disso, cidade/estado/kit técnico vêm do
 * enriquecimento por planilha (server/enrichment.js), cujo vínculo por
 * Código foi validado 1:1 contra os dados reais antes de integrar.
 */
export function mapVenda(v, enriquecimento) {
  const extra = enriquecimento?.[String(v.id)]
  return {
    id: v.id,
    nome: v.nome,
    vendedor: v.vendedor,
    valorTotal: v.valorTotal,
    valorComissao: v.valorComissao,
    dataVenda: v.dataVenda,
    cicloVenda: v.cicloVenda,
    origemNome: v.origemNome,
    statusNome: v.statusNome,
    statusCor: v.statusCor,
    cidade: extra?.cidade ?? null,
    estado: extra?.estado ?? null,
    bairro: extra?.bairro ?? null,
    fornecedor: extra?.fornecedor ?? null,
    placa: extra?.placa ?? null,
    inversor: extra?.inversor ?? null,
    lucro: extra?.lucro ?? null,
    lucroServico: extra?.lucroServico ?? null,
  }
}

export function mapProjeto(p, enriquecimento) {
  const extra = enriquecimento?.[String(p.id)]
  return {
    id: p.id,
    nome: p.nome,
    tipo: p.tipo,
    tipoLead: p.tipoLead,
    funil: p.etapa,
    etapa: p.status?.nome ?? null,
    corEtapa: p.corEtapa,
    origemLead: p.origemLead?.nome ?? null,
    vendedorResponsavel: p.vendedorResponsavel,
    dataInclusao: p.dataInclusao,
    dataUltimaAtualizacao: p.dataUltimaAtualizacao,
    dataUltimoStatus: p.dataUltimoStatus,
    previsaoFechamento: p.previsaoFechamento,
    valorPrePropostaAceita: p.valorPrePropostaAceita,
    valorVenda: p.valorVenda,
    perda: p.perda,
    consumo: p.consumo,
    qtdPrePropostas: p.qtdPrePropostas,
    latitude: p.latidude ? Number(p.latidude) : null,
    longitude: p.longitude ? Number(p.longitude) : null,
    cidade: extra?.cidade ?? null,
    estado: extra?.estado ?? null,
    bairro: extra?.bairro ?? null,
    concessionaria: extra?.concessionaria ?? null,
  }
}

export function mapProposta(pp) {
  const sim = pp.simulacao ?? {}
  return {
    id: pp.id,
    dataInclusao: pp.dataInclusao,
    dataAlteracao: pp.dataAlteracao,
    titulo: pp.titulo,
    projeto: pp.projeto,
    projetoId: pp.projetoId,
    projetoTipo: pp.projetoTipo,
    origem: pp.origem,
    lead: pp.lead,
    leadEmail: pp.leadEmail,
    statusProjeto: pp.statusProjeto,
    etapaProjeto: pp.etapaProjeto,
    corEtapa: pp.corEtapa,
    aceita: pp.aceita,
    vendedorNome: pp.usuario?.nome?.trim() || null,
    kwP: sim.kwP ?? null,
    preco: sim.preco ?? null,
    precoOriginal: sim.precoOriginal ?? null,
    consumo: sim.consumo ?? null,
    geracaoAnual: sim.geracaoAnual ?? null,
    anoRetornoInvestimento: sim.anoRetornoInvestimento ?? null,
    payBack: sim.payBack ?? null,
  }
}

/** Atrasada = tinha prazo de entrega no passado e ainda não foi concluída. */
function calcularAtrasada(t) {
  if (t.dataConclusao) return false
  if (!t.dataEntrega) return false
  const entrega = new Date(t.dataEntrega).getTime()
  if (Number.isNaN(entrega)) return false
  return entrega < Date.now()
}

export function mapTarefa(t) {
  return {
    id: t.id,
    titulo: t.titulo,
    dataInclusao: t.dataInclusao,
    dataEntrega: t.dataEntrega,
    dataInicial: t.dataInicial,
    dataConclusao: t.dataConclusao,
    status: t.status?.nome ?? null,
    statusCor: t.status?.cor ?? null,
    tipo: t.tipo?.nome ?? null,
    tipoCor: t.tipo?.cor ?? null,
    criadoPorNome: t.criadoPorNome,
    projeto: t.projeto,
    projetoId: t.projetoId,
    lead: t.lead,
    responsaveis: (t.membros ?? []).map((m) => m.nome),
    prioridade: t.prioridade,
    bloqueado: t.bloqueado,
    atrasada: calcularAtrasada(t),
  }
}
