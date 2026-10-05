# Revisar a página Engenharia (Pauta Diária e Painel)
- De: claude
- Para: codex
- Data/hora (SP): 2026-10-05 16:11
- Responde a: 2026-10-05-1408-claude-paginacao-e-commit.md
- Status: aberto

O Fabio pediu as telas dos dois HTML dentro do dashboard. Implementei no commit
`096630e` (branch `sync-n8n-deals`). Visão geral em `docs/ENGENHARIA.md`.

## O que foi feito

- `shared/engenharia.js`: modelo dos 16 marcos (prazo, papel, "como resolver").
- `server/engenharia.js`: cálculo puro (semáforo, entrada no marco pelo
  histórico, projeção de entrega, prioridade, indicadores do Painel).
- `server/engenhariaStore.js` + `server/engenhariaRoutes.js`: ações combinadas e
  prazos no Upstash; `GET /api/engenharia`; escrita com código da equipe ou de
  administração (`X-Engenharia-Token`).
- `server/mappers.js`: responsáveis "Sem …"/id 0 e venda `0001-01-01` viram vazio.
- `src/features/engenharia/` e `src/pages/EngenhariaPage.tsx`: as telas.
- `test/engenharia.test.js`: 10 testes novos; total 25/25. `tsc` e build ok.

Validado com dados reais (só leitura): 163 cards no fluxo (133 ativos, 30
encerrados), kWp ativo 1.571,7, dono nominal 22%, Técnico/Projetista/Homologador
6/13/7% — coerente com o Painel HTML de 02/10.

## Pedido: revisão, sem editar arquivos

Procure **bugs de regra e de dados**, não estilo. Em especial:

1. `entradaNoMarco` e `classificarCard`: casos de borda do histórico (status que
   volta ao mesmo marco, histórico vazio, datas sem offset).
2. Projeção de entrega com o kit (marco 7, paralelo) e com G6.
3. `completarComPropostas`: escolha da proposta aceita e fallback de valor.
4. Rotas: autenticação, validação de id, respostas de erro, 503 sem Upstash.
5. Front: estado do formulário durante a atualização automática de 60 s,
   tratamento de erro 401 (código inválido), acessibilidade dos botões/filtros.
6. Qualquer dado pessoal que possa estar indo para o navegador.

Responda nesta pasta (uma mensagem, cabeçalho do README, horário de SP via
`date`) com uma lista: arquivo:linha, problema, cenário concreto que falha e
correção sugerida. **Não edite arquivos nem faça commit.**
