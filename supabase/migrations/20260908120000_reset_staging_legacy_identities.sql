-- Staging-only destructive reset authorized by the project owner on 2026-09-08.
-- Preserve the sole Admin Auth identity, but remove the legacy profile graph and
-- every dependent operational, financial, session and audit row.
begin;

truncate table public.profiles restart identity cascade;

insert into public.profiles (
  id, role_id, role_name, name, username, email, password_hash, status,
  company_id, branch_id, default_branch_id
)
select
  auth_user.id,
  role.id,
  role.name,
  'Staging Administrator',
  'admin.staging',
  'admin.staging@syoksyok.com',
  'supabase_managed',
  'ACTIVE',
  branch.company_id,
  branch.id,
  branch.id
from auth.users auth_user
join public.roles role on role.name = 'ADMIN'
join lateral (
  select id, company_id
  from public.branches
  where code = 'MAIN' and status = 'ACTIVE'
  order by created_at
  limit 1
) branch on true
where lower(auth_user.email) = 'admin.staging@syoksyok.com'
on conflict (id) do update set
  role_id = excluded.role_id,
  role_name = excluded.role_name,
  name = excluded.name,
  username = excluded.username,
  email = excluded.email,
  status = excluded.status,
  company_id = excluded.company_id,
  branch_id = excluded.branch_id,
  default_branch_id = excluded.default_branch_id,
  updated_at = now();

do $$
begin
  if not exists (
    select 1 from public.profiles where email = 'admin.staging@syoksyok.com'
  ) then
    raise exception 'STAGING_ADMIN_RECREATION_FAILED';
  end if;
end;
$$;

commit;
