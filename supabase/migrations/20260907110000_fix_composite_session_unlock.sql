begin;
do $$ declare definition text; begin
 select pg_get_functiondef('public.verify_own_terminal_lock_pin(text)'::regprocedure) into definition;
 definition:=replace(definition,'public.current_terminal_staff_session() is not null','(public.current_terminal_staff_session()).id is not null');
 execute definition;
end $$;
commit;
