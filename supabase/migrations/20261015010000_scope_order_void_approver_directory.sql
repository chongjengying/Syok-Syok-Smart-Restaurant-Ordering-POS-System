begin;

-- The admin void dialog has an Auth session, not a terminal staff session.
-- Resolve eligible approvers for the order without exposing staff from other companies.
create function public.list_order_void_approvers(p_order_id uuid)
returns table(id uuid, name text, role text)
language sql stable security definer set search_path=public as $$
  select s.id, s.name::text, r.name::text
  from public.orders o
  join public.branches b on b.id=o.branch_id
  join public.staff s on s.company_id=b.company_id
  join public.profiles approver on approver.id=s.legacy_profile_id
  join public.roles r on r.id=s.role_id
  join public.staff_pin_credentials_v2 pin on pin.staff_id=s.id
  where o.id=p_order_id
    and b.company_id=public.current_user_company_id()
    and public.can_access_branch(o.branch_id)
    and public.has_pos_permission('order.view')
    and s.active and approver.status='ACTIVE' and r.is_active
    and pin.pin_hash is not null and pin.status in ('ACTIVE','TEMPORARY_RESET')
    and public.staff_record_has_branch(s.id,o.branch_id)
    and public.profile_has_company_permission(s.legacy_profile_id,b.company_id,o.branch_id,'order.manage')
  order by s.name,s.id;
$$;

revoke all on function public.list_order_void_approvers(uuid) from public,anon;
grant execute on function public.list_order_void_approvers(uuid) to authenticated;

commit;
