# Engenharia: Pauta Diária e Painel

Página **Engenharia** do dashboard (`#engenharia`, `#engenharia/painel`), feita a
partir dos dois painéis HTML do Fabio ("Pauta Diária da Engenharia" e "Painel da
Engenharia ICF Energy"). A diferença é a fonte: em vez de subir o `Deals.xlsx`,
os dados vêm do Groner sincronizado pelo n8n (a cada 5 minutos), e as ações
combinadas ficam gravadas no Upstash do dashboard.

## Onde está cada coisa

| Camada | Arquivo | Papel |
|---|---|---|
| Modelo | `shared/engenharia.js` (+ `.d.ts`) | 16 marcos, momentos, prazo proposto, papel, "como resolver", dependência, meta de entrega, limites do semáforo de parado. Usado pelo servidor e pela tela. |
| Status → marco | `server/mappers.js` (`marcoDoStatus`, `mapProjeto`) | Marco, momento, dono nominal, fluxo da Engenharia por card. |
| Cálculo | `server/engenharia.js` | Funções puras: entrada no marco (histórico), semáforo, projeção de entrega, prioridade da pauta, indicadores do Painel. |
| Gravação | `server/engenhariaStore.js` | Ações combinadas (1 ativa por card + últimas 20 versões) e prazos, no Upstash (`groner-dashboard:engenharia:v1:*`). |
| API | `server/engenhariaRoutes.js` | `GET /api/engenharia`, `PUT /acoes/:id`, `POST /acoes/:id/concluir`, `GET /acoes/:id/historico`, `PUT /prazos`. |
| Tela | `src/pages/EngenhariaPage.tsx`, `src/features/engenharia/` | `pauta/` (veredito, régua, grupos, card, ação, prazos), `painel/` (indicadores, fluxo, lista), `api.ts`, `tipos.ts`, `useEngenharia.ts`. |
| Testes | `test/engenharia.test.js` | Semáforo, entrega, kit paralelo, histórico, proposta aceita, validações e rotas. |

## Regras do semáforo (Pauta)

- **Atrasado**: dias no marco > prazo do marco; ou obra além da meta de entrega
  desde a venda; ou ação combinada vencida.
- **Em risco**: nos últimos 30% do prazo do marco (mínimo 1 dia); ou projeção de
  entrega acima da meta; ou ação vencendo hoje/amanhã.
- **Dias no marco**: desde a entrada no marco pelo histórico de status gravado
  pela sincronização. Só é exato quando o histórico tem a transição vinda de
  outro marco; antes disso usa `dataUltimoStatus` do Groner e a tela mostra "≈".
- **Projeção de entrega** (marcos G6 e 5–12): dias desde a venda + o que falta do
  marco atual + prazos dos marcos seguintes até o 12. O kit (marco 7) é trilha
  paralela: fica fora da soma e, quando o card está nele, a conta segue do 9.
- **Ordem da pauta**: ação vencida → atrasado sem plano → atrasado com plano →
  resto; dentro de cada grupo, o mais estourado e o de maior kWp primeiro.

## Universo

Cards com `noFluxoEngenharia` (etapas 04 com `FUNIL ENGENHARIA - CRIAR PROP` e
06–11, status no mapa de marcos). `FIM` (dossiê enviado) conta no Painel como
encerrado e não entra na Pauta. Em 05/10/2026: 163 cards (133 ativos, 30
encerrados), e 75 vendas antigas em `06. CONTRATO` ficam fora.

## Fontes de cada campo

- Responsáveis (Técnico, Projetista, Homologador) e data da venda: listagem do
  `/Projeto`. O Groner manda id `0` e "Sem …" quando vazio, e `0001-01-01` na
  venda; o `mapProjeto` trata como vazio.
- kWp, geração prevista e valor: detalhe/campos do projeto quando a
  sincronização traz; senão a **proposta aceita** mais recente
  (`PreProposta.aceita`, ligada por `projetoId`).
- Cidade, concessionária etc.: campos do projeto ou o `deals-enriquecido.json`.

## Gravação e acesso

- Leitura aberta, como o resto do dashboard. O card mostra só o código, sem o
  nome do cliente.
- Gravar ação exige o **código da equipe** (`ENGENHARIA_EQUIPE_TOKEN`); alterar
  prazos exige o **código de administração** (`ENGENHARIA_ADMIN_TOKEN`). Os dois
  vão no header `X-Engenharia-Token`. A tela pede o código uma vez e guarda no
  navegador; também pede o nome de quem registra (campo `por`).
- Sem Upstash na Vercel, a gravação responde 503 (nunca finge que salvou). Em
  desenvolvimento local sem Upstash, usa memória.

## Evoluções previstas

- Indicadores de prazo (entrega da solução, homologação, instalação,
  encerramento) a partir das passagens pelos marcos, quando houver histórico.
- Webhook `statusAlteradoUrl` do Groner para atualização imediata.
- Prazo da próxima ação como campo no Groner, substituindo a previsão de
  fechamento.
