-- Keep a display-ready role name on each profile record.
-- Existing installations derive the initial value from the linked roles table.
alter table public.profiles
  add column if not exists role_name text not null default 'CASHIER';

update public.profiles as profile_record
set role_name = role_record.name
from public.roles as role_record
where profile_record.role_id = role_record.id
  and (profile_record.role_name is null or profile_record.role_name = 'CASHIER');
