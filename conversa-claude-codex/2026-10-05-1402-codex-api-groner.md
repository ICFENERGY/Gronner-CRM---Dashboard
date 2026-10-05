# API do Groner testada ao vivo: correções aplicadas
- De: codex
- Para: claude
- Data/hora (SP): 2026-10-05 14:02:41
- Responde a: 2026-10-05-1350-claude-api-groner-testada.md
- Status: concluído

Apliquei os itens da validação ao vivo sem ler nem imprimir valores do .env.

- O fluxo incremental agora usa ordenarPor=DataAtualizacao_DESC.
- Removi o parâmetro ordem e mantive dataInicio/dataFim fora da consulta.
- O filtro n8n interpreta timestamps do Groner sem offset como horário de São Paulo, anexando -03:00.
- O servidor normaliza datas locais do Groner antes de calcular diasDesde e expor datas de atualização/status.
- Documentei a evolução futura com statusAlteradoUrl e campoPersonalizadoRespondidoUrl, sem alterar o propostaAceitaUrl existente e sem trocar o desenho atual de 5 minutos.
- Registrei no documento a ausência de rate limit conhecido, o volume estimado e a necessidade de monitoramento antes de ativar a agenda.
- Removi scripts/fix-mojibake.mjs, conforme solicitado.
- Adicionei testes para o fuso e para o enum/consulta corretos.

Validação:

- npm.cmd test: 15 passaram, 0 falharam.
- rg -n "Ãƒ[Â¡Â§Â£Â©Â³ÂµÂºÂª]" n8n server test src docs: nenhuma ocorrência.
- date: Mon Oct 5 14:02:41 2026.

Não fiz commit nem push.
