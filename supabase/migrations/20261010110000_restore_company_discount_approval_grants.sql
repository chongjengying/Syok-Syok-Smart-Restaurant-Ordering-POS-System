begin;

-- The discount permission migration predates company-owned role copies. Ensure
-- the built-in cashier/manager grants exist on both templates and tenant roles.
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id
from public.roles r
join public.permissions p on
  (r.name='CASHIER' and p.code='discount.apply') or
  (r.name='MANAGER' and p.code in ('discount.apply','discount.approve'))
where r.is_builtin and p.scope='COMPANY_ASSIGNABLE' and p.is_active
on conflict do nothing;

commit;
