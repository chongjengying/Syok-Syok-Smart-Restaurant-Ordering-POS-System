begin;

-- The protected void approval path requires order.manage from the approver.
-- Restore it only for the built-in company Manager role.
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id
from public.roles r
join public.permissions p on p.code='order.manage'
where r.name='MANAGER' and r.scope='COMPANY' and r.is_builtin
  and r.is_active and p.scope='COMPANY_ASSIGNABLE' and p.is_active
on conflict do nothing;

commit;
