begin;

do $$ declare definition text; begin
  select pg_get_functiondef('public.reassign_pos_terminal(uuid,uuid)'::regprocedure) into definition;
  definition:=replace(definition,'  previous:=t;',
    '  update public.terminal_device_assignments
  set status=''REVOKED'',revoked_at=now(),revoked_by=auth.uid(),revoke_reason=''TERMINAL_BRANCH_CHANGED''
  where terminal_id=t.id and status=''ACTIVE'';
  previous:=t;');
  execute definition;
end $$;

commit;
