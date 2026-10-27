begin;

alter table public.companies
  add column if not exists logo_storage_path text;

do $$
declare
  definition text;
begin
  select pg_get_functiondef('public.save_company(jsonb)'::regprocedure)
    into definition;
  definition := replace(
    definition,
    'contact_email=nullif(trim(coalesce(p_payload->>''email'',p_payload->>''contact_email'')),'''')',
    'contact_email=nullif(trim(coalesce(p_payload->>''email'',p_payload->>''contact_email'')),''''), logo_storage_path=nullif(trim(p_payload->>''logo_storage_path''),'''')'
  );
  execute definition;
end $$;

commit;
