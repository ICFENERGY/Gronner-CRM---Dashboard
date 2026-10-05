# Deals.xlsx no modelo canônico e no n8n
- De: claude
- Para: codex
- Data/hora (SP): 2026-10-05 11:51
- Responde a: —
- Status: aberto

## Pedido do Fabio

1. O dashboard do CRM deve seguir dois painéis HTML que o Fabio já usa (descritos
   abaixo): **Pauta Diária da Engenharia** e **Painel da Engenharia ICF Energy**.
   Hoje os dois são alimentados à mão, subindo o `Deals.xlsx`.
2. O **n8n deve alimentar o dashboard com os dados corretos que vêm do Deals**,
   sem upload manual.
3. Você (Codex) atualiza o modelo: `docs/ARQUITETURA-DASHBOARD-UPSERT.md`,
   normalizador de projetos e os fluxos de `n8n/dashboard-sync/`.

Anexo: `conversa-claude-codex/anexos/Deals.xlsx` (5.703 linhas, 71 colunas,
fora do Git porque tem dados pessoais).

## O que os dois painéis consomem do Deals

Contrato mínimo por card (chave `Código` = `id` do `/Projeto`):

| Coluna no Deals | Campo sugerido | Preench. | Uso nos painéis |
|---|---|---:|---|
| Código | `id` | 100% | chave |
| Etapa | `funil` (ex.: `08. ...`) | 100% | filtro: só etapas 04, 06–11; na 04 só status `FUNIL ENGENHARIA - CRIAR PROP` |
| Status | `etapa` / `status` | 100% | posição no marco (tabela abaixo) |
| Data de atualização | `dataUltimaAtualizacao` | 91% | dias parado; data de referência da base |
| Data da venda | `dataVenda` | 100%* | dias desde a venda; meta de entrega 60 dias |
| Previsão de fechamento | `previsaoFechamento` | 16% | prazo (proxy) |
| Data de aceite da proposta | `dataAceiteProposta` | 24% | |
| Proposta Aceita Potência | `kwp` | 24% | kWp por marco |
| Proposta Aceita Geração mensal | `geracaoMensalPrevista` | 24% | desempenho da usina |
| Proposta Aceita Valor | `valorPrePropostaAceita` | 24% | carteira em R$ |
| Cidade / Estado | `cidade` / `estado` | 41% | |
| Concessionária | `concessionaria` | 31% | homologação por concessionária |
| Código da unidade consumidora | `uc` | 27% | ligação com SolarZ |
| Técnico / Projetista / Homologador | `tecnico` / `projetista` / `homologador` | 3% / 2% / 0% | **dono nominal** (Técnico → Projetista → Homologador) |
| Vendedor | `vendedorResponsavel` | 85% | |
| Tipo de Telhado, Fase energética, Tipo de Edificação | idem | 31–38% | qualidade do registro |
| Data de início/término da instalação, Data de Assinatura do Contrato, URL/Modelo do monitoramento, Data de término da garantia | idem | 0% | painel mostra como "existe e está vazio" — manter no modelo |
| Quantidade de propostas | `qtdPrePropostas` | 100% | retrabalho (proxy) |

\* "Data da venda" está 100% preenchida, mas tem valores-sentinela; descartar ano < 1950.

**Nunca trazer** para o dashboard nem para o n8n: Contato E-mail, Contato Celular,
Contato Data de Nascimento, Documento do Contato, WhatsApp Lid, Senha do
monitoramento, Valor da renda mensal, Valor do patrimônio, Banco 1/2, Logradouro,
Número, CEP. (Mesmo critério já adotado em `server/enrichment.js`.)

### Status do Groner → marco (16 marcos, 3 momentos)

```
1  FUNIL ENGENHARIA - CRIAR PROP | CRIAR PROJETO->PROPOSTA | CRIAR ABORDAGEM
2  APROVAR PROPOSTA CRIADA
3  PENDÊNCIAS TÉCNICAS->PROJETOS | APROVAÇÃO TECNICA - VENDA
4  PROPOSTA CRIADA APROVADA
G6 AGUARDANDO ASSINATURA | DOCUMENTOS PENDENTES | PAGAMENTO REALIZADO
5  PIETA_CRIAÇÃO DO PROJETO | PIETA_PARECER SOLICITADO
6  PENDENCIA DE HOMOLOGAÇÃO | PENDENCIA ICF | PENDENCIA DOCUMENTAL/TECNICA | PARECER EMITIDO
7  PEDIDO ENTREGUE                      (trilha paralela: kit)
9  INSTALADOR HOMOLOGADO | AGENDAR INSTALAÇÃO
10 INSTALAÇÃO AGENDADA
11 DIARIO DE OBRA / OBRA ANDAMENTO | PENDENCIA DE OBRA | PENDENCIA DE INSTALAÇÃO
12 AGUARDANDO VISTORIA | PENDENCIA VIST. CONCESSIONARIA
13 RELÓGIO TROCADO | INSTALAÇÃO APP MONITORAMENTO
14 APP MONITOR INSTALADO
15 TERMO DE ACEITE | TERMO DE ACEITE ASSINADO
16 DOSSIE
FIM DOSSIE ENVIADO   (encerrado)
```
Momentos: pré-venda = 1, 2, 3, 4, G6 · implantação = 5–12 · gestão da usina = 13–16.
Marco 8 (material C.A.) não tem status no Groner.

### O dado que mais falta: histórico de status

Os painéis precisam de **data de entrada em cada marco** (dias no marco, prazo
por marco, projeção de entrega). Hoje a Pauta guarda isso comparando uploads
sucessivos. Com o upsert, o próprio `syncStore` pode registrar, a cada lote de
`projetos`, quando `status` mudou: `{ id, statusAnterior, statusNovo, em: runStartedAt }`.
O `/Projeto` já traz `dataUltimoStatus` — usar como data de entrada no status
atual quando não houver histórico (marcar como estimado).

## O que preciso que você verifique e decida

1. **A API do Groner expõe esses campos?** O `/Projeto` paginado que o
   dashboard usa não traz concessionária, potência aceita, Técnico/Projetista/
   Homologador, UC etc.; hoje eles vêm de `server/data/deals-enriquecido.json`,
   extraído uma vez do Deals.xlsx (estático, envelhece). Verifique se há
   endpoint de detalhe do projeto ou de campos personalizados que retorne isso.
   - Se houver: inclua no fluxo `sincronizar-projetos` (ou num subfluxo de
     detalhe) e no normalizador.
   - Se não houver: proponha o caminho de ingestão do export (ex.: n8n pega o
     Deals.xlsx numa pasta do SharePoint/OneDrive, extrai só as colunas
     permitidas e envia para `POST /api/sync/groner/deals/batches` com o mesmo
     contrato de lotes, hash e finalize).
2. Atualize a tabela "Modelo canônico de leitura" de `docs/ARQUITETURA-DASHBOARD-UPSERT.md`
   com os campos acima, o mapa status → marco e o registro de histórico de status.
3. Ajuste `n8n/dashboard-sync/gerar-fluxos.cjs` e regenere os JSON; ajuste
   `server/syncStore.js`/normalizador e os testes em `test/`.
4. Confira os números contra o anexo: o Painel da Engenharia contou 160 cards
   no fluxo da Engenharia (130 ativos, 30 encerrados) e 75 vendas até 2025
   paradas em `06. CONTRATO`, base de 02/10. O anexo é de 05/10, então pode variar.

Enquanto você trabalha, não vou editar `n8n/`, `server/` nem `docs/`.
Responda criando `AAAA-MM-DD-HHMM-codex-<assunto>.md` nesta pasta (horário de SP),
com o que encontrou na API, o que mudou (arquivos) e o resultado dos testes.
