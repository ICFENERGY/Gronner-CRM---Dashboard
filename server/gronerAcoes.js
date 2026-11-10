/**
 * Grava no Groner, dentro do card, a ação combinada na reunião da Engenharia.
 *
 * No Groner o que carrega responsável, prazo e comentários é a Tarefa ligada ao card:
 *   POST /Tarefa                  { Titulo, TipoId, ProjetoId, DataEntrega, UsuariosIds }   (TipoId é obrigatório)
 *   POST /Tarefa/{id}/Comentario  { Comentario }                                            (testado no card de teste 67736)
 * A tarefa leva o prazo e a pessoa responsável; o comentário registra o que foi combinado.
 * O comentário sai em nome do usuário do token da API.
 *
 * Escrita sem nova tentativa (pode duplicar). Se a criação falhar ou estourar o tempo, confere antes se a
 * tarefa já existe no card (pelo título) e reaproveita; o painel guarda o erro e oferece reenviar.
 */
export const TIPO_TAREFA_ACAO_PADRAO = 44 // "IMPORTANTE"; troque com GRONER_TIPO_TAREFA_ACAO
export const PREFIXO_TITULO = 'Ação combinada · Gestão diária'

const dataBr = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—')

export const tituloDaTarefa = (item) => `${PREFIXO_TITULO} · ${item.etapa}`.slice(0, 120)

/** Texto do comentário no card. tipo: 'novo' | 'atualizado' | 'feito' */
export function textoComentario({ item, acao, responsavel, prazo, tipo = 'novo' }) {
  if (tipo === 'feito') return `✅ Ação marcada como feita na Gestão diária da Engenharia.\nO que foi combinado: ${acao}\nResponsável: @${responsavel}`
  const cabeca = tipo === 'atualizado' ? '📌 Combinado atualizado na reunião (Gestão diária da Engenharia)' : '📌 Combinado na reunião (Gestão diária da Engenharia)'
  return [
    cabeca,
    `Etapa: ${item.funil} · ${item.etapa}`,
    `Problema: ${item.problema}`,
    `O que foi combinado: ${acao}`,
    `Responsável: @${responsavel}`,
    `Prazo para finalizar: ${dataBr(prazo)}`,
  ].join('\n')
}

/**
 * @param deps.criarTarefa (corpo) => tarefa criada ({ id })
 * @param deps.comentar (tarefaId, texto) => void
 * @param deps.tarefasDoCard (projetoId) => lista de tarefas do card (para não duplicar)
 * @returns { tarefaId, gronerEm, gronerErro }
 */
export async function registrarNoGroner({ deps, item, acao, responsavel, responsavelId, prazo, tarefaId = null, tipo = 'novo', agora = new Date() }) {
  const resultado = { tarefaId, gronerEm: null, gronerErro: null }
  try {
    if (!resultado.tarefaId) {
      const titulo = tituloDaTarefa(item)
      const corpo = {
        Titulo: titulo,
        TipoId: Number(process.env.GRONER_TIPO_TAREFA_ACAO) || TIPO_TAREFA_ACAO_PADRAO,
        ProjetoId: item.codigo,
        DataEntrega: `${prazo}T18:00:00`,
        ...(responsavelId ? { UsuariosIds: [responsavelId] } : {}),
      }
      const existente = async () => {
        const lista = await deps.tarefasDoCard(item.codigo).catch(() => [])
        return lista.find((t) => t.titulo === titulo && !t.dataConclusao) ?? null
      }
      let criada = await existente() // tentativa anterior que gravou mas não respondeu
      if (!criada) {
        try { criada = await deps.criarTarefa(corpo) } catch (err) {
          criada = await existente() // gravou e respondeu tarde?
          if (!criada) throw err
        }
      }
      resultado.tarefaId = criada?.id ?? null
      if (!resultado.tarefaId) throw new Error('O Groner não devolveu o código da tarefa')
    }
    await deps.comentar(resultado.tarefaId, textoComentario({ item, acao, responsavel, prazo, tipo: tipo === 'feito' ? 'feito' : tarefaId ? 'atualizado' : 'novo' }))
    resultado.gronerEm = agora.toISOString()
  } catch (err) {
    resultado.gronerErro = String(err?.message ?? err).slice(0, 200)
  }
  return resultado
}

/** Implementação real (Groner de produção). Só é carregada quando o servidor liga a escrita. */
export async function depsReais() {
  const { gronerGet, gronerPost } = await import('./gronerClient.js')
  return {
    criarTarefa: (corpo) => gronerPost('Tarefa', corpo, { timeoutMs: 28000 }), // a função da Vercel tem 60 s
    comentar: (id, texto) => gronerPost(`Tarefa/${id}/Comentario`, { Comentario: texto }, { timeoutMs: 15000 }),
    tarefasDoCard: async (projetoId) => (await gronerGet('Tarefa', { projetoId, pageNumber: 1, pageSize: 20 }, { timeoutMs: 10000, retries: 1 }))?.list ?? [],
    usuarios: async () => {
      const lista = await gronerGet('Funcionario/Usuarios', {}, { timeoutMs: 10000, retries: 1 })
      return (Array.isArray(lista) ? lista : lista?.list ?? [])
        .filter((u) => u?.id && u?.nome && !/suporte/i.test(u.nome))
        .map((u) => ({ id: u.id, nome: String(u.nome).trim() }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    },
  }
}
