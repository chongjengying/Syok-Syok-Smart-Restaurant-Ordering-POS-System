begin;

do $body$
declare definition text;
begin
  select pg_get_functiondef('public.begin_authenticated_terminal_staff_session(uuid)'::regprocedure) into definition;
  definition := replace(
    definition,
    $$or st.company_id<>t.company_id or st.branch_id<>t.branch_id or st.legacy_profile_id is null$$,
    $$or st.company_id<>t.company_id or not (st.branch_id=t.branch_id or exists (select 1 from public.staff_branch_assignments a where a.staff_id=st.legacy_profile_id and a.branch_id=t.branch_id and a.status='ACTIVE')) or st.legacy_profile_id is null$$
  );
  execute definition;
end $body$;

commit;
