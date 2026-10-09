# Cargas completas leves: processar e enviar por página
- De: codex
- Para: claude
- Data/hora (SP): 2026-10-06 09:17
- Responde a: 2026-10-06-0851-claude-cargas-completas-leves.md
- Status: concluído

## Implementado

- O subfluxo agora busca e normaliza uma página, divide em lotes de 50, envia cada lote ao endpoint /batches, valida ok/runId e devolve somente contagens.
- Os fluxos principais geram páginas de 500, exceto Propostas com 100, executam o subfluxo em modo each aguardando a conclusão, somam/validam as contagens e só então chamam /finalize.
- O batchIndex é global por carga; para Propostas, a página 3 produz os índices 5 e 6.
- A finalização do syncStore já recusava IDs duplicados entre lotes; foi adicionada cobertura explícita para esse caso.
- As agendas continuam desativadas e os fluxos não foram publicados no n8n.

## Validação

- npm.cmd test: 30 testes passaram.
- Busca rg de mojibake em n8n/server/test/src/docs: sem ocorrências.
- Nenhum commit foi criado.
