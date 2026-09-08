begin;

create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  staff_code text not null,
  name text not null,
  company_id uuid not null references public.companies(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  role_id uuid not null references public.roles(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, staff_code)
);
alter table public.staff enable row level security;
revoke all on public.staff from public, anon, authenticated;
grant all on public.staff to service_role;

alter table public.pos_terminals
  add column if not exists auth_user_id uuid references auth.users(id) on delete restrict,
  add column if not exists authenticated_at timestamptz;
create unique index if not exists pos_terminals_auth_user_id_key
  on public.pos_terminals(auth_user_id) where auth_user_id is not null;

create or replace function public.resolve_authenticated_terminal()
returns jsonb language plpgsql security definer set search_path=public as $$
declare t public.pos_terminals; b public.branches; c public.companies;
begin
  select * into t from public.pos_terminals where auth_user_id=auth.uid();
  if not found then return jsonb_build_object('ok',false,'code','TERMINAL_AUTH_NOT_BOUND'); end if;
  select * into b from public.branches where id=t.branch_id;
  select * into c from public.companies where id=t.company_id;
  if t.status<>'ACTIVE' or t.registration_status<>'REGISTERED' then return jsonb_build_object('ok',false,'code','TERMINAL_INACTIVE'); end if;
  if b.status<>'ACTIVE' then return jsonb_build_object('ok',false,'code','BRANCH_INACTIVE'); end if;
  if c.status<>'ACTIVE' then return jsonb_build_object('ok',false,'code','COMPANY_INACTIVE'); end if;
  update public.pos_terminals set authenticated_at=now(),last_seen_at=now() where id=t.id;
  return jsonb_build_object('ok',true,'terminalId',t.id,'terminalCode',t.terminal_code,'branchId',b.id,'branchCode',b.code,'companyId',c.id);
end $$;

create or replace function public.list_authenticated_terminal_staff()
returns table(id uuid,staff_code text,name text,role text)
language sql stable security definer set search_path=public as $$
  select s.id,s.staff_code,s.name,r.name
  from public.pos_terminals t
  join public.branches b on b.id=t.branch_id and b.status='ACTIVE'
  join public.companies c on c.id=t.company_id and c.status='ACTIVE'
  join public.staff s on s.branch_id=t.branch_id and s.company_id=t.company_id and s.active
  join public.roles r on r.id=s.role_id
  where t.auth_user_id=auth.uid() and t.status='ACTIVE' and t.registration_status='REGISTERED'
  order by s.name;
$$;

revoke all on function public.resolve_authenticated_terminal(), public.list_authenticated_terminal_staff() from public, anon;
grant execute on function public.resolve_authenticated_terminal(), public.list_authenticated_terminal_staff() to authenticated;

commit;
