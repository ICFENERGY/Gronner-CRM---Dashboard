# Formato de Deals produzido pelo n8n

## Decisão

O n8n deve usar o endpoint de upsert do dashboard como destino principal. O
`Deals.xlsx` pode ser lido de SharePoint/OneDrive como fonte complementar e
guardado como trilha de auditoria, mas não deve ser a fonte de leitura do
dashboard. A API `/Projeto` continua sendo a fonte de funil, status e datas de
status; o export fornece os campos operacionais que a API atual não expõe.

Não há, no repositório, credencial ou contrato verificável de endpoint de
detalhes/campos personalizados do Groner. Até uma chamada autenticada confirmar
essa capacidade, o fluxo deve aceitar o export como fallback explícito, sem
inventar uma rota de API.

## Aba e grain

- Aba: `Deals`.
- Uma linha por card/projeto.
- Chave: `Código`, igual ao `id` de `/Projeto`.
- Datas: texto ISO `AAAA-MM-DD`; datas anteriores a 1950 e sentinelas viram
  vazio.
- Números: células numéricas, usando ponto decimal no valor serializado.
- A base completa é mantida e `No fluxo da Engenharia` permite o filtro sem
  descartar cards fora da Engenharia.

## Colunas, na ordem exata

```text
Código, Etapa, Status, Cidade, Estado, Concessionária, Consumo,
Proposta Aceita Potência, Proposta Aceita Geração mensal, Proposta Aceita Valor,
Data da venda, Data de atualização, Previsão de fechamento,
Data de aceite da proposta, Técnico, Projetista, Homologador, Vendedor,
Tipo de Telhado, Fase energética, Tipo de Edificação,
Código da unidade consumidora, Data de início da instalação,
Data de término da instalação, Data de Assinatura do Contrato,
URL do monitoramento, Modelo do monitoramento,
Data de término da garantia da instalação, Quantidade de propostas,
Marco, Momento, Dono nominal, Dias sem atualização, Dias desde a venda,
Data de entrada no status, No fluxo da Engenharia
```

As colunas pessoais e sensíveis são excluídas: contato, e-mail, celular,
documento, WhatsApp Lid, senha, renda, patrimônio, bancos, logradouro, número
e CEP.

## Derivações

- `Marco`: status normalizado no mapa de 16 marcos; `G6` é o marco 4 e
  `DOSSIE ENVIADO` é `FIM`. O marco 8 não possui status no Groner.
- `Momento`: `pré-venda` para 1–4/G6, `implantação` para 5–12 e `gestão da
  usina` para 13–16/FIM.
- `Dono nominal`: primeiro valor entre Técnico, Projetista e Homologador.
- `Dias sem atualização`: dias desde `Data de atualização`.
- `Dias desde a venda`: dias desde `Data da venda`.
- `Data de entrada no status`: `dataUltimoStatus` da API; no exemplo gerado
  somente a partir do export, `Data de atualização` é uma estimativa.
- `No fluxo da Engenharia`: `sim` quando a Etapa começa por `04.`, `06.` a
  `11.`, exceto Etapa `04.` só com Status `FUNIL ENGENHARIA - CRIAR PROP`;
  caso contrário `não`.

## Histórico

O `syncStore` registra, por mudança de status, `{ id, statusAnterior,
statusNovo, em: runStartedAt }`. Na leitura, `historicoStatus` e a data de
entrada do marco são expostos; quando não há histórico, usa-se
`dataUltimoStatus` e `dataEntradaMarcoEstimada=true`.

## Validação do anexo de 05/10/2026

### Correção de revisão (12:28)

Os endpoints `/Projeto/{id}` e `/CampoPersonalizado/Projeto/{id}/Agrupado`
são a fonte principal de detalhes/campos personalizados, a confirmar na
primeira execução com credencial do tenant; o export é fallback para campos
ausentes.

`Marco` usa strings `'1'` a `'16'`, `'G6'` e `'FIM'`. G6 é um marco próprio de
5 dias. `DOSSIE ENVIADO` deriva para `FIM` e `Momento=encerrado`.

`No fluxo da Engenharia` só é `sim` quando a etapa é 04 (com o status exato
`FUNIL ENGENHARIA - CRIAR PROP`) ou 06 a 11, e o status está no mapa de
marcos. No anexo, isso resulta em 160 cards: 130 ativos e 30 em `FIM`; ficam
fora 75 `VENDA REALIZADA` e 4 `PERDIDO CONTRATO` de `06. CONTRATO`.

O anexo possui 5.703 linhas de dados e 71 colunas. O arquivo de exemplo
`conversa-claude-codex/anexos/Deals-formato-n8n.xlsx` possui 5.703 linhas e 36
colunas permitidas, sem colunas pessoais. A contagem calculada pelo filtro
derivado foi 239 cards no fluxo da Engenharia; ela não deve ser comparada como
igual ao número histórico de 160 sem aplicar também os filtros/população do
Painel da Engenharia de 02/10. A diferença é documentada para reconciliação,
não mascarada no arquivo.
