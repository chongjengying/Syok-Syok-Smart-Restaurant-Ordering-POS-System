begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.staff_pin_credentials (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  pin_hash text,
  status text not null default 'SETUP_REQUIRED' check (status in ('SETUP_REQUIRED', 'TEMPORARY_RESET', 'ACTIVE')),
  failed_attempts smallint not null default 0 check (failed_attempts between 0 and 20),
  locked_until timestamptz,
  changed_at timestamptz not null default now(),
  changed_by uuid references public.profiles(id) on delete set null
);

alter table public.staff_pin_credentials
  alter column pin_hash drop not null,
  add column if not exists status text not null default 'SETUP_REQUIRED';

alter table public.staff_pin_credentials drop constraint if exists staff_pin_credentials_status_check;
alter table public.staff_pin_credentials
  add constraint staff_pin_credentials_status_check check (status in ('SETUP_REQUIRED', 'TEMPORARY_RESET', 'ACTIVE'));

alter table public.staff_pin_credentials enable row level security;
revoke all on public.staff_pin_credentials from public, anon, authenticated;
grant all on public.staff_pin_credentials to service_role;

-- The earlier staff-session migration defines this function with five output
-- columns. PostgreSQL cannot change a function's OUT row type with
-- CREATE OR REPLACE, so recreate it before adding temporary_pin_required.
drop function if exists public.list_pos_staff();
drop function if exists public.require_staff_pin_setup(uuid);

create or replace function public.list_pos_staff()
returns table (id uuid, name text, role text, pin_status text, pin_setup_required boolean, temporary_pin_required boolean)
language sql
stable
security definer
set search_path = public
as $$
  select
    profile.id,
    profile.name,
    role.name,
    credential.status,
    credential.status = 'SETUP_REQUIRED',
    credential.status = 'TEMPORARY_RESET'
  from public.profiles profile
  join public.roles role on role.id = profile.role_id
  join public.staff_pin_credentials credential on credential.user_id = profile.id
  join auth.users auth_user on auth_user.id = profile.id and auth_user.email = profile.email
  where public.is_active_pos_user()
    and profile.status = 'ACTIVE'
    and profile.email is not null
    and role.name in ('ADMIN', 'MANAGER', 'WAITER', 'KITCHEN')
  order by
    case role.name when 'ADMIN' then 1 when 'MANAGER' then 2 when 'WAITER' then 3 else 4 end,
    profile.name
$$;

create or replace function public.require_staff_pin_setup(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  temporary_pin text;
  random_bytes bytea;
begin
  if not public.has_pos_permission('user.edit') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  perform 1 from public.profiles where id = p_user_id and status <> 'MISSING_PROFILE';
  if not found then raise exception 'USER_NOT_FOUND'; end if;

  random_bytes := gen_random_bytes(4);
  temporary_pin := lpad((
    (
      (get_byte(random_bytes, 0)::bigint << 24)
      + (get_byte(random_bytes, 1)::bigint << 16)
      + (get_byte(random_bytes, 2)::bigint << 8)
      + get_byte(random_bytes, 3)::bigint
    ) % 1000000
  )::text, 6, '0');

  insert into public.staff_pin_credentials (user_id, pin_hash, status, changed_by)
  values (p_user_id, crypt(temporary_pin, gen_salt('bf', 12)), 'TEMPORARY_RESET', auth.uid())
  on conflict (user_id) do update
  set pin_hash = excluded.pin_hash,
      status = 'TEMPORARY_RESET',
      failed_attempts = 0,
      locked_until = null,
      changed_at = now(),
      changed_by = auth.uid();

  perform public.write_pos_audit(
    'STAFF_PIN_RESET_REQUIRED', 'PROFILE', p_user_id, null,
    jsonb_build_object('credentialStatus', 'TEMPORARY_RESET')
  );

  return jsonb_build_object('temporaryPin', temporary_pin);
end;
$$;

create or replace function public.set_own_staff_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_active_pos_user() then raise exception 'ACTIVE_PROFILE_REQUIRED'; end if;
  if p_pin !~ '^[0-9]{6}$' then raise exception 'INVALID_STAFF_PIN'; end if;

  -- A salted bcrypt hash cannot have a UNIQUE constraint. Serialize PIN changes
  -- and compare the candidate against every active hash without persisting a
  -- low-entropy deterministic PIN fingerprint.
  perform pg_advisory_xact_lock(hashtextextended('staff-pin-uniqueness', 0));
  if exists (
    select 1
    from public.staff_pin_credentials credential
    where credential.user_id <> auth.uid()
      and credential.status = 'ACTIVE'
      and credential.pin_hash is not null
      and credential.pin_hash = crypt(p_pin, credential.pin_hash)
  ) then
    raise exception 'STAFF_PIN_ALREADY_IN_USE';
  end if;

  insert into public.staff_pin_credentials (user_id, pin_hash, status, changed_by)
  values (auth.uid(), crypt(p_pin, gen_salt('bf', 12)), 'ACTIVE', auth.uid())
  on conflict (user_id) do update
  set pin_hash = excluded.pin_hash,
      status = 'ACTIVE',
      failed_attempts = 0,
      locked_until = null,
      changed_at = now(),
      changed_by = auth.uid();

  perform public.write_pos_audit(
    'STAFF_PIN_CHANGED', 'PROFILE', auth.uid(), null,
    jsonb_build_object('credentialStatus', 'ACTIVE')
  );
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
  next_failed_attempts smallint;
begin
  if auth.role() <> 'service_role' then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if p_pin !~ '^[0-9]{6}$' then return jsonb_build_object('ok', false, 'code', 'INVALID_PIN'); end if;

  perform pg_advisory_xact_lock(hashtextextended('staff-pin:' || p_user_id::text, 0));
  select * into target from public.profiles where id = p_user_id;
  select * into credential from public.staff_pin_credentials where user_id = p_user_id for update;
  if target.id is null or target.status <> 'ACTIVE' or credential.user_id is null then
    return jsonb_build_object('ok', false, 'code', 'STAFF_UNAVAILABLE');
  end if;
  if target.email is null or not exists (
    select 1 from auth.users auth_user
    where auth_user.id = target.id
      and auth_user.email = target.email
  ) then
    return jsonb_build_object('ok', false, 'code', 'STAFF_AUTH_UNAVAILABLE');
  end if;
  if credential.status = 'SETUP_REQUIRED' then
    return jsonb_build_object('ok', false, 'code', 'PIN_SETUP_REQUIRED');
  end if;
  if credential.locked_until is not null and credential.locked_until > now() then
    return jsonb_build_object('ok', false, 'code', 'PIN_LOCKED');
  end if;
  if credential.pin_hash <> crypt(p_pin, credential.pin_hash) then
    next_failed_attempts := least(credential.failed_attempts + 1, 20);
    update public.staff_pin_credentials
    set failed_attempts = next_failed_attempts,
        locked_until = case when next_failed_attempts >= 5 then now() + interval '5 minutes' else null end
    where user_id = p_user_id;
    return jsonb_build_object('ok', false, 'code', case when next_failed_attempts >= 5 then 'PIN_LOCKED' else 'INVALID_PIN' end);
  end if;

  update public.staff_pin_credentials set failed_attempts = 0, locked_until = null where user_id = p_user_id;
  return jsonb_build_object(
    'ok', true,
    'email', target.email,
    'pinResetRequired', credential.status = 'TEMPORARY_RESET'
  );
end;
$$;

drop function if exists public.set_staff_pin(uuid, text);
revoke all on function public.list_pos_staff(), public.require_staff_pin_setup(uuid), public.set_own_staff_pin(text), public.verify_staff_pin_exchange(uuid, text) from public, anon, authenticated;
grant execute on function public.list_pos_staff(), public.require_staff_pin_setup(uuid), public.set_own_staff_pin(text) to authenticated;
grant execute on function public.verify_staff_pin_exchange(uuid, text) to service_role;

commit;
