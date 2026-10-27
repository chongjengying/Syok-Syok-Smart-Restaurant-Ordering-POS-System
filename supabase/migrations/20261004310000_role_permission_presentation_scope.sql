begin;
do $patch$ declare d text; begin
 select pg_get_functiondef('public.get_admin_staff_detail(uuid)'::regprocedure) into d;
 d:=replace(d,'from public.permissions pm)',
  'from public.permissions pm where pm.scope=''COMPANY_ASSIGNABLE'' and pm.is_active)');
 execute d;
 select pg_get_functiondef('public.begin_authenticated_terminal_staff_session(uuid)'::regprocedure) into d;
 d:=replace(d,'where rp.role_id=st.role_id)',
  'where rp.role_id=st.role_id and pm.scope=''COMPANY_ASSIGNABLE'' and pm.is_active)');
 execute d;
 select pg_get_functiondef('public.terminal_staff_access_reason(uuid,uuid)'::regprocedure) into d;
 d:=replace(d,'where id=st.role_id and is_active',
  'where id=st.role_id and company_id=st.company_id and scope=''COMPANY'' and is_active');
 execute d;
end $patch$;
commit;
