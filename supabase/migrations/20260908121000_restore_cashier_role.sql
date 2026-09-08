begin;

insert into public.roles (name, description)
values ('CASHIER', 'Point-of-sale cashier')
on conflict (name) do update set description = excluded.description;

alter table public.profiles drop constraint if exists profiles_role_name_check;
alter table public.profiles add constraint profiles_role_name_check
  check (role_name in ('ADMIN', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN'));

insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code = any(array[
  'product.view', 'category.view', 'order.view', 'table.view',
  'payment.view', 'payment.create'
])
where role.name = 'CASHIER'
on conflict (role_id, permission_id) do nothing;

commit;
