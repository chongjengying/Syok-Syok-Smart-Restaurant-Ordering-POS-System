-- Keep the public profile row synchronized with each Supabase Auth user.
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
  select id into default_role_id
  from public.roles
  where name = 'CASHIER'
  limit 1;

  if default_role_id is null then
    raise exception 'The CASHIER role must exist before creating users';
  end if;

  base_username := regexp_replace(
    lower(split_part(coalesce(new.email, 'user'), '@', 1)),
    '[^a-z0-9._-]',
    '',
    'g'
  );
  if base_username = '' then
    base_username := 'user';
  end if;

  final_username := base_username;
  while exists (
    select 1 from public.profiles
    where username = final_username and id <> new.id
  ) loop
    final_username := base_username || suffix::text;
    suffix := suffix + 1;
  end loop;

  insert into public.profiles (
    id,
    role_id,
    role_name,
    name,
    username,
    email,
    password_hash,
    status,
    login_attempt
  )
  values (
    new.id,
    default_role_id,
    'CASHIER',
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(coalesce(new.email, 'User'), '@', 1)
    ),
    final_username,
    new.email,
    'supabase_managed',
    'ACTIVE',
    0
  )
  on conflict (id) do update
  set name = excluded.name,
      email = excluded.email,
      updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function public.handle_new_user();

grant execute on function public.handle_new_user() to service_role;

drop policy if exists "Allow select for own user row" on public.profiles;
create policy "Allow select for own user row"
on public.profiles for select to authenticated
using (auth.uid() = id);

drop policy if exists "Allow update for own user row" on public.profiles;
create policy "Allow update for own user row"
on public.profiles for update to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);
