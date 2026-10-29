# MCP da SolarZ (somente leitura)

Servidor MCP remoto que dá ao Claude acesso de **leitura** aos dados da SolarZ (usinas, geração, desempenho, farol, UCs, tickets).
Endereço: `https://groner-crm-dashboard-ten.vercel.app/mcp/solarz`. Não usa OAuth: a autenticação é só por chave.
Dados pessoais (CPF, e-mail, telefone, endereço) não são devolvidos.

## Ferramentas
| Ferramenta | O que faz |
|---|---|
| `solarz_resumo_parque` | KPIs do parque: usinas, kWp, geração x prognóstico do último mês fechado, desempenho 3m/12m, status, farol e tickets |
| `solarz_listar_usinas` | Lista com filtros (status, farol, UF, premium, nome) e `limite` |
| `solarz_detalhe_usina` | Detalhe por `id` ou `nome`: desempenho 1/15/30/365 dias, UCs, tickets |
| `solarz_geracao_mensal` | Geração, prognóstico e desempenho por mês de um `ano` |
| `solarz_geracao_diaria` | Geração diária por `mes` (AAAA-MM) ou `de`/`ate` (AAAA-MM-DD, máx. 92 dias) |
| `solarz_relatorio_periodo` | Relatório mensal consolidado entre `inicio` e `fim` (AAAA-MM) |
| `solarz_unidades_consumidoras` | UCs e créditos por usina |
| `solarz_tickets` | Tickets com filtros de status, usina e tipo |
| `solarz_farol` | Farol de hoje, usinas em alerta e histórico diário |
| `solarz_potencia_usina` | Potência da usina (`plant/power`) |
| `solarz_assinaturas` | Plano e licenças disponíveis (a SolarZ pode negar a rota: vem como aviso) |

Usina sem monitoramento premium responde com aviso "não premium" (não é erro). Horários em Brasília.

## Chave
Variável na Vercel: `MCP_SOLARZ_TOKEN`. Se ela não existir, vale `MCP_ACCESS_TOKEN` (a mesma do MCP do Groner).
Sem nenhuma das duas o MCP fica fechado (401). A chave é aceita por `?key=`, `Authorization: Bearer` ou `x-api-key`.

## Instalação
**claude.ai** (Configurações > Conectores > Adicionar conector personalizado): nome "SolarZ", URL
`https://groner-crm-dashboard-ten.vercel.app/mcp/solarz?key=<chave>`. Deixe o OAuth Client ID em branco.

**Claude Code:**
```
claude mcp add --transport http solarz "https://groner-crm-dashboard-ten.vercel.app/mcp/solarz" --header "Authorization: Bearer <chave>"
```

**Claude Desktop:** Configurações > Conectores > Adicionar conector personalizado, com a mesma URL do claude.ai (com `?key=`).

## Notas
- Resumo, lista e farol vêm do banco (carga diária das 06:50 UTC); detalhe, geração, relatório, UCs e tickets consultam a SolarZ na hora.
- As rotas `/.well-known/*`, `/register`, `/authorize` e `/token` respondem 404 JSON de propósito, para o cliente não tentar OAuth.
