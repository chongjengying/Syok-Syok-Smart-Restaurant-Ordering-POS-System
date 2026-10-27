begin;

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
  -- Terminal devices use anonymous Auth identities and receive their company,
  -- branch and terminal context only after device binding is validated.
  if coalesce(new.is_anonymous, false) then
    return new;
  end if;

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

commit;
