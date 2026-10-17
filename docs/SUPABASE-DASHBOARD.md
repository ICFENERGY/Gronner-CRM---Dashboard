# Supabase — estado do dashboard na tabela `"DASHBOARD-GRONNER-CRM"`

## Por que

O dashboard guardava o estado da sincronização e da Engenharia no Upstash Redis
(`server/syncStore.js`, `server/engenhariaStore.js`). O Upstash do projeto foi
desligado e a conta Vercel só permite um Upstash grátis, já usado por outro
sistema. Decisão do Fabio: usar o Supabase já existente (produção do
GronerZap/Naya) com **uma única tabela** chamada exatamente
`DASHBOARD-GRONNER-CRM`.

Restrições:

- As tabelas do GronerZap/Naya (`app_settings`, `conversations`, `events`,
  `knowledge_documents`, `messages`, `processed_messages`, `send_queue`) não são
  tocadas. O script só cria a tabela nova e funções `dashboard_crm_*`.
- O servidor só tem acesso à API de dados (PostgREST, `/rest/v1/`) com a chave
  secreta (`SUPABASE_SECRET_KEY`, formato `sb_secret_…`, papel `service_role`,
  ignora RLS). DDL só pelo SQL Editor: `supabase/dashboard-gronner-crm.sql`.
- Há dados pessoais de clientes: RLS ligada **sem nenhuma policy** e privilégios
  revogados de `anon` e `authenticated`. A chave publicável não lê nada.

Verificado em 09/10/2026 (somente leitura, `GET /rest/v1/` com a chave
secreta): PostgREST 14.5; o schema exposto tem só as 7 tabelas do GronerZap; a
tabela do dashboard ainda não existe.

## Neon (Postgres)

O Supabase foi trocado pelo **Neon** (Postgres serverless). A tabela única e as
funções `dashboard_crm_*` são as mesmas; só muda o caminho de acesso:

- **Por que o Neon**: é Postgres puro, com plano grátis, sem a API pública de
  dados (PostgREST) e sem RLS/roles do Supabase. O acesso é só pela string de
  conexão do servidor, e o driver `@neondatabase/serverless` fala HTTP, o que cabe
  nas funções de até 60 s da Vercel Hobby sem manter conexões abertas.
- **SQL**: `neon/dashboard-gronner-crm.sql` (idempotente; validado no PGlite,
  rodando duas vezes). Aplicar com
  `DATABASE_URL="postgresql://…" node scripts/aplicar-sql-neon.mjs`, que roda o
  arquivo, confere a tabela e as 6 funções e imprime só nomes e contagens.
- **Código**: `server/pgSql.js` (consultas parametrizadas, timeout, 3 tentativas
  nas leituras, nenhuma nas funções), `server/pgSyncStore.js` e
  `server/pgEngenhariaStore.js` (mesma interface dos adaptadores Supabase e
  Redis). Erros SQLSTATE `PT409`/`PT400` viram `{ status, message }`; qualquer
  outra falha vira 503 genérico, sem expor a conexão.
- **Variáveis**:
  - `DATABASE_URL` (ou `NEON_DATABASE_URL`): string `postgresql://…` do **pooler**
    (host com `-pooler`), com `sslmode=require`. Só no servidor/Vercel, nunca no
    cliente nem no repositório.
  - `DASHBOARD_STORAGE` (opcional): `postgres` | `supabase` | `redis` | `memoria`
    força a escolha. Sem ela, a ordem é postgres > supabase > redis; sem nenhum, a
    sincronização fica desligada (e a Engenharia usa memória só fora da Vercel).
- **Leitura**: os ~5.900 projetos vêm em páginas de 1000 por chave (keyset) e só
  com `chave, dados`; antes disso, uma consulta única de versão decide se a carga
  em memória ainda vale. Registros com hash igual não são regravados.
- **Testes**: `test/pgStore.test.js` roda o SQL real no PGlite (`@electric-sql/pglite`,
  devDependency), sem rede.

O restante deste documento descreve o desenho original no Supabase; o modelo da
tabela, as travas e as funções valem igualmente para o Neon.

## Nome com hífen no PostgREST

`DASHBOARD-GRONNER-CRM` tem hífen e maiúsculas, então no SQL é sempre um
identificador entre aspas: `public."DASHBOARD-GRONNER-CRM"`. Na API isso **não
é problema**:

- O PostgREST trata o primeiro segmento do caminho como nome literal da
  relação e sempre gera SQL com o identificador entre aspas (maiúsculas
  preservadas). A documentação de gramática de URL mostra o mesmo para nomes
  com espaço (`/Order%20Items`) e unicode (percent-encoding).
- O hífen é caractere não reservado em URL e não é reservado pelo PostgREST
  (os reservados são `, . : * ( )`). Logo:
  `GET {SUPABASE_URL}/rest/v1/DASHBOARD-GRONNER-CRM?...` funciona sem escape.
  `encodeURIComponent('DASHBOARD-GRONNER-CRM')` devolve o mesmo texto.
- O nome das **colunas** é minúsculo e sem hífen (`tipo`, `entidade`, `chave`…)
  e as **funções RPC** usam `snake_case` (`dashboard_crm_finalizar`), de modo que
  filtros, `on_conflict`, `select` e `/rpc/...` nunca precisam de aspas.
- Índices, constraint e gatilho usam nomes sem hífen
  (`dashboard_gronner_crm_*`), exceto a PK, que segue o padrão
  `"DASHBOARD-GRONNER-CRM_pkey"`.

Risco residual: alguma ferramenta que monte a URL concatenando o nome sem
aspas em SQL (não é o caso do PostgREST nem do `supabase-js`). Alternativa, se
um dia der problema: criar uma *view* `dashboard_gronner_crm` sobre a tabela
(updatable, mesma PK) e apontar o adaptador para ela — sem migrar dados.

## A tabela

| coluna | tipo | uso |
|---|---|---|
| `tipo` | `text not null` (check em lista fixa) | namespace do item (ver abaixo) |
| `entidade` | `text not null` (check) | `projetos`, `tarefas`, `propostas`, `vendas` ou `engenharia` |
| `chave` | `text not null` (1–200 caracteres) | identificador dentro de `tipo` + `entidade` |
| `dados` | `jsonb not null default '{}'` | conteúdo (registro, lote, resultado, manifesto…) |
| `hash` | `text` | SHA‑256 canônico do registro (só `tipo = 'registro'`) |
| `ativo` | `boolean not null default true` | conjunto de ativos (só faz sentido em `registro`) |
| `expira_em` | `timestamptz` | validade (travas, lotes, resultados, finais); `null` = permanente |
| `criado_em` | `timestamptz not null default now()` | preservado em updates pelo gatilho |
| `atualizado_em` | `timestamptz not null default now()` | sempre `now()` do servidor (gatilho) |

- **PK** `(tipo, entidade, chave)`: atende leitura por chave, `in.(...)`, upsert
  (`on_conflict`) e varredura ordenada por `chave` dentro de `tipo + entidade`.
- **Índice parcial** `(entidade, chave) where tipo = 'registro' and ativo`: leitura
  paginada dos ativos.
- **Índice parcial** `(expira_em) where expira_em is not null`: limpeza.
- Gatilho `dashboard_crm_tocar` (BEFORE INSERT/UPDATE) mantém os carimbos.

### Como cada estrutura do Redis vira linhas

Prefixo antigo `S = groner-dashboard:sync:v1`, `E = groner-dashboard:engenharia:v1`.

| Redis | Linha(s) no Supabase |
|---|---|
| `S:records:<ent>` (hash id → registro) + `S:hashes:<ent>` (hash id → sha) + `S:active:<ent>` (set) | `tipo='registro'`, `chave=<id>`, `dados=<registro>`, `hash=<sha>`, `ativo` (true = está no conjunto de ativos; false = soft delete). Uma linha por registro reúne as três estruturas. |
| `S:history:<ent>` (hash id → array) | `tipo='historico'`, `chave=<id>`, `dados=[{id,statusAnterior,statusNovo,em},…]` (só projetos) |
| `S:run:<ent>:<runId>:batch:<n>` (TTL 2 dias) | `tipo='lote'`, `chave='<runId>:<n>'`, `dados={runId,runStartedAt,entity,batchIndex,batchCount,expectedTotal,items,hashes}`, `expira_em=now()+2d`. Apagado pela finalização. |
| `S:run:<ent>:<runId>:result:<n>` (TTL 2 dias) | `tipo='resultado'`, `chave='lote:<runId>:<n>'`, `expira_em=now()+2d` |
| `S:changes:<ent>:<runId>` (TTL 2 dias) | `tipo='resultado'`, `chave='changes:<runId>'`, `expira_em=now()+2d` |
| `S:run:<ent>:<runId>:final` (TTL 2 dias) | `tipo='final'`, `chave=<runId>`, `expira_em=now()+2d` |
| `S:current:<ent>` (manifesto) | `tipo='estado'`, `chave='current'` |
| `S:status:<ent>` | `tipo='estado'`, `chave='status'` |
| `S:cursor:<ent>` | `tipo='estado'`, `chave='cursor'`, `dados={"cursor":"<ISO>"}` |
| `S:activity-lock:<ent>` (NX, 4 min) | `tipo='trava'`, `chave='atividade'`, `dados={"dono":"full:<runId>"\|"changes:<runId>"}`, `expira_em` |
| `S:run:<ent>:<runId>:lock:<n>` (NX, 120 s) | `tipo='trava'`, `chave='lote:<runId>:<n>'`, `dados={"dono":<uuid>}`, `expira_em` |
| `E:acoes` (hash card → ação) | `tipo='acao'`, `entidade='engenharia'`, `chave=<card>` |
| `E:acoes-log:<card>` (lista, 20) | `tipo='acao_log'`, `entidade='engenharia'`, `chave=<card>`, `dados=[mais nova, …]` (até 20) |
| `E:config` | `tipo='config'`, `entidade='engenharia'`, `chave='prazos'` |

Diferença intencional: o Redis mantinha os lotes da carga publicada sem TTL
(`persist`) como reserva para `load()`. Aqui a finalização copia tudo para as
linhas `registro`, então os lotes são apagados — `load()` nunca precisa deles e
o volume cai pela metade.

## Operações via PostgREST

Base: `{SUPABASE_URL}/rest/v1`. Cabeçalhos em toda chamada:
`apikey: <SUPABASE_SECRET_KEY>`, `Authorization: Bearer <SUPABASE_SECRET_KEY>`,
`Content-Type: application/json`. Abaixo, `T = /DASHBOARD-GRONNER-CRM`.

**Upsert (um ou vários itens, mesmo de tipos diferentes)**

```
POST T?on_conflict=tipo,entidade,chave&columns=tipo,entidade,chave,dados,hash,ativo,expira_em
Prefer: resolution=merge-duplicates, return=minimal
[ {tipo, entidade, chave, dados, hash, ativo, expira_em}, … ]
```

- Uma requisição = uma instrução `INSERT … ON CONFLICT DO UPDATE` = **uma
  transação**. Como tudo mora na mesma tabela, dá para gravar registros,
  histórico, cursor, status e o resultado idempotente juntos e atomicamente —
  substitui o `pipeline()` do Redis com garantia maior.
- Enviar sempre **todas** as colunas da lista `columns` em todos os objetos
  (chave ausente vira `null`, não o default). Não enviar `criado_em`/`atualizado_em`.
- Limite prático por requisição: ~1 MB de corpo (500 registros de incremental cabem).

**Leitura por chave(s)**

```
GET T?tipo=eq.estado&entidade=eq.projetos&chave=eq.cursor&select=dados
GET T?tipo=eq.registro&entidade=eq.projetos&chave=in.(1,2,3)&select=chave,hash,dados
GET T?tipo=eq.resultado&entidade=eq.projetos&chave=eq.lote:projetos-20261005T110000Z:1
      &or=(expira_em.is.null,expira_em.gt.<agora ISO>)&select=dados
```

`in.(...)` com até 500 ids numéricos dá ~4 KB de URL, dentro do limite.
Itens com validade devem ser filtrados por `expira_em` na leitura (a limpeza é
periódica, não instantânea).

**Leitura paginada dos ~5.700 projetos**

O Supabase limita cada resposta a 1.000 linhas (`max-rows`). Use paginação por
**chave (keyset)**, estável mesmo se houver escrita entre páginas:

```
GET T?tipo=eq.registro&entidade=eq.projetos&ativo=is.true
      &select=chave,dados&order=chave.asc&limit=1000
GET …&chave=gt.<última chave da página anterior>&limit=1000   (até vir < 1000)
```

São 6 páginas para projetos, 4 para propostas, 2 para tarefas e 1 para vendas,
servidas pelo índice parcial. Alternativa equivalente: cabeçalhos
`Range-Unit: items` / `Range: 0-999` (ou `offset`), com `Prefer: count=exact`
na primeira para ler o total em `Content-Range: 0-999/5701`; mas offset pode
pular/duplicar linhas se uma finalização ocorrer entre as páginas. O histórico
(`tipo=eq.historico`) é lido do mesmo jeito e juntado em memória.

**Apagar**

```
DELETE T?tipo=eq.trava&entidade=eq.projetos&chave=eq.atividade&dados->>dono=eq.<dono>
```

**RPC**

```
POST /rest/v1/rpc/dashboard_crm_finalizar
{"p_entidade":"projetos","p_run_id":"…","p_run_started_at":"…","p_batch_count":3,"p_expected_total":120}
```

Erros de negócio levantados com `SQLSTATE 'PT409'`/`'PT400'` chegam como HTTP
409/400 com corpo `{"code":"PT409","message":"Nem todos os lotes foram recebidos",…}`
(recurso do PostgREST "RAISE com status HTTP"). O adaptador repassa
`status` e `message` iguais aos do Redis, então rotas e testes de rota não mudam.

## Travas, idempotência e atomicidade: RPC × operações simples

O PostgREST não tem transação multi‑requisição, mas cada requisição já é uma
transação, e uma função `plpgsql` roda inteira numa transação só.

| Necessidade | Só PostgREST | Com RPC | Escolha |
|---|---|---|---|
| Trava NX com expiração | `DELETE … expira_em=lt.<agora do cliente>` + `POST` com `resolution=ignore-duplicates` (vazio = não pegou). Duas requisições e relógio do cliente. | `dashboard_crm_travar`: um `INSERT … ON CONFLICT DO UPDATE … WHERE expirada OR mesmo dono RETURNING`. Atômico, relógio do servidor, devolve o dono atual. | **RPC** |
| Soltar trava só se for minha | `DELETE` com filtro `dados->>dono=eq.<dono>` (atômico) | `dashboard_crm_liberar` | qualquer um; RPC por simetria |
| Resultado idempotente (lote/incremental/final) | `GET` antes; gravar o resultado no **mesmo upsert** dos dados | — | **simples** |
| Gravar lote + resultado + histórico | um `POST` upsert com linhas de tipos diferentes | — | **simples** |
| Incremental (registros + histórico + cursor + status + resultado) | um `POST` upsert (até 500 registros) | — | **simples** |
| Finalização (validar lotes, publicar ~5.700 registros, soft delete, manifesto, status, final, apagar lotes, soltar trava) | inviável: exigiria baixar e reenviar todos os lotes (~10 MB) em várias requisições, sem atomicidade | `dashboard_crm_finalizar`: tudo em SQL dentro do banco, uma transação, `pg_advisory_xact_lock` por entidade, só regrava registros cujo hash mudou | **RPC** |
| Ação da Engenharia + histórico de 20 | ler‑modificar‑gravar o array (corrida entre duas pessoas) | `dashboard_crm_salvar_acao`: upsert da ação + prepend/trim do log num único `ON CONFLICT` | **RPC** |
| Limpeza de expirados | `DELETE T?expira_em=lt.<agora>` | `dashboard_crm_limpar_expirados` (chamada também pela finalização) | RPC |

**Recomendação: híbrido.** Leituras e upserts de dados por PostgREST simples
(o hash canônico continua em JavaScript, `canonicalHash`), e RPC só onde há
atomicidade ou relógio em jogo: travar/liberar, finalizar, salvar ação e
limpar. As funções são `SECURITY DEFINER` com `search_path = ''` (todos os
nomes qualificados) e `EXECUTE` revogado de `public`, `anon` e `authenticated`,
concedido só a `service_role`. Testadas em Postgres (PGlite): script rodado
duas vezes, finalização com falta de lote, carga mais nova, IDs duplicados,
soft delete, replay idempotente, trava concorrente e histórico limitado a 20.

Diferença de comportamento: `dashboard_crm_travar` **renova** a trava quando o
dono é o mesmo. No Redis a trava de atividade da carga completa vencia após
4 min mesmo com lotes chegando; renovando, uma carga longa não deixa o
incremental se intrometer no meio.

## Volume estimado

| item | linhas | tamanho aprox. |
|---|---|---|
| registros projetos (~1,5–2,5 KB jsonb cada) | ~5.700 | 9–14 MB |
| registros propostas (~0,8–1,2 KB) | ~3.600 | 3–4 MB |
| registros tarefas + vendas | ~1.350 | ~1 MB |
| histórico de status (cresce com o tempo) | até ~5.700 | 1–3 MB |
| lotes em trânsito (só durante a carga) | ~200 | pico de +15 MB |
| resultados/finais (2 dias; tick a cada 5 min = 576 + lotes) | ~1.000 | < 1 MB |
| ações, logs e config da Engenharia | centenas | < 1 MB |
| índices + inchaço de updates (autovacuum) | — | 3–8 MB |

Total: **~20–30 MB em regime, pico ~45 MB** durante uma carga completa — menos
de 10% dos 500 MB do plano grátis. Atenção: os 500 MB são do **banco inteiro**,
que é compartilhado com o GronerZap (mensagens e conversas crescem sozinhas);
conferir em *Project Settings → Usage* antes e depois.

**Risco maior que o disco: egress (5 GB/mês no plano grátis).** Cada leitura
completa das 4 entidades baixa ~15–20 MB. O dashboard guarda em memória por
10 min (`cached`, TTL_MS) e o tick invalida projetos a cada 5 min. Com
instâncias Vercel frias e tráfego contínuo, isso pode passar de 100 MB/hora.
Mitigações para o adaptador:
1. Antes de recarregar, ler só `estado/current` + `max(atualizado_em)` dos
   registros (consulta de bytes); se nada mudou, manter o cache.
2. Recarga incremental: buscar só `atualizado_em=gt.<última leitura>` e
   mesclar no cache em memória (só funciona em instância quente).
3. Não invalidar o cache no tick quando `inserted + updated === 0`.
4. `select` só das colunas usadas (`chave,dados`, nunca `*`).

## Plano de implementação do adaptador (próxima tarefa)

### Interfaces que precisam continuar iguais

`server/syncStore.js` exporta e as rotas/`app.js` usam:

- `syncStorageConfigured(): boolean`
- `getSyncStore(): SyncStore`, `createSyncStore(redis)` (testes atuais),
  `loadSyncedEntity(entity)`, `getSyncStatuses()`, `canonicalHash(value)`,
  `getRedis()` (hoje usado pela Engenharia).
- `SyncStore`:
  - `upsertChanges(input, normalize) → {ok, runId, entity, received, inserted, updated, unchanged, skipped, finishedAt, nextCursor}` ou `{ok, skipped:true, reason:'sync_locked', …}`
  - `cursor(entity) → string|null`
  - `upsertBatch(input, normalize) → {ok, runId, entity, batchIndex, expectedTotal, received, inserted, updated, unchanged}`; 409 em trava
  - `finalize(input) → {ok, entity, runId, runStartedAt, finishedAt, batchCount, expectedTotal, inserted, updated, unchanged, softDeleted, activeTotal}`
  - `load(entity) → {items (com historicoStatus, dataEntradaMarco, dataEntradaMarcoEstimada), totalItems, sync: manifesto} | null`
  - `status(entity) → objeto | null`

`server/engenhariaStore.js`: `engenhariaStore()` devolve `null` (Vercel sem
armazenamento) ou um objeto com `listarAcoes() → {card: ação}`,
`salvarAcao(id, registro)`, `obterAcao(id)`, `historico(id) → [mais nova…]`
(até 20), `obterConfig()`, `salvarConfig(c)`; além de `validarAcao`,
`validarPrazos`, `criarStoreMemoria`.

### Arquivos sugeridos (sem dependência nova)

1. `server/supabaseRest.js` — cliente mínimo com `fetch` nativo:
   `supabaseConfigured()` (`SUPABASE_URL` e `SUPABASE_SECRET_KEY`),
   `rest.get(query)`, `rest.getAll(query)` (keyset de 1.000),
   `rest.upsert(rows)`, `rest.del(query)`, `rest.rpc(nome, args)`.
   Timeout de 8 s (`AbortSignal.timeout`), 3 tentativas com backoff só em erro
   de rede/5xx de operações idempotentes; erro `PTxxx` → `Error` com `status`
   e `message` do banco; outros → status 503 com mensagem genérica (nunca
   logar cabeçalhos/chave). Recebe `fetch` injetável para testes. Não usar
   `@supabase/supabase-js` (evita mexer no `package.json`, que está em uso por
   outra tarefa).
2. `server/supabaseSyncStore.js` — `createSupabaseSyncStore(rest)`
   implementando `SyncStore`:
   - `upsertChanges`: validar (reusar `validateChanges`, exportando-a de
     `syncStore.js`); `GET resultado changes:<runId>` → se houver, devolve;
     `rpc travar('atividade', 'changes:<runId>', 240)`; se `ok=false` →
     `skipped`; normalizar; `GET registro in.(ids)` e `GET historico in.(ids)`
     (projetos); calcular contagens e histórico como hoje; ler `estado/status`
     e `estado/cursor`; **um** `upsert` com registros (`ativo=true`), histórico,
     cursor (se veio), status e resultado (`expira_em` +2 dias);
     `finally rpc liberar`.
   - `upsertBatch`: `rpc travar('atividade','full:<runId>',240)` (se o dono for
     `changes:*` → 409 "Sincronização incremental em andamento", senão 409
     "Outra sincronização está em andamento"); `GET resultado lote:<runId>:<n>`;
     `rpc travar('lote:<runId>:<n>', uuid, 120)` → 409 "Lote já está sendo
     processado"; normalizar e contar; **um** `upsert` com lote + resultado +
     histórico; `finally rpc liberar`.
   - `finalize`: validar em JS (mensagens iguais) e `rpc dashboard_crm_finalizar`.
   - `load`: `GET estado/current` (null → null); `getAll` dos registros ativos
     e do histórico; montar `historicoStatus`/`dataEntradaMarco` com o mesmo
     código de hoje (extrair para uma função compartilhada).
   - `cursor`/`status`: `GET estado/*`.
3. `server/supabaseEngenhariaStore.js` — `listarAcoes` (`getAll tipo=acao`),
   `salvarAcao` (`rpc dashboard_crm_salvar_acao`), `obterAcao`, `historico`
   (`GET acao_log` → array), `obterConfig`/`salvarConfig` (linha `tipo='config'`,
   `entidade='engenharia'`, `chave='prazos'`, via GET/upsert).
4. Seleção do armazenamento (mudança pequena em `syncStore.js` e
   `engenhariaStore.js`, sem tocar nas rotas):
   - `syncStorageConfigured()` = Supabase **ou** Upstash configurado.
   - `getSyncStore()`: Supabase se `SUPABASE_URL` + `SUPABASE_SECRET_KEY`;
     senão Redis se `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`;
     senão o store atual sem cliente (503). Opcional: memória local fora da
     Vercel para desenvolvimento.
   - `engenhariaStore()`: Supabase → Redis → memória (só fora da Vercel) →
     `null`.
   - Opcional: `DASHBOARD_STORAGE=supabase|redis|memoria` para forçar.
   - `createSyncStore(redis)` continua existindo para os testes atuais.
5. Mitigações de egress da seção anterior (pelo menos a 3 e a 4).

### Testes a escrever (`node --test`, `fetch` falso — nada de rede)

Um "PostgREST falso" em memória que entende `eq`, `in`, `gt`, `is`,
`order`, `limit`, upsert com `merge-duplicates` e as RPCs (reimplementadas em
JS com a mesma semântica) permite rodar os mesmos cenários de
`test/syncStore.test.js`:

1. Carga completa idempotente: lote repetido devolve o mesmo resultado;
   finalização publica; segunda carga igual → `unchanged`; carga menor →
   `softDeleted` e histórico de status.
2. Finalização recusa lotes faltando (409), IDs duplicados entre lotes (409) e
   carga mais antiga que a publicada (409); repetir a finalização devolve o
   mesmo `final`.
3. Incremental: conta updated, grava histórico, avança cursor só com sucesso,
   repetição idempotente, `skipped` quando a trava é `full:*` de outra carga.
4. Trava de lote ocupada → 409 "Lote já está sendo processado"; a trava é
   solta no `finally` mesmo quando a normalização lança erro.
5. `load` pagina (> 1.000 registros com `limit` falso pequeno) e junta histórico.
6. Mapeamento de erros: resposta `{code:'PT409', message}` vira `Error` com
   `status 409` e a mesma mensagem; 500/timeout vira 503 genérico; a chave
   nunca aparece em mensagens/logs.
7. URL: a tabela é chamada como `/rest/v1/DASHBOARD-GRONNER-CRM`, e todo
   pedido leva `apikey` e `Authorization: Bearer`.
8. Engenharia: `salvarAcao` 22 vezes → `historico` com 20, mais nova primeiro;
   `listarAcoes`, `obterAcao`, config.
9. Seleção: com `SUPABASE_*` → Supabase; só `UPSTASH_*` → Redis; nada e
   `VERCEL` definido → `engenhariaStore()` null e sync 503; nada fora da
   Vercel → memória.
10. Os testes atuais (`syncStore`, `syncTick`, `engenharia`) continuam passando
    sem alteração.

Teste manual opcional depois do SQL aplicado, num ambiente de homologação:
rodar `supabase/dashboard-gronner-crm.sql`, fazer uma carga completa de
`vendas` (a menor) e conferir no Table Editor.

## Passo a passo no Supabase (para o Fabio)

1. Abrir o projeto do GronerZap no Supabase → **SQL Editor** → *New query*.
2. Colar todo o conteúdo de `supabase/dashboard-gronner-crm.sql` e clicar em
   **Run**. Pode rodar de novo sem problema.
3. Conferir em **Table Editor** que `DASHBOARD-GRONNER-CRM` existe e mostra
   "RLS enabled" sem policies. Se a API não enxergar a tabela de imediato,
   rodar `notify pgrst, 'reload schema';` (já está no fim do script).
4. Em **Project Settings → Data API**, se "Exposed schemas" não incluir
   `public`, nada funciona — no projeto atual inclui (o GronerZap usa).
5. Na Vercel, cadastrar `SUPABASE_URL` e `SUPABASE_SECRET_KEY` (a chave
   publicável não é necessária para o dashboard).
