begin;

-- Server-only approval identity resolution uses current tenant-owned role state.
create function public.profile_has_company_permission(p_profile uuid,p_company uuid,p_branch uuid,p_permission text) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(
  select 1 from public.profiles p
  left join public.staff st on st.legacy_profile_id=p.id and st.company_id=p.company_id
  join public.roles r on r.id=coalesce(st.role_id,p.role_id) and r.company_id=p.company_id and r.scope='COMPANY' and r.is_active
  join public.companies c on c.id=p.company_id and c.status='ACTIVE'
  join public.branches b on b.id=p_branch and b.company_id=c.id and b.status='ACTIVE'
  join public.role_permissions rp on rp.role_id=r.id
  join public.permissions pm on pm.id=rp.permission_id and pm.code=p_permission and pm.is_active and pm.scope='COMPANY_ASSIGNABLE'
  where p.id=p_profile and p.company_id=p_company and p.status='ACTIVE' and coalesce(st.active,true)
   and (p.branch_id=b.id or exists(select 1 from public.staff_branch_assignments a where a.staff_id=p.id and a.branch_id=b.id and a.status='ACTIVE'))
 )
$$;
revoke all on function public.profile_has_company_permission(uuid,uuid,uuid,text) from public,anon,authenticated;

do $$ declare definition text; old_check text; begin
 select pg_get_functiondef('public.place_order(jsonb,text,text,text,text)'::regprocedure) into definition;
 old_check:=E'if not exists (\n    select 1 from public.profiles\n    where id = current_user_id and status = \'ACTIVE\'\n      and role_name in (\'ADMIN\', \'MANAGER\', \'WAITER\', \'CASHIER\')\n  ) then raise exception \'INSUFFICIENT_PERMISSION\'; end if;';
 if strpos(definition,old_check)=0 then raise exception 'ORDER_PERMISSION_PATCH_TARGET_MISSING'; end if;
 definition:=replace(definition,old_check,'if not public.has_pos_permission(''order.create'') then raise exception ''INSUFFICIENT_PERMISSION'' using errcode=''42501''; end if;');
 execute definition;
 -- The unbound implementation is not an alternate authorization entry point.
 revoke all on function public.create_pos_order_unbound(jsonb,text,text,text,text) from public,anon,authenticated;

 select pg_get_functiondef('public.approve_order_void(uuid,uuid,uuid,text)'::regprocedure) into definition;
 definition:=replace(definition,' and role_name in (''ADMIN'', ''MANAGER'')','');
 definition:=replace(definition,'  if current_order.status not in',E'  if not public.profile_has_company_permission(p_requested_by,current_order.company_id,current_order.branch_id,\'order.view\') then raise exception \'REQUESTER_OUT_OF_SCOPE\' using errcode=\'42501\'; end if;\n  if not public.profile_has_company_permission(p_manager_id,current_order.company_id,current_order.branch_id,\'order.manage\') then raise exception \'MANAGER_UNAVAILABLE\' using errcode=\'42501\'; end if;\n  if current_order.status not in');
 execute definition;
 select pg_get_functiondef('public.approve_manual_order_discount(uuid,uuid,uuid,text,numeric,text)'::regprocedure) into definition;
 definition:=replace(definition,' and upper(role_name) in (''ADMIN'',''OWNER'',''MANAGER'')','');
 definition:=replace(definition,' if exists(select 1 from public.order_adjustments',E' if not public.profile_has_company_permission(p_requested_by,o.company_id,o.branch_id,\'discount.apply\') then raise exception \'REQUESTER_OUT_OF_SCOPE\' using errcode=\'42501\'; end if;\n if not public.profile_has_company_permission(p_manager_id,o.company_id,o.branch_id,\'discount.approve\') then raise exception \'MANAGER_UNAVAILABLE\' using errcode=\'42501\'; end if;\n if o.payment_status=\'PAID\' or o.status in (\'COMPLETED\',\'CANCELLED\',\'REFUNDED\') then raise exception \'ORDER_NOT_EDITABLE\'; end if;\n if exists(select 1 from public.order_adjustments');
 execute definition;
end $$;
notify pgrst,'reload schema';
commit;
