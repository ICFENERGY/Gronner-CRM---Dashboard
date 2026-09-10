import app, { loadProjetosBrutos, loadVendasBrutas, loadPropostasBrutas, loadTarefasBrutas } from '../server/app.js'

// Pré-aquece o cache assim que a function "esquenta" (fica em memória entre
// invocações próximas). Não bloqueia a primeira resposta.
let aquecido = false
if (!aquecido) {
  aquecido = true
  Promise.all([loadProjetosBrutos(), loadVendasBrutas(), loadPropostasBrutas(), loadTarefasBrutas()]).catch((err) =>
    console.error('Falha ao pré-aquecer cache:', err.message),
  )
}

export default app
