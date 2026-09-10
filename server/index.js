import app, { loadProjetosBrutos, loadVendasBrutas, loadPropostasBrutas, loadTarefasBrutas } from './app.js'

const PORT = process.env.PORT || 3001

app.listen(PORT, () => {
  console.log(`Groner CRM dashboard backend rodando em http://localhost:${PORT}`)
  // Pré-aquece o cache em background para o primeiro acesso não esperar ~40s
  // (busca paginada de Propostas/Projetos/Tarefas na API do Groner).
  Promise.all([loadProjetosBrutos(), loadVendasBrutas(), loadPropostasBrutas(), loadTarefasBrutas()])
    .then(() => console.log('Cache pré-aquecido.'))
    .catch((err) => console.error('Falha ao pré-aquecer cache:', err.message))
})
