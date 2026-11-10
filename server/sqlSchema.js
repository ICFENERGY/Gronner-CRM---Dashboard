/**
 * Gera o SQL da tabela única e das funções dashboard_crm_* para um schema escolhido (DB_SCHEMA).
 * Parte de neon/dashboard-gronner-crm.sql (Postgres puro), que escreve tudo como public.X; as funções do
 * arquivo usam `set search_path = ''`, então toda referência é qualificada e a troca de `public.` pelo schema
 * cobre o arquivo inteiro.
 */

const NOME_SCHEMA = /^[a-z_][a-z0-9_]{0,62}$/

export function validarSchema(schema) {
  if (!NOME_SCHEMA.test(String(schema ?? ''))) throw new Error('Nome de schema inválido: use só letras minúsculas, números e _ (máx. 63).')
  return schema
}

/**
 * @param sqlBase conteúdo de neon/dashboard-gronner-crm.sql
 * @param schema nome do schema de destino
 * @returns SQL idempotente: cria o schema, a tabela e as funções nele, e fecha o acesso dos papéis públicos do Supabase
 */
export function sqlParaSchema(sqlBase, schema) {
  validarSchema(schema)
  const qualificado = `"${schema}".`
  const corpo = sqlBase.replaceAll('public.', qualificado)
  if (/\bpublic\./.test(corpo)) throw new Error('Sobrou referência a public. no SQL gerado.')
  const q = `"${schema}"`
  return `-- Gerado por server/sqlSchema.js para o schema ${schema}. Idempotente: pode rodar de novo.
create schema if not exists ${q};

${corpo}

-- Segurança (Supabase): a tabela guarda dados pessoais de clientes. RLS ligada sem nenhuma policy e acesso
-- fechado aos papéis da API pública (anon e authenticated). O servidor entra pelo papel dono do banco.
alter table ${q}."DASHBOARD-GRONNER-CRM" enable row level security;
do $seguranca$
declare papel text;
begin
  foreach papel in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = papel) then
      execute format('revoke all on schema ${q} from %I', papel);
      execute format('revoke all on all tables in schema ${q} from %I', papel);
      execute format('revoke all on all functions in schema ${q} from %I', papel);
    end if;
  end loop;
end
$seguranca$;
`
}
