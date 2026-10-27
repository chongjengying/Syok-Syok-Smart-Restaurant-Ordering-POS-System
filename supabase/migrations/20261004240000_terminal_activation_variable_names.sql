begin;
do $$ declare definition text; begin
 select pg_get_functiondef('public.activate_terminal_with_code(text,text,text)'::regprocedure) into definition;
 definition:=replace(definition,'terminal_id uuid;','bound_terminal_id uuid;');
 definition:=replace(definition,'terminal_id:=(result','bound_terminal_id:=(result');
 definition:=replace(definition,'activate_terminal_with_code.terminal_id','bound_terminal_id');
 execute definition;
end $$;
notify pgrst,'reload schema';
commit;
