begin;

do $$
declare definition text;
begin
  select pg_get_functiondef('public.activate_terminal_with_code(text,text)'::regprocedure)
    into definition;
  definition := replace(
    definition,
    'where id=t.id;
  update public.terminal_activation_codes set used_at=now() where id=c.id;',
    'where id=t.id returning * into t;
  update public.terminal_activation_codes set used_at=now() where id=c.id;'
  );
  execute definition;
end $$;

commit;
