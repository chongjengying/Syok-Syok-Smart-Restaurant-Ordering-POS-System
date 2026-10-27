begin;

create or replace function public.get_admin_staff_detail(p_staff_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare st public.staff; result jsonb;
begin
  if not public.has_pos_permission('user.view') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into st from public.staff where id=p_staff_id and company_id=public.current_user_company_id();
  if not found then raise exception 'STAFF_NOT_FOUND'; end if;
  select jsonb_build_object(
    'id',st.id,'name',st.name,'staff_code',st.staff_code,'branch_id',st.branch_id,
    'status',case when st.active and p.status='ACTIVE' then 'ACTIVE' else 'INACTIVE' end,
    'email',p.email,'phone',p.phone,'role_name',r.name,'roleDescription',r.description,'roleActive',r.is_active,
    'pin_status',coalesce(pc.status,'SETUP_REQUIRED'),'pinLocked',coalesce(pc.locked_until>now(),false),
    'failedAttempts',coalesce(pc.failed_attempts,0),'pinChangedAt',pc.changed_at,
    'branches',coalesce((select jsonb_agg(jsonb_build_object('branch_id',b.id,'code',b.code,'name',b.name,'status',b.status,'is_primary',a.is_primary) order by b.name)
      from public.staff_branch_assignments a join public.branches b on b.id=a.branch_id and b.company_id=st.company_id
      where a.staff_id=st.legacy_profile_id and (a.status='ACTIVE' or (a.status='INACTIVE' and a.removed_at is null))),'[]'::jsonb),
    'permissions',coalesce((select jsonb_agg(jsonb_build_object('label',pm.description,'category',pm.module,'granted',r.is_active and exists(select 1 from public.role_permissions rp where rp.role_id=r.id and rp.permission_id=pm.id)) order by pm.module,pm.description) from public.permissions pm),'[]'::jsonb),
    'terminals',coalesce((select jsonb_agg(jsonb_build_object('name',t.name,'code',t.terminal_code,'branch',b.name,'accessMode',t.access_mode,'allowed',public.terminal_staff_access_reason(t.id,st.id) is null,'reason',public.terminal_staff_access_reason(t.id,st.id)) order by b.name,t.name)
      from public.pos_terminals t join public.branches b on b.id=t.branch_id
      where t.company_id=st.company_id and exists(select 1 from public.staff_branch_assignments a where a.staff_id=st.legacy_profile_id and a.branch_id=t.branch_id and a.status='ACTIVE')),'[]'::jsonb),
    'canViewShifts',public.has_pos_permission('cash.shift.view'),
    'shifts',case when public.has_pos_permission('cash.shift.view') then coalesce((select jsonb_agg(to_jsonb(sh) order by sh.opened_at desc) from (
      select s.id,s.shift_number,s.status,s.opened_at,s.closed_at,b.name as branch,t.name as terminal,t.terminal_code
      from public.cashier_shifts s join public.branches b on b.id=s.branch_id join public.pos_terminals t on t.id=s.terminal_id
      where s.company_id=st.company_id and (s.opened_by_staff_id=st.legacy_profile_id or exists(select 1 from public.terminal_staff_sessions ss where ss.id=s.opened_by_session_id and ss.staff_record_id=st.id))
      order by s.opened_at desc limit 50) sh),'[]'::jsonb) else '[]'::jsonb end,
    'canViewHistory',public.has_pos_permission('audit.view'),
    'loginHistory',case when public.has_pos_permission('audit.view') then coalesce((select jsonb_agg(to_jsonb(event) order by event.started_at desc) from (
      select ss.started_at,ss.ended_at,ss.status,b.name as branch,t.name as terminal,t.terminal_code
      from public.terminal_staff_sessions ss join public.branches b on b.id=ss.branch_id join public.pos_terminals t on t.id=ss.terminal_id
      where ss.staff_record_id=st.id and ss.company_id=st.company_id order by ss.started_at desc limit 50) event),'[]'::jsonb) else '[]'::jsonb end
  ) into result from public.profiles p join public.roles r on r.id=st.role_id
  left join public.staff_pin_credentials_v2 pc on pc.staff_id=st.id where p.id=st.legacy_profile_id;
  if result is null then raise exception 'STAFF_PROFILE_UNAVAILABLE'; end if;
  return result;
end $$;

revoke all on function public.get_admin_staff_detail(uuid) from public,anon;
grant execute on function public.get_admin_staff_detail(uuid) to authenticated;

commit;
