begin;

do $$ declare definition text; begin
  select pg_get_functiondef('public.get_my_staff_session()'::regprocedure) into definition;
  if strpos(definition,'''branchId'',st.branch_id')=0 then raise exception 'STAFF_SESSION_CONTEXT_SHAPE_CHANGED'; end if;
  definition:=replace(definition,'''branchId'',st.branch_id','''branchId'',s.branch_id');
  execute definition;
end $$;

commit;
