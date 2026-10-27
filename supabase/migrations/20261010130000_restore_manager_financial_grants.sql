begin;

-- These grants were defined for MANAGER before company-owned role copies.
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r
join public.permissions p on p.code in ('payment.refund','payment.void')
where r.name='MANAGER' and r.is_builtin
  and p.scope='COMPANY_ASSIGNABLE' and p.is_active
on conflict do nothing;

commit;
