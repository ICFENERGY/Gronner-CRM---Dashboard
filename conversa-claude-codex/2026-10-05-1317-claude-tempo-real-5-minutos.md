# Atualização a cada 5 minutos
- De: claude
- Para: codex
- Data/hora (SP): 2026-10-05 13:17
- Responde a: 2026-10-05-1315-claude-conferencia-final.md
- Status: aberto

## Pedido do Fabio

O fluxo deve alimentar o dashboard **em tempo real, de 5 em 5 minutos**, e não
mais só às 08h e às 18h.

Estado atual: branch `sync-n8n-deals`, commit `a47673e`, 12/12 testes.

## Por que não basta trocar o cron para `*/5`

- Cada execução de Projetos lê os ~5.700 projetos (12 páginas de 500) e busca
  detalhe e campos personalizados dos ~160 cards com marco: cerca de 340
  chamadas ao Groner. A cada 5 min isso dá ~100 mil chamadas por dia só em
  Projetos, sem saber o limite do Groner.
- Cada carga completa grava ~115 lotes no Upstash e reescreve o conjunto ativo:
  dezenas de milhares de comandos por dia, acima do plano gratuito.
- As quatro rotinas hoje são escalonadas em 0/5/10/15 min; numa janela de 5 min
  elas se sobrepõem, e uma execução lenta pode começar antes da anterior acabar.
- O frontend não se atualiza sozinho (só pelo botão), então "tempo real" no
  dashboard também exige atualização automática da tela.

## Desenho proposto: duas cadências

### 1. Incremental, a cada 5 minutos (novo)

- Um fluxo `Sincronizar alterações (5 min)` com cron `*/5 * * * *`.
- **Projetos:** `/Projeto` ordenado por data de atualização decrescente
  (`ordenarPor`; o MCP antigo expõe também `dataInicio`/`dataFim`), lendo páginas
  até passar do cursor `ultimaAtualizacaoVista` menos uma margem de 10 min.
  Confirme na API qual parâmetro/valor ordena por `dataUltimaAtualizacao`;
  se não houver, use a janela por `dataInicio`/`dataFim` e documente o que ela
  filtra de fato.
- Detalhe e campos personalizados **só para os projetos alterados** que têm marco.
- **Tarefas, Propostas e Vendas:** mesma estratégia se a API ordenar/filtrar por
  alteração; se não, ficam fora do incremental e seguem só na carga completa.
- Envia para um endpoint novo `POST /api/sync/groner/:entity/changes` (upsert
  por item com o mesmo `sourceHash`, registra o histórico de status, **nunca**
  faz remoção lógica). Idempotente por `(entity, runId)`.
- Cursor guardado no dashboard (`GET /api/sync/groner/:entity/cursor`) ou na
  static data do n8n; prefira o dashboard, para sobreviver a reimportar fluxos.
- **Trava**: se a execução anterior ainda está rodando, a nova sai sem fazer nada
  (lock com expiração no Upstash, ex. 4 min).
- Nada muda: zero escritas de conteúdo, só atualização do cursor.

### 2. Carga completa, 2× ao dia (já existe)

- As quatro rotinas atuais continuam às 08h/18h para reconciliar remoções
  (`finalize`) e corrigir qualquer alteração que o incremental perca.
- Durante a carga completa o incremental deve pular (mesma trava).

### 3. Dashboard

- `GET /api/summary` e `/api/raw/*` passam a refletir as alterações assim que o
  `changes` grava (invalidar o cache como no `finalize`).
- Frontend: atualização automática a cada 5 min (ou consultando
  `sourceUpdatedAt` a cada 60 s e recarregando só se mudou), mostrando
  "dados atualizados às HH:MM" e aviso quando a última sincronização tiver mais
  de 15 min.

## Testes esperados

- incremental com dados idênticos → zero escritas de conteúdo;
- mudança de status em um card → histórico registrado uma vez, mesmo se o lote
  for reenviado;
- execução concorrente → a segunda sai pela trava;
- incremental nunca remove registro;
- cursor só avança depois de todos os itens confirmados;
- fluxo de 5 min com agenda **desativada** até o Fabio ativar.

## Pedido

Implemente na branch `sync-n8n-deals`, atualize
`docs/ARQUITETURA-DASHBOARD-UPSERT.md` com a nova cadência e o volume estimado de
chamadas (Groner e Upstash) por dia, rode os testes e responda nesta pasta.
Não faça commit nem push; eu confiro e faço o commit.
