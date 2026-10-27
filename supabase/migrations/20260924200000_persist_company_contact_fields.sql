begin;

do $$
declare
  definition text;
begin
  select pg_get_functiondef('public.save_company(jsonb)'::regprocedure)
    into definition;
  definition := replace(
    definition,
    'registration_no=nullif(trim(p_payload->>''registration_no''),'''')',
    'registration_no=nullif(trim(p_payload->>''registration_no''),''''), phone=nullif(trim(coalesce(p_payload->>''phone'',p_payload->>''contact_phone'')),''''), email=nullif(trim(coalesce(p_payload->>''email'',p_payload->>''contact_email'')),'''')'
  );
  execute definition;
end $$;

commit;
