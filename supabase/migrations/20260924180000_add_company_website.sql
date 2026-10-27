begin;

alter table public.companies
  add column if not exists website text;

do $$
declare
  definition text;
begin
  select pg_get_functiondef('public.save_company(jsonb)'::regprocedure)
    into definition;
  definition := replace(
    definition,
    'contact_email=nullif(trim(p_payload->>''contact_email''),''''), logo_url=nullif(trim(p_payload->>''logo_url''),'''')',
    'contact_email=nullif(trim(p_payload->>''contact_email''),''''), website=nullif(trim(p_payload->>''website''),''''), logo_url=nullif(trim(p_payload->>''logo_url''),'''')'
  );
  execute definition;
end $$;

commit;
