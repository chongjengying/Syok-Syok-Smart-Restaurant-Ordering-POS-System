-- Authenticated staff may edit display fields on their own profile, but role,
-- activation, identity and audit fields are controlled by trusted backend code.
create or replace function public.guard_profile_privilege_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and auth.uid() = old.id and (
    new.id is distinct from old.id
    or new.role_id is distinct from old.role_id
    or new.role_name is distinct from old.role_name
    or new.email is distinct from old.email
    or new.password_hash is distinct from old.password_hash
    or new.status is distinct from old.status
    or new.login_attempt is distinct from old.login_attempt
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Protected staff profile fields can only be changed by an administrator';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_profile_privilege_fields() from public;

drop trigger if exists trg_guard_profile_privilege_fields on public.profiles;
create trigger trg_guard_profile_privilege_fields
before update on public.profiles
for each row execute function public.guard_profile_privilege_fields();
