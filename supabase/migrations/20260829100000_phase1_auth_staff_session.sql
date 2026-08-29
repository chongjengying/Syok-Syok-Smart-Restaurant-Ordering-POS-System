begin;

-- Phase 1 has four authoritative staff roles. Preserve legacy cashier access by
-- moving its permission assignments and staff to WAITER before removing it.
insert into public.roles (name, description)
values
  ('ADMIN', 'Administrator'),
  ('MANAGER', 'Restaurant manager'),
  ('WAITER', 'Front-of-house POS staff'),
  ('KITCHEN', 'Kitchen display staff')
on conflict (name) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id, granted_by)
select waiter.id, assignment.permission_id, assignment.granted_by
from public.role_permissions assignment
join public.roles legacy on legacy.id = assignment.role_id and legacy.name = 'CASHIER'
cross join lateral (select id from public.roles where name = 'WAITER') waiter
on conflict (role_id, permission_id) do nothing;

update public.profiles profile
set role_id = waiter.id,
    role_name = 'WAITER',
    updated_at = now()
from public.roles current_role
cross join lateral (select id from public.roles where name = 'WAITER') waiter
where profile.role_id = current_role.id
  and current_role.name not in ('ADMIN', 'MANAGER', 'WAITER', 'KITCHEN');

update public.profiles profile
set role_name = role.name,
    updated_at = now()
from public.roles role
where role.id = profile.role_id
  and profile.role_name is distinct from role.name;

delete from public.roles where name not in ('ADMIN', 'MANAGER', 'WAITER', 'KITCHEN');

alter table public.profiles drop constraint if exists profiles_role_name_check;
alter table public.profiles
  add constraint profiles_role_name_check
  check (role_name in ('ADMIN', 'MANAGER', 'WAITER', 'KITCHEN'));

-- Enforce the one-to-one identity relationship for all new rows. Validate the
-- existing data when it is already clean without making rollout destructive.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and confrelid = 'auth.users'::regclass
      and contype = 'f'
  ) then
    alter table public.profiles
      add constraint profiles_auth_user_fkey
      foreign key (id) references auth.users(id) on delete cascade not valid;
  end if;

  if not exists (
    select 1 from public.profiles profile
    left join auth.users auth_user on auth_user.id = profile.id
    where auth_user.id is null
  ) then
    alter table public.profiles validate constraint profiles_auth_user_fkey;
  end if;
end;
$$;

create or replace function public.current_pos_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role.name
  from public.profiles profile
  join public.roles role on role.id = profile.role_id
  where profile.id = auth.uid()
    and profile.status = 'ACTIVE'
    and role.name in ('ADMIN', 'MANAGER', 'WAITER', 'KITCHEN')
$$;

create or replace function public.is_active_pos_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles profile
    join public.roles role on role.id = profile.role_id
    where profile.id = auth.uid()
      and profile.status = 'ACTIVE'
      and role.name in ('ADMIN', 'MANAGER', 'WAITER', 'KITCHEN')
  )
$$;

create or replace function public.get_my_staff_session()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', profile.id,
    'name', profile.name,
    'email', profile.email,
    'username', profile.username,
    'status', profile.status,
    'role', role.name,
    'branchId', profile.branch_id,
    'permissions', coalesce((
      select jsonb_agg(permission.code order by permission.code)
      from public.role_permissions assignment
      join public.permissions permission on permission.id = assignment.permission_id
      where assignment.role_id = role.id
        and profile.status = 'ACTIVE'
    ), '[]'::jsonb)
  )
  from public.profiles profile
  join public.roles role on role.id = profile.role_id
  where profile.id = auth.uid()
$$;

revoke all on function public.current_pos_role(), public.is_active_pos_user(), public.get_my_staff_session() from public, anon;
grant execute on function public.current_pos_role(), public.is_active_pos_user(), public.get_my_staff_session() to authenticated;

drop policy if exists staff_read_own_auth_profile on public.profiles;
create policy staff_read_own_auth_profile
on public.profiles for select to authenticated
using (id = auth.uid());

-- New Auth users receive an inactive WAITER profile. Email confirmation does
-- not grant employment or POS authorization.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  default_role_id uuid;
  base_username text;
  final_username text;
  suffix integer := 1;
begin
  select id into default_role_id from public.roles where name = 'WAITER';
  if default_role_id is null then raise exception 'The WAITER role must exist before creating users'; end if;

  base_username := regexp_replace(lower(split_part(coalesce(new.email, 'user'), '@', 1)), '[^a-z0-9._-]', '', 'g');
  if base_username = '' then base_username := 'user'; end if;
  final_username := base_username;
  while exists (select 1 from public.profiles where username = final_username and id <> new.id) loop
    final_username := base_username || suffix::text;
    suffix := suffix + 1;
  end loop;

  insert into public.profiles (id, role_id, role_name, name, username, email, password_hash, status, login_attempt)
  values (
    new.id,
    default_role_id,
    'WAITER',
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(coalesce(new.email, 'User'), '@', 1)),
    final_username,
    new.email,
    'supabase_managed',
    'INACTIVE',
    0
  )
  on conflict (id) do update
  set name = excluded.name,
      email = excluded.email,
      updated_at = now();
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;

-- Roles are fixed for Phase 1; assignment remains available only through the
-- protected administrator workflow and its permission checks.
revoke execute on function public.create_admin_role(text, text) from authenticated;

commit;
