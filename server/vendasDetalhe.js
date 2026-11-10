/**
 * A listagem de vendas do Groner (GET /Venda) não traz o projeto (card) da venda, nem entrada, financiamento,
 * tipo e status de aprovação; só o detalhe (GET /Venda/{id}) traz. Sem o projeto, o painel não liga a venda
 * à proposta e o "Negócio" (tipo, etapa e status) fica vazio.
 *
 * Aqui o detalhe é buscado só das vendas que ainda não têm o projeto guardado (em ritmo seguro, com limite por
 * execução); das demais reaproveita o que já está no Neon. O resultado volta no formato da listagem, para o
 * mapVenda gravar tudo de uma vez.
 */

/** Campos do registro guardado -> campos que o mapVenda lê. */
export function doGuardado(item, guardado) {
  return {
    ...item,
    projetoId: guardado.idNegocio,
    valorEntrada: guardado.valorEntrada,
    valorFinanciado: guardado.valorFinanciado,
    dataInclusao: guardado.dataCadastro,
    valorTotalPago: guardado.valorPago,
    tipoVendaNome: guardado.tipoVenda ?? item.tipoVendaNome,
    statusTipo: guardado.statusVenda ?? item.statusTipo,
  }
}

/** Detalhe de GET /Venda/{id} -> campos que o mapVenda lê. */
export function doDetalhe(item, d) {
  return {
    ...item,
    projetoId: d.projetoId ?? d.prePropostaAceita?.projetoId ?? null,
    valorEntrada: d.valorEntrada,
    valorFinanciado: d.valorFinanciado,
    dataInclusao: d.dataInclusao,
    valorTotalPago: d.valorTotalPago,
    tipoVendaNome: d.tipoVenda?.nome ?? item.tipoVendaNome,
    statusTipo: d.status?.tipo ?? item.statusTipo,
  }
}

/**
 * @param itens vendas da listagem do Groner
 * @param guardadas vendas já gravadas no Neon (mapVenda)
 * @param buscarDetalhe (id) => detalhe da venda
 * @param opcoes.maximo detalhes por execução; opcoes.pausaMs pausa entre chamadas (Groner: ~20 pedidos por 1,5 s)
 */
export async function enriquecerVendas(itens, guardadas, buscarDetalhe, { maximo = 40, pausaMs = 250, dormir = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const porId = new Map(guardadas.map((v) => [String(v.id), v]))
  let buscados = 0
  let falhas = 0
  const saida = []
  for (const item of itens) {
    const g = porId.get(String(item.id))
    if (g && g.idNegocio != null) { saida.push(doGuardado(item, g)); continue }
    if (buscados >= maximo) { saida.push(g ? doGuardado(item, g) : item); continue }
    if (buscados > 0) await dormir(pausaMs)
    buscados++
    try { saida.push(doDetalhe(item, await buscarDetalhe(item.id))) } catch { falhas++; saida.push(g ? doGuardado(item, g) : item) }
  }
  return { itens: saida, buscados, falhas }
}
