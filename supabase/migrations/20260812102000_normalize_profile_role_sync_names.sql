-- Existing installations created this profile trigger with legacy "user"
-- naming. Recreate it under the canonical profile name. This is idempotent so
-- fresh databases and already-deployed databases converge on the same schema.
create or replace function public.sync_profile_role_name_and_id()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  selected_role public.roles%rowtype;
begin
  if tg_op = 'UPDATE' and new.role_name is distinct from old.role_name then
    select * into selected_role
    from public.roles
    where lower(name) = lower(trim(new.role_name))
    limit 1;

    if not found then
      raise exception 'Role "%" does not exist', new.role_name;
    end if;

    new.role_id := selected_role.id;
    new.role_name := selected_role.name;
  elsif new.role_id is not null then
    select * into selected_role
    from public.roles
    where id = new.role_id;

    if not found then
      raise exception 'Role ID "%" does not exist', new.role_id;
    end if;

    new.role_name := selected_role.name;
  elsif new.role_name is not null then
    select * into selected_role
    from public.roles
    where lower(name) = lower(trim(new.role_name))
    limit 1;

    if not found then
      raise exception 'Role "%" does not exist', new.role_name;
    end if;

    new.role_id := selected_role.id;
    new.role_name := selected_role.name;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_user_role_name_and_id on public.profiles;
drop trigger if exists sync_profile_role_name_and_id on public.profiles;

create trigger sync_profile_role_name_and_id
before insert or update of role_id, role_name on public.profiles
for each row
execute function public.sync_profile_role_name_and_id();

drop function if exists public.sync_user_role_name_and_id();
