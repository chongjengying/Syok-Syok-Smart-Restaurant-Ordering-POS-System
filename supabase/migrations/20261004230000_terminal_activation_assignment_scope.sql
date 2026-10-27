begin;
do $$ declare definition text; begin
 select pg_get_functiondef('public.activate_terminal_with_code(text,text,text)'::regprocedure) into definition;
 definition:=replace(definition,'d.terminal_id=terminal_id','d.terminal_id=activate_terminal_with_code.terminal_id');
 execute definition;
end $$;
notify pgrst,'reload schema';
commit;
