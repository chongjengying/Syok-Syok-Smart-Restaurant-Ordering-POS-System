begin;

do $$ declare definition text; begin
  select pg_get_functiondef('public.get_admin_staff_detail(uuid)'::regprocedure) into definition;
  definition:=replace(definition,'where s.company_id=st.company_id and (s.opened_by_staff_id',
    'where s.company_id=st.company_id and public.can_access_branch(s.branch_id) and (s.opened_by_staff_id');
  definition:=replace(definition,'where ss.staff_record_id=st.id and ss.company_id=st.company_id',
    'where ss.staff_record_id=st.id and ss.company_id=st.company_id and public.can_access_branch(ss.branch_id)');
  execute definition;
  select pg_get_functiondef('public.terminal_staff_access_reason(uuid,uuid)'::regprocedure) into definition;
  definition:=replace(definition,'  select * into t from public.pos_terminals',
    '  if not exists(select 1 from public.roles where id=st.role_id and is_active) then return ''STAFF_ROLE_INACTIVE''; end if;
  select * into t from public.pos_terminals');
  execute definition;
end $$;

commit;
