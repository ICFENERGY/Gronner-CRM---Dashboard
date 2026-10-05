# Arquitetura — Groner → Dashboard com upsert

## Objetivo

Atualizar `https://groner-crm-dashboard-ten.vercel.app/` duas vezes ao dia com
quatro rotinas independentes — Projetos, Tarefas, Propostas e Vendas — sem
duplicar registros e sem regravar linhas que não mudaram.

O projeto/negócio é a entidade central para responder: quem é o cliente, em
qual funil e etapa está, quem é o vendedor responsável e qual é o valor do
projeto. Tarefas e propostas se ligam por `projetoId`. Venda só se liga ao
projeto quando a API fornecer um identificador explícito; é proibido associar
por semelhança de nome.

## Estado confirmado em 05/10/2026

- O frontend publicado lê `GET /api/raw/projetos`, `/propostas`, `/tarefas` e
  `/vendas`.
- O botão **Atualizar dados** chama `GET /api/summary?refresh=1` e recarrega a
  página. Portanto, a coleta completa ainda acontece dentro do backend do
  dashboard.
- Não existe no bundle publicado uma chamada de escrita ou um endpoint de
  ingestão para o N8N.
- Os quatro endpoints atuais retornam, respectivamente, 5.701 projetos, 3.613
  propostas, 1.153 tarefas e 181 vendas. Esses números são somente a fotografia
  observada durante a inspeção, não metas nem constantes.

## Decisão sobre incrementalidade

A API documentada do Groner possui paginação e filtros de período, mas não
oferece um cursor uniforme e confiável de “alterado desde” para as quatro
entidades. Em particular, tarefas e vendas não expõem no conjunto já usado pelo
dashboard uma data de alteração suficiente para detectar toda edição.

Por isso, cada rotina faz uma leitura paginada completa da sua entidade. O
dashboard calcula um hash canônico e executa o `upsert` apenas quando o conteúdo
mudou. Isso entrega consistência sem transformar uma data de criação em cursor
de alteração.

Otimização futura, não necessária para a primeira versão: expor um manifesto
`id + sourceHash` para o N8N filtrar antes do envio. Não implementar antes de
medir necessidade; o primeiro contrato já evita escritas desnecessárias.

## Fluxos N8N

Arquivos em `n8n/dashboard-sync/`:

| Fluxo | Janela | Recurso Groner | Destino |
|---|---:|---|---|
| Sincronizar Projetos | 08:00 / 18:00 | `/Projeto` + `/Projeto/{id}` + `/CampoPersonalizado/Projeto/{id}/Agrupado` | `projetos` |
| Sincronizar Tarefas | 08:05 / 18:05 | `/Tarefa` | `tarefas` |
| Sincronizar Propostas | 08:10 / 18:10 | `/PreProposta` | `propostas` |
| Sincronizar Vendas | 08:15 / 18:15 | `/Venda` | `vendas` |

O escalonamento de cinco minutos evita quatro cargas simultâneas na API do
Groner e nos workers do N8N. As quatro continuam dentro das janelas das 08h e
18h. Todas as agendas permanecem desativadas até a API de ingestão e sua
credencial estarem em produção.

Cada rotina:

1. consulta o total com página de um item;
2. cria a lista de páginas de 500;
3. chama o subfluxo compartilhado uma vez por página, aguardando cada execução;
4. valida total, páginas e IDs duplicados;
5. divide a carga em lotes de 50;
6. envia os lotes para o endpoint autenticado de upsert;
7. valida todas as confirmações;
8. só então finaliza a carga, permitindo reconciliação de remoções.

As execuções não salvam entrada ou saída porque os payloads contêm dados
comerciais e identificadores de clientes.

## Contrato que o Claude deve implementar no dashboard

### Autenticação

Criar um segredo exclusivo, diferente do token do Groner e do segredo do
GronerZap. Sugestão:

- variável Vercel: `GRONER_SYNC_TOKEN`;
- credencial N8N: `Groner Dashboard - Sync`;
- header: `X-Groner-Sync-Token: <segredo>`;
- comparação em tempo constante;
- aceitar somente HTTPS, `Content-Type: application/json` e corpo limitado.

Nunca registrar o header nem o corpo completo. Registrar somente `runId`,
entidade, índice do lote, contagens, duração e erro sanitizado.

### POST `/api/sync/groner/:entity/batches`

Entidades válidas: `projetos`, `tarefas`, `propostas`, `vendas`. Qualquer outra
deve retornar 404/400.

Corpo:

```json
{
  "runId": "projetos-20261005T110000000Z",
  "runStartedAt": "2026-10-05T11:00:00.000Z",
  "entity": "projetos",
  "batchIndex": 1,
  "batchCount": 58,
  "expectedTotal": 5701,
  "items": []
}
```

Regras:

- máximo de 50 itens e limite de 6 MB no corpo;
- validar `entity` da URL contra o corpo;
- cada item precisa de `id` ou `Id` numérico;
- chave idempotente do lote: `(entity, runId, batchIndex)`;
- repetir o mesmo lote devolve a resposta anterior, sem contar duas vezes;
- passar cada item pelos mesmos normalizadores que hoje alimentam `/api/raw/*`;
- gerar `sourceHash = SHA-256(JSON canônico normalizado)`;
- chave do registro: `(tenant, entity, sourceId)`;
- inserir se não existe;
- atualizar o conteúdo somente se `sourceHash` mudou;
- marcar `lastSeenRunId = runId` mesmo quando o conteúdo não mudou;
- nunca apagar durante o processamento de um lote.

Resposta `200`:

```json
{
  "ok": true,
  "runId": "projetos-20261005T110000000Z",
  "entity": "projetos",
  "batchIndex": 1,
  "expectedTotal": 5701,
  "received": 100,
  "inserted": 2,
  "updated": 8,
  "unchanged": 90
}
```

### POST `/api/sync/groner/:entity/finalize`

Corpo:

```json
{
  "runId": "projetos-20261005T110000000Z",
  "runStartedAt": "2026-10-05T11:00:00.000Z",
  "entity": "projetos",
  "batchCount": 58,
  "expectedTotal": 5701,
  "inserted": 2,
  "updated": 8,
  "unchanged": 5691
}
```

Finalizar em transação somente se:

- todos os índices de `1..batchCount` foram aceitos;
- a soma de itens recebidos é igual a `expectedTotal`;
- nenhuma execução mais nova da mesma entidade já foi finalizada.

Depois dessas verificações, registros ativos da entidade cujo
`lastSeenRunId != runId` podem receber `deletedAt`/`active=false`. Isso é
remoção lógica: preservar histórico e permitir restauração se o registro
reaparecer. A mesma finalização repetida deve retornar sucesso idempotente.

Resposta deve incluir `inserted`, `updated`, `unchanged`, `softDeleted`,
`activeTotal`, `runId` e `finishedAt`.

## Modelo canônico de leitura

O backend deve preservar os nomes que o frontend publicado já consome. Campos
mínimos confirmados:

| Entidade | Chave | Campos necessários ao dashboard |
|---|---|---|
| Projetos | `id` | `nome`, `tipo`, `tipoLead`, `funil`, `etapa`, `marco`, `corEtapa`, `origemLead`, `vendedorResponsavel`, `dataInclusao`, `dataUltimaAtualizacao`, `dataUltimoStatus`, `dataEntradaMarco`, `dataEntradaMarcoEstimada`, `historicoStatus`, `previsaoFechamento`, `valorPrePropostaAceita`, `valorVenda`, `perda`, `consumo`, `qtdPrePropostas`, `cidade`, `estado`, `bairro`, `concessionaria`, `dataVenda`, `dataAceiteProposta`, `kwp`, `geracaoMensalPrevista`, `uc`, `tecnico`, `projetista`, `homologador`, `tipoTelhado`, `faseEnergetica`, `tipoEdificacao`, `dataInicioInstalacao`, `dataTerminoInstalacao`, `dataAssinaturaContrato`, `urlMonitoramento`, `modeloMonitoramento`, `dataTerminoGarantia` |
| Propostas | `id` | `projetoId`, `projeto`, `lead`, `statusProjeto`, `etapaProjeto`, `aceita`, `vendedorNome`, `dataInclusao`, `dataAlteracao`, `kwP`, `preco`, `precoOriginal`, `consumo`, `geracaoAnual`, `anoRetornoInvestimento`, `payBack` |
| Tarefas | `id` | `projetoId`, `projeto`, `lead`, `titulo`, `status`, `tipo`, `responsaveis`, `dataInclusao`, `dataInicial`, `dataEntrega`, `dataConclusao`, `prioridade`, `bloqueado`, `atrasada` |
| Vendas | `id` | `nome`, `vendedor`, `valorTotal`, `valorComissao`, `dataVenda`, `cicloVenda`, `origemNome`, `statusNome`, `cidade`, `estado`, `bairro`, `fornecedor`, `placa`, `inversor`, `lucro`, `lucroServico` |

Manter o registro bruto em armazenamento protegido pode ajudar a evoluir o
normalizador, mas `/api/raw/*` deve continuar retornando apenas o modelo já
normalizado, não o payload integral do fornecedor.

## Visão de cliente e relacionamentos

Para o detalhe solicitado pelo Fabio, criar no backend ou frontend uma visão
por projeto:

- cliente/projeto: `projetos.nome`;
- funil atual: `projetos.funil`;
- etapa atual: `projetos.etapa` e `corEtapa`;
- vendedor: `projetos.vendedorResponsavel`;
- valor corrente: preferir `valorVenda` quando maior que zero; senão
  `valorPrePropostaAceita`; senão a maior proposta ativa ligada por
  `projetoId`; exibir a origem do valor;
- propostas: ligação exata por `projetoId`;
- tarefas: ligação exata por `projetoId`;
- venda: ligação exata por identificador vindo da API. Sem identificador,
  apresentar a venda na visão geral, mas não inventar associação ao projeto.

Um cliente pode ter mais de um projeto. Portanto, não usar o nome do cliente
como chave única e não somar projetos distintos como se fossem um só negócio.

## Compatibilidade com o frontend atual

- Manter os GETs `/api/raw/*` com o mesmo formato para não quebrar as telas.
- Alterar `GET /api/summary?refresh=1` para apenas recalcular/invalidar os
  agregados a partir do armazenamento sincronizado. Ele não deve competir com
  o N8N fazendo outra coleta completa do Groner.
- Expor no resumo `sourceUpdatedAt`, `lastSuccessfulRunAt` por entidade e
  `syncStatus`. O botão deve mostrar claramente “dados atualizados em...” e um
  erro parcial quando uma entidade estiver atrasada.
- Os filtros por ano, vendedor e estado devem aplicar a mesma população aos
  cartões, funil, gráficos e tabelas.

## Ordem segura de implantação

1. Implementar armazenamento, normalizadores e endpoints no dashboard.
2. Adicionar testes de autenticação, repetição de lote, hash inalterado,
   atualização real, carga incompleta, finalização repetida e remoção lógica.
3. Fazer deploy do dashboard e criar `GRONER_SYNC_TOKEN` na Vercel.
4. Criar a credencial `Groner Dashboard - Sync` no N8N com restrição ao domínio
   `groner-crm-dashboard-ten.vercel.app`.
5. Publicar os cinco fluxos (quatro rotinas + subfluxo) ainda desativados.
6. Executar manualmente Projetos e reconciliar contagem/amostras com
   `/api/raw/projetos`.
7. Repetir exatamente a mesma execução lógica e confirmar `updated=0`.
8. Validar Tarefas, Propostas e Vendas da mesma forma.
9. Conferir visualmente todas as abas e filtros do dashboard.
10. Só então ativar as quatro agendas.

## Critérios de aceite

- uma repetição do mesmo lote não duplica nem altera contagens;
- uma carga idêntica resulta em zero atualizações de conteúdo;
- uma edição de funil/etapa/valor aparece após a próxima janela;
- uma falha no meio não remove registros;
- uma remoção só vira `softDeleted` após finalização completa;
- cada tela informa a última sincronização bem-sucedida;
- nenhuma execução do N8N persiste payload comercial;
- nenhum token aparece no Git, logs, respostas ou frontend.

## Formato do Deals produzido pelo n8n

O `Deals.xlsx` não é uma quinta entidade do dashboard. Quando `/Projeto` não
trouxer os campos operacionais, o n8n deve ler o export como fonte
complementar, manter somente a allowlist documentada em
`docs/FORMATO-DEALS-N8N.md` e anexar os campos ao item de `projetos`. O destino
principal é o endpoint de upsert; SharePoint/OneDrive serve como auditoria e
reprocessamento.

A base completa é preservada com a coluna `No fluxo da Engenharia` (`sim` ou
`não`). A aba é `Deals`, há uma linha por card, datas em `AAAA-MM-DD` e números
como células numéricas. A especificação mantém os nomes compatíveis com a
Pauta Diária: `Código`, `Etapa`, `Status`, `Cidade`, `Estado`, `Concessionária`,
`Proposta Aceita Potência`, `Data da venda`, `Data de atualização`, `Previsão de
fechamento`, `Técnico`, `Projetista`, `Homologador` e `Vendedor`.

O normalizador calcula `Marco`, `Momento`, `Dono nominal`, `Dias sem
atualização`, `Dias desde a venda` e `Data de entrada no status`. O
`syncStore` registra mudanças como `{ id, statusAnterior, statusNovo, em }` e
usa `dataUltimoStatus` como fallback estimado quando ainda não há histórico.

No repositório não há credencial nem contrato verificável para confirmar um
endpoint de detalhes/campos personalizados do Groner; por isso o fluxo não
inventa uma rota e usa o export até essa capacidade ser validada em ambiente
autenticado.

## Deals de Engenharia: campos, fontes e privacidade

O contrato de `projetos` usa uma allowlist operacional. O detalhe do projeto e
`/CampoPersonalizado/Projeto/{id}/Agrupado` sao consultados pelo subfluxo do
N8N para preencher cidade/estado, concessionaria, UC, potencia e geracao da
proposta aceita, valor, datas operacionais e o dono nominal. Se um campo nao
vier nesses endpoints, o sincronizador continua aceitando o valor do export
autorizado, casado por `Codigo = id`, sem incorporar outras colunas.

O export de Deals nao e armazenado no Git nem enviado inteiro ao dashboard.
Para uma operacao sem os endpoints de detalhe, o fallback e um fluxo de
ingestao do arquivo em OneDrive/SharePoint: ler somente as colunas da allowlist,
descartar sentinelas de datas anteriores a 1950, montar os mesmos lotes de
`projetos` com `sourceHash` e finalizar pela API existente. Nunca transportar
Contato E-mail, Contato Celular, nascimento, documento, WhatsApp Lid, senha,
renda, patrimonio, bancos ou endereco de logradouro/numero/CEP.

## Status do Groner -> marco

O campo `marco` e derivado de `etapa` pelos 16 marcos canonicos. O marco 8 e
reservado e nao possui status no Groner.

| Marco | Statuses |
|---:|---|
| 1 | `FUNIL ENGENHARIA - CRIAR PROP`, `CRIAR PROJETO->PROPOSTA`, `CRIAR ABORDAGEM` |
| 2 | `APROVAR PROPOSTA CRIADA` |
| 3 | `PENDENCIAS TECNICAS->PROJETOS`, `APROVACAO TECNICA - VENDA` |
| 4 | `PROPOSTA CRIADA APROVADA`, `AGUARDANDO ASSINATURA`, `DOCUMENTOS PENDENTES`, `PAGAMENTO REALIZADO` |
| 5 | `PIETA_CRIACAO DO PROJETO`, `PIETA_PARECER SOLICITADO` |
| 6 | `PENDENCIA DE HOMOLOGACAO`, `PENDENCIA ICF`, `PENDENCIA DOCUMENTAL/TECNICA`, `PARECER EMITIDO` |
| 7 | `PEDIDO ENTREGUE` |
| 9 | `INSTALADOR HOMOLOGADO`, `AGENDAR INSTALACAO` |
| 10 | `INSTALACAO AGENDADA` |
| 11 | `DIARIO DE OBRA / OBRA ANDAMENTO`, `PENDENCIA DE OBRA`, `PENDENCIA DE INSTALACAO` |
| 12 | `AGUARDANDO VISTORIA`, `PENDENCIA VIST. CONCESSIONARIA` |
| 13 | `RELOGIO TROCADO`, `INSTALACAO APP MONITORAMENTO` |
| 14 | `APP MONITOR INSTALADO` |
| 15 | `TERMO DE ACEITE`, `TERMO DE ACEITE ASSINADO` |
| 16 | `DOSSIE`, `FIM DOSSIE ENVIADO` |

O `syncStore` mantem o historico separado por projeto. Quando uma carga
recebida muda `etapa`, grava `{ id, statusAnterior, statusNovo, em }`, usando
`runStartedAt` como instante da observacao. Para o status atual sem evento
historico, `dataUltimoStatus` vira `dataEntradaMarco` com
`dataEntradaMarcoEstimada=true`. O historico so fica disponivel apos a carga
ser publicada e nao altera o `sourceHash` do registro.
