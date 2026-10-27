begin;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id
from public.roles r
join public.permissions p on p.code=any(case r.name
  when 'CASHIER' then array['product.view','category.view','table.view','order.view','order.create','payment.view','payment.create','cash.shift.view','cash.shift.open','cash.shift.close']
  when 'WAITER' then array['product.view','category.view','table.view','table.manage','order.view','order.create','order.cancel']
  else array[]::text[]
end)
where r.name in ('CASHIER','WAITER')
on conflict do nothing;

commit;
