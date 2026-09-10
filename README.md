# Dashboard Groner CRM — ICF Energy

Dashboard que consome a [API do Groner CRM](https://ajuda.groner.app/pt-br/article/documentacao-da-api-groner-crm-vz2bq2/) e mostra leads, pipeline de projetos, vendas e pré-propostas.

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

- `GET /api/summary` — agregado (leads, pipeline por etapa, vendas por vendedor/mês, pré-propostas). Cacheado por 10 min; use `?refresh=1` para forçar recálculo.
- `GET /api/leads`, `/api/projetos`, `/api/vendas`, `/api/prepropostas` — passthrough paginado (`pagina`, `pageSize`) para os recursos correspondentes do Groner.
