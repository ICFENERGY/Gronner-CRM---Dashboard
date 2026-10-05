# Dashboard Groner CRM — ICF Energy

Dashboard que consome a [API do Groner CRM](https://ajuda.groner.app/pt-br/article/documentacao-da-api-groner-crm-vz2bq2/) e mostra leads, pipeline de projetos, vendas, validação de cadastro e indicador de tarefas (com alertas de atraso).

**Produção:** https://groner-crm-dashboard.vercel.app
**Repositório:** https://github.com/felipeholanda2077/groner-crm-dashboard

## Páginas

- **Visão geral** — KPIs, funil de vendas por etapa (cadeia principal + processos paralelos), pivô Funil x Ano, geografia (estado/concessionária).
- **Vendas** — filtros, vendas por vendedor/origem/estado, fornecedor do kit, top cidades, extrato.
- **Validação de cadastro** — propostas por tipo/origem/vendedor, pivô "card x mês x dia", árvore "card x etapa x status".
- **Indicador de tarefas** — status, responsáveis, prioridade, e alertas de tarefas atrasadas (badge visível em qualquer página).

## Enriquecimento de dados

`server/data/*.json` traz cidade/estado/kit técnico/composição de preço extraídos de planilhas exportadas do próprio Groner (Deals/Sales), casados por Código com os IDs vivos da API — a API não expõe esses campos de forma confiável. Só campos operacionais foram mantidos; CPF, e-mail, celular, data de nascimento, renda e patrimônio foram descartados na extração.

## Arquitetura e segurança

O token de integração do Groner (`GRONER_TOKEN`) tem permissão de **Administrador / Diretor Financeiro** — ele nunca deve chegar ao navegador. Por isso:

- O token vive só em `server/.env`, lido pelo backend Express (`server/`).
- O frontend (`src/`) nunca chama `*.api.groner.app` diretamente — só chama o próprio backend em `/api/*`, que faz o proxy e injeta o `Authorization: Bearer`.
- `.env` está no `.gitignore`. Nunca commite esse arquivo nem cole o token em código-fonte.
- O token gerado tem validade de ~500 dias (fluxo `POST /api/Conta/GerarToken`); rotacione-o periodicamente pelo painel do Groner.

## Rodando localmente

```bash
npm install
cp .env.example .env   # depois preencha GRONER_TOKEN e GRONER_TENANT
npm run dev
```

Isso sobe o backend em `http://localhost:3001` e o frontend em `http://localhost:5173` (com proxy de `/api` para o backend).

## Build de produção

```bash
npm run build
NODE_ENV=production npm start
```

O Express passa a servir o build estático (`dist/`) e as rotas `/api/*` no mesmo processo/porta.

## Endpoints do backend

- `GET /api/summary` — agregado (leads, funil por etapa/ano, geografia, vendas por vendedor/mês, pré-propostas). Cacheado por 10 min; use `?refresh=1` para forçar recálculo.
- `GET /api/raw/vendas`, `/api/raw/projetos`, `/api/raw/propostas`, `/api/raw/tarefas` — listas completas já mapeadas e sanitizadas (sem campos sensíveis), para os filtros do frontend agregarem no navegador.

## Deploy (Vercel)

O projeto já está linkado ao projeto Vercel `groner-crm-dashboard` (conectado a este repositório GitHub — todo push em `main` dispara um deploy automático). O backend roda como uma única Vercel Function em `api/index.js` (o mesmo app Express de `server/app.js`); `vercel.json` redireciona `/api/*` para essa function.

Variáveis de ambiente necessárias no projeto Vercel (Production/Preview/Development): `GRONER_TOKEN`, `GRONER_TENANT`.

Para receber as cargas incrementais do N8N, configure também
`GRONER_SYNC_TOKEN`, `UPSTASH_REDIS_REST_URL` e
`UPSTASH_REDIS_REST_TOKEN`. O segredo de sync deve ser exclusivo deste
dashboard e nunca deve ser exposto ao frontend.

```bash
vercel env ls          # conferir variáveis
vercel --prod          # deploy manual, se precisar
```

## Sincronização pelo N8N

Quando Redis e `GRONER_SYNC_TOKEN` estão configurados, o backend aceita quatro
entidades: `projetos`, `tarefas`, `propostas` e `vendas`.

- `POST /api/sync/groner/:entity/batches` — recebe até 50 registros brutos do
  Groner, aplica a allowlist dos mappers, remove campos sensíveis e registra um
  lote idempotente.
- `POST /api/sync/groner/:entity/finalize` — publica a fotografia somente após
  confirmar todos os lotes e o total esperado.
- `GET /api/sync/groner/status` — informa a última carga publicada por entidade,
  sem retornar registros ou segredos.

Os POSTs exigem `X-Groner-Sync-Token`. Uma carga interrompida não substitui os
dados anteriores. Se Redis ainda não estiver configurado ou não houver uma
fotografia publicada, os endpoints de leitura continuam consultando a API do
Groner como antes.

Toda a implementação dessa integração pertence a este repositório do CRM:

- `docs/ARQUITETURA-DASHBOARD-UPSERT.md` — contrato, segurança e ordem de implantação;
- `n8n/dashboard-sync/` — gerador e definições dos cinco fluxos do N8N;
- `test/n8nDashboardSync.test.js` — validações estruturais e de segurança dos fluxos.
