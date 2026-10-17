-- =============================================================================
-- Dashboard Groner CRM: tabela única de estado no Supabase
-- Substitui o Upstash Redis (prefixos groner-dashboard:sync:v1 e
-- groner-dashboard:engenharia:v1). Desenho completo em docs/SUPABASE-DASHBOARD.md.
--
-- Como usar: cole este arquivo inteiro no SQL Editor do Supabase e clique em Run.
-- O script é idempotente (pode rodar mais de uma vez) e só cria/atualiza objetos
-- próprios do dashboard: a tabela "DASHBOARD-GRONNER-CRM" e as funções
-- dashboard_crm_*. Nenhuma tabela do GronerZap/Naya é tocada.
--
-- Segurança: RLS ligada SEM nenhuma policy e privilégios revogados de anon e
-- authenticated. Só a chave secreta (papel service_role, que ignora RLS)
-- consegue ler ou escrever. Os registros contêm dados pessoais de clientes.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Tabela
--    Cada linha é um item de estado identificado por (tipo, entidade, chave).
--    tipo:
--      registro   registro normalizado (dados) + hash do conteúdo + ativo
--      historico  histórico de mudança de etapa de um projeto (dados = array)
--      lote       lote de carga completa (dados = {runId, ..., items, hashes})
--      resultado  resposta idempotente de um lote ou de um incremental
--      final      resposta idempotente de uma finalização
--      estado     current (manifesto), status e cursor de cada entidade
--      trava      trava com expiração (dados = {dono})
--      acao       ação combinada ativa de um card da Engenharia
--      acao_log   últimas 20 versões da ação de um card (dados = array)
--      config     configuração de prazos da Engenharia
--    entidade: projetos | tarefas | propostas | vendas | engenharia
-- -----------------------------------------------------------------------------
create table if not exists public."DASHBOARD-GRONNER-CRM" (
  tipo          text        not null,
  entidade      text        not null,
  chave         text        not null,
  dados         jsonb       not null default '{}'::jsonb,
  hash          text,
  ativo         boolean     not null default true,
  expira_em     timestamptz,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint "DASHBOARD-GRONNER-CRM_pkey" primary key (tipo, entidade, chave),
  constraint dashboard_gronner_crm_tipo_chk check (tipo in (
    'registro', 'historico', 'lote', 'resultado', 'final', 'estado', 'trava',
    'acao', 'acao_log', 'config'
  )),
  constraint dashboard_gronner_crm_entidade_chk check (entidade in (
    'projetos', 'tarefas', 'propostas', 'vendas', 'engenharia'
  )),
  constraint dashboard_gronner_crm_chave_chk check (char_length(chave) between 1 and 200)
);

comment on table public."DASHBOARD-GRONNER-CRM" is
  'Estado do dashboard Groner CRM (sincronização e Engenharia). Acesso só pela chave secreta. Ver docs/SUPABASE-DASHBOARD.md no repositório groner-mcp.';

-- Leitura dos registros ativos de uma entidade, paginada por chave.
create index if not exists dashboard_gronner_crm_ativos_idx
  on public."DASHBOARD-GRONNER-CRM" (entidade, chave)
  where tipo = 'registro' and ativo;

-- Limpeza dos itens com validade.
create index if not exists dashboard_gronner_crm_expira_idx
  on public."DASHBOARD-GRONNER-CRM" (expira_em)
  where expira_em is not null;

-- -----------------------------------------------------------------------------
-- 2. Carimbo de atualização (atualizado_em sempre do servidor; criado_em fixo)
-- -----------------------------------------------------------------------------
create or replace function public.dashboard_crm_tocar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  if tg_op = 'UPDATE' then
    new.criado_em := old.criado_em;
  end if;
  return new;
end;
$$;

drop trigger if exists dashboard_crm_tocar on public."DASHBOARD-GRONNER-CRM";
create trigger dashboard_crm_tocar
  before insert or update on public."DASHBOARD-GRONNER-CRM"
  for each row execute function public.dashboard_crm_tocar();

-- -----------------------------------------------------------------------------
-- 3. Segurança: RLS sem policy e nenhum privilégio para anon/authenticated
-- -----------------------------------------------------------------------------
alter table public."DASHBOARD-GRONNER-CRM" enable row level security;

revoke all on table public."DASHBOARD-GRONNER-CRM" from public, anon, authenticated;
grant select, insert, update, delete on table public."DASHBOARD-GRONNER-CRM" to service_role;

-- -----------------------------------------------------------------------------
-- 4. Limpeza de itens expirados (travas, lotes, resultados e finais)
--    Chamada pela finalização e, opcionalmente, pelo adaptador de tempos em tempos.
-- -----------------------------------------------------------------------------
create or replace function public.dashboard_crm_limpar_expirados()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_removidos integer;
begin
  delete from public."DASHBOARD-GRONNER-CRM"
   where expira_em is not null
     and expira_em < now();
  get diagnostics v_removidos = row_count;
  return v_removidos;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Trava com expiração (equivale a SET NX EX do Redis)
--    Pega a trava se estiver livre, vencida ou já for do mesmo dono (renova).
--    Retorna {"ok": true|false, "dono": <dono atual>}. Relógio do servidor.
-- -----------------------------------------------------------------------------
create or replace function public.dashboard_crm_travar(
  p_entidade text,
  p_chave    text,
  p_dono     text,
  p_segundos integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dono text;
begin
  if p_entidade is null or p_entidade not in ('projetos', 'tarefas', 'propostas', 'vendas', 'engenharia') then
    raise exception using errcode = 'PT400', message = 'Entidade inválida';
  end if;
  if p_chave is null or char_length(p_chave) not between 1 and 200
     or p_dono is null or char_length(p_dono) not between 1 and 200 then
    raise exception using errcode = 'PT400', message = 'Trava inválida';
  end if;
  if p_segundos is null or p_segundos < 1 or p_segundos > 3600 then
    raise exception using errcode = 'PT400', message = 'Validade da trava inválida';
  end if;

  insert into public."DASHBOARD-GRONNER-CRM" as t (tipo, entidade, chave, dados, expira_em)
  values ('trava', p_entidade, p_chave, jsonb_build_object('dono', p_dono),
          now() + make_interval(secs => p_segundos))
  on conflict (tipo, entidade, chave) do update
     set dados = excluded.dados,
         expira_em = excluded.expira_em
   where t.expira_em is null
      or t.expira_em <= now()
      or t.dados->>'dono' = p_dono
  returning t.dados->>'dono' into v_dono;

  if v_dono is not null then
    return jsonb_build_object('ok', true, 'dono', p_dono);
  end if;

  select t.dados->>'dono' into v_dono
    from public."DASHBOARD-GRONNER-CRM" t
   where t.tipo = 'trava' and t.entidade = p_entidade and t.chave = p_chave;
  return jsonb_build_object('ok', false, 'dono', v_dono);
end;
$$;

-- Solta a trava somente se ainda for do mesmo dono. Retorna true se soltou.
create or replace function public.dashboard_crm_liberar(
  p_entidade text,
  p_chave    text,
  p_dono     text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public."DASHBOARD-GRONNER-CRM"
   where tipo = 'trava'
     and entidade = p_entidade
     and chave = p_chave
     and dados->>'dono' = p_dono;
  return found;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Finalização de carga completa (equivale ao MULTI/EXEC do Redis)
--    Tudo numa transação: confere os lotes, publica os registros (só regrava os
--    que mudaram de hash), desativa os que sumiram (soft delete), grava
--    manifesto/status/final, apaga os lotes e solta a trava de atividade.
--    Idempotente: a mesma finalização devolve o mesmo resultado por 2 dias.
--    Erros de negócio voltam como HTTP 400/409 (SQLSTATE PT400/PT409).
-- -----------------------------------------------------------------------------
create or replace function public.dashboard_crm_finalizar(
  p_entidade       text,
  p_run_id         text,
  p_run_started_at text,
  p_batch_count    integer,
  p_expected_total integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_final          jsonb;
  v_atual          jsonb;
  v_manifesto      jsonb;
  v_chaves         text[];
  v_ids            text[];
  v_lotes          integer;
  v_recebidos      bigint;
  v_inconsistentes integer;
  v_distintos      integer;
  v_soft           integer;
  v_inseridos      bigint;
  v_atualizados    bigint;
  v_iguais         bigint;
  v_inicio         timestamptz;
  v_fim            text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  -- Validação (mesmas regras de validateFinalize em server/syncStore.js)
  if p_entidade is null or p_entidade not in ('projetos', 'tarefas', 'propostas', 'vendas') then
    raise exception using errcode = 'PT400', message = 'Entidade de sincronização desconhecida';
  end if;
  if p_run_id is null or p_run_id !~* '^[a-z]+-[0-9TZ]+$' then
    raise exception using errcode = 'PT400', message = 'runId inválido';
  end if;
  if p_batch_count is null or p_batch_count < 1 then
    raise exception using errcode = 'PT400', message = 'batchCount inválido';
  end if;
  if p_expected_total is null or p_expected_total < 0 then
    raise exception using errcode = 'PT400', message = 'expectedTotal inválido';
  end if;
  begin
    v_inicio := p_run_started_at::timestamptz;
  exception when others then
    raise exception using errcode = 'PT400', message = 'runStartedAt inválido';
  end;

  -- Uma finalização por entidade de cada vez
  perform pg_advisory_xact_lock(hashtext('DASHBOARD-GRONNER-CRM:finalizar:' || p_entidade));

  -- Idempotência
  select t.dados into v_final
    from public."DASHBOARD-GRONNER-CRM" t
   where t.tipo = 'final' and t.entidade = p_entidade and t.chave = p_run_id
     and (t.expira_em is null or t.expira_em > now());
  if v_final is not null then
    return v_final;
  end if;

  -- Não publica por cima de uma carga mais nova
  select t.dados into v_atual
    from public."DASHBOARD-GRONNER-CRM" t
   where t.tipo = 'estado' and t.entidade = p_entidade and t.chave = 'current';
  if v_atual is not null and (v_atual->>'runStartedAt')::timestamptz > v_inicio then
    raise exception using errcode = 'PT409', message = 'Existe uma sincronização mais nova já publicada';
  end if;

  -- Lotes esperados: "<runId>:1" .. "<runId>:<batchCount>"
  v_chaves := array(select p_run_id || ':' || g from generate_series(1, p_batch_count) as g);

  select count(*),
         coalesce(sum(jsonb_array_length(t.dados->'items')), 0),
         count(*) filter (where
              t.dados->>'runId' is distinct from p_run_id
           or t.dados->>'entity' is distinct from p_entidade
           or (t.dados->>'batchIndex')::integer is distinct from split_part(t.chave, ':', 2)::integer
           or (t.dados->>'batchCount')::integer is distinct from p_batch_count
           or (t.dados->>'expectedTotal')::integer is distinct from p_expected_total)
    into v_lotes, v_recebidos, v_inconsistentes
    from public."DASHBOARD-GRONNER-CRM" t
   where t.tipo = 'lote' and t.entidade = p_entidade and t.chave = any(v_chaves)
     and (t.expira_em is null or t.expira_em > now());

  if v_lotes <> p_batch_count then
    raise exception using errcode = 'PT409', message = 'Nem todos os lotes foram recebidos';
  end if;
  if v_recebidos <> p_expected_total or v_inconsistentes > 0 then
    raise exception using errcode = 'PT409', message = 'Carga incompleta ou metadados inconsistentes';
  end if;

  v_ids := array(
    select item->>'id'
      from public."DASHBOARD-GRONNER-CRM" l
      cross join lateral jsonb_array_elements(l.dados->'items') as item
     where l.tipo = 'lote' and l.entidade = p_entidade and l.chave = any(v_chaves)
  );
  select count(distinct x) into v_distintos from unnest(v_ids) as x;
  if v_distintos <> cardinality(v_ids) then
    raise exception using errcode = 'PT409', message = 'IDs duplicados entre lotes';
  end if;

  -- Publica os registros; linhas com o mesmo hash e já ativas não são regravadas
  insert into public."DASHBOARD-GRONNER-CRM" as r (tipo, entidade, chave, dados, hash, ativo, expira_em)
  select 'registro', p_entidade, item->>'id', item, l.dados->'hashes'->>(item->>'id'), true, null
    from public."DASHBOARD-GRONNER-CRM" l
    cross join lateral jsonb_array_elements(l.dados->'items') as item
   where l.tipo = 'lote' and l.entidade = p_entidade and l.chave = any(v_chaves)
  on conflict (tipo, entidade, chave) do update
     set dados = excluded.dados,
         hash = excluded.hash,
         ativo = true,
         expira_em = null
   where r.hash is distinct from excluded.hash
      or not r.ativo;

  -- Soft delete: o que estava ativo e não veio nesta carga
  update public."DASHBOARD-GRONNER-CRM" r
     set ativo = false
   where r.tipo = 'registro' and r.entidade = p_entidade and r.ativo
     and r.chave <> all(v_ids);
  get diagnostics v_soft = row_count;

  -- Totais calculados em cada lote (resultados "lote:<runId>:<n>")
  select coalesce(sum((t.dados->>'inserted')::bigint), 0),
         coalesce(sum((t.dados->>'updated')::bigint), 0),
         coalesce(sum((t.dados->>'unchanged')::bigint), 0)
    into v_inseridos, v_atualizados, v_iguais
    from public."DASHBOARD-GRONNER-CRM" t
   where t.tipo = 'resultado' and t.entidade = p_entidade
     and t.chave = any(array(select 'lote:' || c from unnest(v_chaves) as c));

  v_manifesto := jsonb_build_object(
    'entity', p_entidade,
    'runId', p_run_id,
    'runStartedAt', p_run_started_at,
    'finishedAt', v_fim,
    'batchCount', p_batch_count,
    'expectedTotal', p_expected_total
  );
  v_final := v_manifesto || jsonb_build_object(
    'ok', true,
    'inserted', v_inseridos,
    'updated', v_atualizados,
    'unchanged', v_iguais,
    'softDeleted', v_soft,
    'activeTotal', cardinality(v_ids)
  );

  insert into public."DASHBOARD-GRONNER-CRM" as t (tipo, entidade, chave, dados, hash, ativo, expira_em)
  values ('estado', p_entidade, 'current', v_manifesto, null, true, null),
         ('estado', p_entidade, 'status',  v_final,     null, true, null),
         ('final',  p_entidade, p_run_id,  v_final,     null, true, now() + interval '2 days')
  on conflict (tipo, entidade, chave) do update
     set dados = excluded.dados,
         expira_em = excluded.expira_em;

  -- Os lotes desta carga e da carga anterior não são mais necessários
  delete from public."DASHBOARD-GRONNER-CRM" t
   where t.tipo = 'lote' and t.entidade = p_entidade
     and (t.chave = any(v_chaves)
          or (v_atual is not null
              and v_atual->>'runId' is distinct from p_run_id
              and split_part(t.chave, ':', 1) = v_atual->>'runId'));

  -- Solta a trava de atividade se for desta carga
  delete from public."DASHBOARD-GRONNER-CRM" t
   where t.tipo = 'trava' and t.entidade = p_entidade and t.chave = 'atividade'
     and t.dados->>'dono' = 'full:' || p_run_id;

  perform public.dashboard_crm_limpar_expirados();

  return v_final;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Ação combinada da Engenharia (equivale a HSET + LPUSH + LTRIM)
--    Grava a ação ativa do card e põe a versão no topo do histórico (máx. 20).
-- -----------------------------------------------------------------------------
create or replace function public.dashboard_crm_salvar_acao(
  p_card     text,
  p_registro jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_card is null or p_card !~ '^[1-9][0-9]{0,11}$' then
    raise exception using errcode = 'PT400', message = 'Card inválido';
  end if;
  if p_registro is null or jsonb_typeof(p_registro) <> 'object' then
    raise exception using errcode = 'PT400', message = 'Ação inválida';
  end if;

  insert into public."DASHBOARD-GRONNER-CRM" as t (tipo, entidade, chave, dados)
  values ('acao', 'engenharia', p_card, p_registro)
  on conflict (tipo, entidade, chave) do update
     set dados = excluded.dados;

  insert into public."DASHBOARD-GRONNER-CRM" as t (tipo, entidade, chave, dados)
  values ('acao_log', 'engenharia', p_card, jsonb_build_array(p_registro))
  on conflict (tipo, entidade, chave) do update
     set dados = (
       select coalesce(jsonb_agg(e.v order by e.n), '[]'::jsonb)
         from jsonb_array_elements(excluded.dados || t.dados) with ordinality as e(v, n)
        where e.n <= 20
     );

  return p_registro;
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. Funções: ninguém além da chave secreta pode executar
-- -----------------------------------------------------------------------------
revoke all on function public.dashboard_crm_tocar() from public, anon, authenticated;
revoke all on function public.dashboard_crm_limpar_expirados() from public, anon, authenticated;
revoke all on function public.dashboard_crm_travar(text, text, text, integer) from public, anon, authenticated;
revoke all on function public.dashboard_crm_liberar(text, text, text) from public, anon, authenticated;
revoke all on function public.dashboard_crm_finalizar(text, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.dashboard_crm_salvar_acao(text, jsonb) from public, anon, authenticated;

grant execute on function public.dashboard_crm_limpar_expirados() to service_role;
grant execute on function public.dashboard_crm_travar(text, text, text, integer) to service_role;
grant execute on function public.dashboard_crm_liberar(text, text, text) to service_role;
grant execute on function public.dashboard_crm_finalizar(text, text, text, integer, integer) to service_role;
grant execute on function public.dashboard_crm_salvar_acao(text, jsonb) to service_role;

commit;

-- Faz a API de dados (PostgREST) enxergar a tabela e as funções novas na hora.
notify pgrst, 'reload schema';

-- Conferência (opcional): deve listar a tabela com RLS ligada e 0 policies.
-- select relname, relrowsecurity,
--        (select count(*) from pg_policies where tablename = 'DASHBOARD-GRONNER-CRM') as policies
--   from pg_class where relname = 'DASHBOARD-GRONNER-CRM';
