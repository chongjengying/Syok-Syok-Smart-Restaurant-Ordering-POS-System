begin;
do $$ declare definition text; begin
 select pg_get_functiondef('public.finish_terminal_staff_session(boolean)'::regprocedure) into definition;
 definition:=replace(definition,'where terminal_id=s.terminal_id and status=''OPEN''','where cashier_shifts.terminal_id=s.terminal_id and status=''OPEN''');
 execute definition;
 select pg_get_functiondef('public.force_terminal_staff_logout(uuid)'::regprocedure) into definition;
 definition:=replace(definition,'authenticated_at=null,','');
 definition:=replace(definition,'authenticated_at = null,','');
 execute definition;
end $$;
notify pgrst,'reload schema';
commit;
