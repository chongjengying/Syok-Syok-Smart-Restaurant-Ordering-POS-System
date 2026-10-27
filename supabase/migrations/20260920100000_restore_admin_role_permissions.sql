begin;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
cross join public.permissions permission
where role.name = 'ADMIN'
on conflict (role_id, permission_id) do nothing;

commit;
