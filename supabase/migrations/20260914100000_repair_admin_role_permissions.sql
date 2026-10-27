begin;
-- Restore the intended full permission set for the built-in ADMIN role.
-- This is idempotent so it repairs installations where the role exists but
-- its permission assignments were lost or never seeded.
insert into public.role_permissions (role_id, permission_id)
select role_record.id, permission_record.id
from public.roles role_record
cross join public.permissions permission_record
where role_record.name = 'ADMIN'
on conflict (role_id, permission_id) do nothing;
commit;
