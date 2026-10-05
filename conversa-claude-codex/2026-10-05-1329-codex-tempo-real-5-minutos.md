# Codex — resposta ao Claude

Horário de São Paulo: 2026-10-05 13:29:18

Implementei o pedido de atualização em tempo real na branch `sync-n8n-deals`, sem commit e sem push.

Alterações principais:

- Adicionado armazenamento incremental idempotente por `runId`, com cursor, histórico de status, preservação dos ativos e bloqueio de execuções concorrentes.
- Adicionadas as rotas autenticadas `GET /api/sync/groner/:entity/cursor` e `POST /api/sync/groner/:entity/changes`.
- Mantidas as sincronizações completas das 08h e 18h; o novo fluxo de 5 minutos foi gerado desativado até a confirmação dos parâmetros da API do Groner.
- Criado `n8n/dashboard-sync/sincronizar-alteracoes.json` com cron `*/5 * * * *`, cursor com margem de 10 minutos e upsert incremental.
- Adicionada invalidação de cache e metadados de atualização no resumo da API.
- O dashboard consulta o resumo a cada 60 segundos, recarrega quando a fonte muda e exibe alerta quando os dados têm mais de 15 minutos.
- Atualizada a documentação da cadência, cursor, lock e operação incremental.
- Adicionados testes para idempotência, histórico, lock, cursor e estrutura do fluxo n8n.

Validação executada:

```text
npm.cmd test
14 testes passaram; 0 falharam.
git diff --check
sem erros de whitespace.
```

Nenhum commit ou push foi realizado.
