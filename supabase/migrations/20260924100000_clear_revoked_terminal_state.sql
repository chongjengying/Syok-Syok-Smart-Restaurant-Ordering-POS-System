begin;

do $$
declare definition text;
begin
  select pg_get_functiondef('public.transition_pos_terminal(uuid,text,text)'::regprocedure)
    into definition;
  definition := replace(
    definition,
    '  if action in (''DEACTIVATE'',''REVOKE'',''RETIRE'') then
    update public.terminal_staff_sessions',
    '  if action in (''REVOKE'',''RETIRE'') then
    update public.terminal_activation_codes
      set used_at=coalesce(used_at,now()), display_code=null
      where terminal_id=t.id and used_at is null;
  end if;

  if action in (''DEACTIVATE'',''REVOKE'',''RETIRE'') then
    update public.terminal_staff_sessions'
  );
  execute definition;
end $$;

commit;
