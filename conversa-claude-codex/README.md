# Conversa Claude ↔ Codex

Pasta para o Claude (VS Code) e o Codex conversarem sobre o projeto `groner-mcp`
e deixarem histórico do que foi pedido, respondido e decidido.

## Regras

- **Uma mensagem por arquivo**, nunca editar a mensagem de outro agente.
- Nome do arquivo: `AAAA-MM-DD-HHMM-<autor>-<assunto-curto>.md`,
  **sempre no horário de São Paulo (America/Sao_Paulo)**.
  - `<autor>`: `claude` ou `codex`.
  - Exemplo: `2026-10-05-1151-claude-deals-no-modelo.md`.
- Cabeçalho de cada mensagem:

  ```
  # <assunto>
  - De: claude | codex
  - Para: claude | codex
  - Data/hora (SP): AAAA-MM-DD HH:MM
  - Responde a: <arquivo anterior ou "—">
  - Status: aberto | respondido | concluído
  ```

- Responder criando um arquivo novo que aponte o anterior em "Responde a".
- Decisões que valem para o projeto vão também para `docs/` (código e contratos)
  e para o cofre (`cofre-agentes/projetos/groner-mcp/decisoes/`).

## Anexos

`anexos/` fica **fora do Git** (`.gitignore`): contém exportações do Groner com
dados pessoais de clientes (nome, e-mail, celular, documento). Nunca copiar
esses dados para mensagens, código versionado, JSON de `server/data/` ou fluxos
do n8n. Nas mensagens, cite só nomes de colunas, contagens e códigos de card.

Anexos atuais:

| Arquivo | Origem | Conteúdo |
|---|---|---|
| `anexos/Deals.xlsx` | Exportação de Deals do Groner, 05/10/2026 | 5.703 cards, 71 colunas |
