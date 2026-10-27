begin;

do $$
declare
  definition text;
begin
  select pg_get_functiondef('public.create_terminal_activation_code(uuid,boolean)'::regprocedure)
    into definition;
  definition := replace(definition, 'now() + interval ''30 minutes''', 'now() + interval ''5 minutes''');
  execute definition;

  select pg_get_functiondef('public.activate_terminal_with_code(text,text)'::regprocedure)
    into definition;
  definition := replace(
    definition,
    '  if t.status in (''ARCHIVED'',''RETIRED'') or t.registration_status=''REVOKED'' then',
    '  select * into b from public.branches where id=t.branch_id;
  select * into co from public.companies where id=t.company_id;
  if co.status <> ''ACTIVE'' then raise exception ''COMPANY_INACTIVE''; end if;
  if b.status <> ''ACTIVE'' then raise exception ''BRANCH_INACTIVE''; end if;
  if t.status in (''ARCHIVED'',''RETIRED'') or t.registration_status=''REVOKED'' then'
  );
  execute definition;
end $$;

commit;
