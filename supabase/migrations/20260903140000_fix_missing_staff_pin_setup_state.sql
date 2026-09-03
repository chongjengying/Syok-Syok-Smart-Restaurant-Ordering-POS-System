begin;

drop function if exists public.list_pos_staff();
create function public.list_pos_staff()
returns table(
  id uuid,
  name text,
  role text,
  pin_status text,
  pin_setup_required boolean,
  temporary_pin_required boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    profile.id,
    profile.name,
    role.name,
    coalesce(credential.status, 'SETUP_REQUIRED'),
    credential.user_id is null or credential.status = 'SETUP_REQUIRED' or credential.pin_hash is null,
    credential.status = 'TEMPORARY_RESET'
  from public.profiles profile
  join public.roles role on role.id = profile.role_id
  left join public.staff_pin_credentials credential on credential.user_id = profile.id
  join auth.users auth_user on auth_user.id = profile.id and auth_user.email = profile.email
  where public.is_active_pos_user()
    and profile.status = 'ACTIVE'
    and profile.email is not null
    and role.name in ('ADMIN', 'MANAGER', 'WAITER', 'KITCHEN', 'CASHIER')
  order by
    case role.name when 'ADMIN' then 1 when 'MANAGER' then 2 when 'CASHIER' then 3 when 'WAITER' then 4 else 5 end,
    profile.name;
$$;

revoke all on function public.list_pos_staff() from public, anon, authenticated;
grant execute on function public.list_pos_staff() to authenticated;

commit;
