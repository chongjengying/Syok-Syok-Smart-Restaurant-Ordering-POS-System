begin;
create or replace function public.get_branch_management(p_branch_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare b public.branches; settings jsonb;
begin
 if not public.can_access_branch(p_branch_id) or not public.has_pos_permission('branch.view') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 select * into b from public.branches where id=p_branch_id;
 if not found then raise exception 'BRANCH_NOT_FOUND'; end if;
 settings:=public.effective_branch_settings(b.id);
 return jsonb_build_object('branch',to_jsonb(b),'company',(select to_jsonb(c) from public.companies c where c.id=b.company_id),'settings',settings,
 'activeTerminalCount',(select count(*) from public.pos_terminals where branch_id=b.id and status='ACTIVE'),
 'activeStaffCount',(select count(*) from public.staff_branch_assignments a join public.profiles p on p.id=a.staff_id where a.branch_id=b.id and a.status='ACTIVE' and p.status='ACTIVE'),
 'terminals',(select coalesce(jsonb_agg(to_jsonb(t)-'device_identifier' order by t.terminal_code),'[]') from public.pos_terminals t where t.branch_id=b.id),
 'staff',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'assignmentId',a.id,'name',p.name,'email',p.email,'role',p.role_name,'status',a.status,'assignmentStatus',a.status,'isPrimary',a.is_primary,'assignedAt',a.assigned_at,'removedAt',a.removed_at,'pinStatus',coalesce(sc.status,'SETUP_REQUIRED'),'lastActive',(select max(last_activity_at) from public.terminal_staff_sessions where staff_id=p.id)) order by p.name),'[]') from public.staff_branch_assignments a join public.profiles p on p.id=a.staff_id left join public.staff_pin_credentials sc on sc.user_id=p.id where a.branch_id=b.id),
 'tables',(select coalesce(jsonb_agg(to_jsonb(t) order by t.table_number),'[]') from public.restaurant_tables t where t.branch_id=b.id),
 'openOrders',(select count(*) from public.orders where branch_id=b.id and status not in ('COMPLETED','CANCELLED') and payment_status<>'PAID'),
 'todayOrders',(select count(*) from public.orders where branch_id=b.id and (created_at at time zone (settings->>'timezone'))::date=(now() at time zone (settings->>'timezone'))::date),
 'audit',(select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc),'[]') from (select * from public.audit_logs where branch_id=b.id and public.has_pos_permission('audit.view') order by created_at desc limit 50) a));
end $$;
commit;
