\set ON_ERROR_STOP on
begin;

do $$
declare target_order uuid; target_staff uuid; target_profile uuid; own_admin uuid;
        manager_role uuid; foreign_company uuid; foreign_branch uuid; foreign_role uuid;
        foreign_admin uuid:=gen_random_uuid();
begin
  select o.id,s.id,s.legacy_profile_id,admin_profile.id,manager.id
    into target_order,target_staff,target_profile,own_admin,manager_role
  from public.orders o
  join public.branches b on b.id=o.branch_id and b.status='ACTIVE'
  join public.staff s on s.branch_id=b.id and s.active
  join public.roles cashier on cashier.id=s.role_id and cashier.name='CASHIER'
  join public.roles manager on manager.company_id=b.company_id and manager.name='MANAGER'
  join public.profiles admin_profile on admin_profile.company_id=b.company_id and admin_profile.role_name='ADMIN' and admin_profile.status='ACTIVE'
  where exists(select 1 from public.staff_pin_credentials_v2 pin where pin.staff_id=s.id and pin.pin_hash is not null)
  limit 1;
  if target_order is null then raise exception 'Local order, cashier, and company admin fixture required'; end if;
  update public.staff set role_id=manager_role where id=target_staff;
  update public.profiles set role_id=manager_role,role_name='MANAGER' where id=target_profile;
  select c.id,b.id,r.id into foreign_company,foreign_branch,foreign_role
  from public.companies c join public.branches b on b.company_id=c.id
  join public.roles r on r.company_id=c.id and r.name='ADMIN'
  where c.id<>(select company_id from public.branches where id=(select branch_id from public.orders where id=target_order))
    and c.status='ACTIVE' and b.status='ACTIVE' limit 1;
  if foreign_company is null then raise exception 'A second active local company is required'; end if;
  insert into auth.users(id) values(foreign_admin);
  update public.profiles set name='Foreign approver test',company_id=foreign_company,
    branch_id=foreign_branch,role_id=foreign_role,role_name='ADMIN',status='ACTIVE'
  where id=foreign_admin;
  perform set_config('app.approver_order',target_order::text,true);
  perform set_config('app.approver_staff',target_staff::text,true);
  perform set_config('app.approver_admin',own_admin::text,true);
  perform set_config('app.approver_foreign',foreign_admin::text,true);
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('app.approver_admin'),true);
do $$ begin
  if not exists(select 1 from public.list_order_void_approvers(current_setting('app.approver_order')::uuid)
    where id=current_setting('app.approver_staff')::uuid) then
    raise exception 'Eligible same-company manager was not listed';
  end if;
end $$;

select set_config('request.jwt.claim.sub',current_setting('app.approver_foreign'),true);
do $$ begin
  if exists(select 1 from public.list_order_void_approvers(current_setting('app.approver_order')::uuid)) then
    raise exception 'Foreign company can list order approvers';
  end if;
end $$;

set local role anon;
do $$ begin
  begin
    perform 1 from public.list_order_void_approvers(current_setting('app.approver_order')::uuid);
    raise exception 'Anonymous caller reached the approver directory';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
