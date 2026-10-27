begin;

-- A built-in cashier allowed to create an order must also be able to add
-- items, submit them, and run the voucher evaluator used during submission.
-- Keep role authority in role_permissions; custom roles are untouched.
insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.role_permissions create_grant on create_grant.role_id = r.id
join public.permissions create_permission on create_permission.id = create_grant.permission_id
  and create_permission.code = 'order.create'
join public.permissions p on p.code in ('order.edit', 'order.submit', 'voucher.apply')
  and p.is_active and p.scope = 'COMPANY_ASSIGNABLE'
where r.name = 'CASHIER' and r.is_builtin and r.is_active
on conflict do nothing;

commit;
