begin;

do $$
declare definition text;
begin
  select pg_get_functiondef('public.activate_terminal_with_code(text,text)'::regprocedure)
    into definition;
  definition := replace(
    definition,
    'if t.status=''ARCHIVED'' or t.registration_status=''REVOKED'' then
    raise exception ''TERMINAL_RETIRED'';
  end if;',
    'if t.status=''ARCHIVED'' or t.registration_status=''REVOKED'' then
    raise exception ''TERMINAL_RETIRED'';
  end if;
  if t.registration_status=''UNREGISTERED'' and t.auth_user_id is not null then
    update public.pos_terminals
      set auth_user_id=null, authenticated_at=null, updated_at=now()
      where id=t.id;
    select * into t from public.pos_terminals where id=c.terminal_id for update;
  end if;'
  );
  execute definition;
end $$;

commit;
