begin;
create extension if not exists pgcrypto with schema extensions;
create table if not exists public.staff_pin_credentials (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  pin_hash text not null,
  failed_attempts smallint not null default 0 check (failed_attempts between 0 and 20),
  locked_until timestamptz,
  changed_at timestamptz not null default now(),
  changed_by uuid references public.profiles(id) on delete set null
);
alter table public.staff_pin_credentials enable row level security;
revoke all on public.staff_pin_credentials from public, anon, authenticated;
grant all on public.staff_pin_credentials to service_role;
create or replace function public.list_pos_staff()
returns table (id uuid, name text, role text)
language sql
stable
security definer
set search_path = public
as $$
  select profile.id, profile.name, role.name
  from public.profiles profile
  join public.roles role on role.id = profile.role_id
  join public.staff_pin_credentials credential on credential.user_id = profile.id
  where public.is_active_pos_user()
    and profile.status = 'ACTIVE'
    and role.name in ('ADMIN', 'MANAGER', 'WAITER', 'KITCHEN')
  order by
    case role.name when 'ADMIN' then 1 when 'MANAGER' then 2 when 'WAITER' then 3 else 4 end,
    profile.name
$$;
create or replace function public.set_staff_pin(p_user_id uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.has_pos_permission('user.edit') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if p_pin !~ '^[0-9]{4}$' then raise exception 'INVALID_STAFF_PIN'; end if;
  perform 1 from public.profiles where id = p_user_id and status <> 'MISSING_PROFILE';
  if not found then raise exception 'USER_NOT_FOUND'; end if;

  insert into public.staff_pin_credentials (user_id, pin_hash, changed_by)
  values (p_user_id, crypt(p_pin, gen_salt('bf', 12)), auth.uid())
  on conflict (user_id) do update
  set pin_hash = excluded.pin_hash,
      failed_attempts = 0,
      locked_until = null,
      changed_at = now(),
      changed_by = auth.uid();
end;
$$;
create or replace function public.verify_staff_pin_exchange(p_user_id uuid, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  credential public.staff_pin_credentials%rowtype;
  target public.profiles%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if p_pin !~ '^[0-9]{4}$' then return jsonb_build_object('ok', false, 'code', 'INVALID_PIN'); end if;

  perform pg_advisory_xact_lock(hashtextextended('staff-pin:' || p_user_id::text, 0));
  select * into target from public.profiles where id = p_user_id;
  select * into credential from public.staff_pin_credentials where user_id = p_user_id for update;
  if target.id is null or target.status <> 'ACTIVE' or credential.user_id is null then
    return jsonb_build_object('ok', false, 'code', 'STAFF_UNAVAILABLE');
  end if;
  if credential.locked_until is not null and credential.locked_until > now() then
    return jsonb_build_object('ok', false, 'code', 'PIN_LOCKED');
  end if;
  if credential.pin_hash <> crypt(p_pin, credential.pin_hash) then
    update public.staff_pin_credentials
    set failed_attempts = least(failed_attempts + 1, 20),
        locked_until = case when failed_attempts + 1 >= 5 then now() + interval '5 minutes' else null end
    where user_id = p_user_id;
    return jsonb_build_object('ok', false, 'code', 'INVALID_PIN');
  end if;

  update public.staff_pin_credentials set failed_attempts = 0, locked_until = null where user_id = p_user_id;
  return jsonb_build_object('ok', true, 'email', target.email);
end;
$$;
revoke all on function public.list_pos_staff(), public.set_staff_pin(uuid, text), public.verify_staff_pin_exchange(uuid, text) from public, anon, authenticated;
grant execute on function public.list_pos_staff(), public.set_staff_pin(uuid, text) to authenticated;
grant execute on function public.verify_staff_pin_exchange(uuid, text) to service_role;
commit;
