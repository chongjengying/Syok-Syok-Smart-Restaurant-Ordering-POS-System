begin;

-- Establish one authoritative company context for every authenticated
-- profile. Existing staging rows are safely assigned through their branch;
-- branchless administrators belong to the current SYOK company.
alter table public.profiles
  add column if not exists company_id uuid references public.companies(id) on delete restrict;

update public.profiles p
set company_id = coalesce(
  (select b.company_id from public.branches b where b.id = p.branch_id),
  (select c.id from public.companies c where c.code = 'SYOK')
)
where p.company_id is null;

do $$ begin
  if exists (select 1 from public.profiles where company_id is null) then
    raise exception 'PROFILE_COMPANY_BACKFILL_INCOMPLETE';
  end if;
end $$;

alter table public.profiles alter column company_id set not null;
create index if not exists profiles_company_status_idx on public.profiles(company_id,status);

create or replace function public.current_user_company_id()
returns uuid language sql stable security definer set search_path=public as $$
  select company_id from public.profiles where id=auth.uid() and status='ACTIVE'
$$;
revoke all on function public.current_user_company_id() from public,anon;
grant execute on function public.current_user_company_id() to authenticated;

create or replace function public.profile_company_default()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.company_id is null then
    new.company_id := coalesce(
      (select b.company_id from public.branches b where b.id = new.branch_id),
      (select c.id from public.companies c where c.code = 'SYOK')
    );
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_company_default on public.profiles;
create trigger profiles_company_default
before insert or update of branch_id,company_id on public.profiles
for each row execute function public.profile_company_default();

create or replace function public.can_access_branch(p_branch_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1
    from public.profiles p
    join public.branches b on b.id=p_branch_id and b.company_id=p.company_id
    where p.id=auth.uid() and p.status='ACTIVE'
      and (
        (exists (
          select 1 from public.terminal_staff_sessions s
          where s.auth_session_id=nullif(auth.jwt()->>'session_id','')::uuid
            and s.staff_id=auth.uid() and s.branch_id=p_branch_id
            and s.status in ('ACTIVE','LOCKED')
        ))
        or (
          not exists (
            select 1 from public.terminal_staff_sessions s
            where s.auth_session_id=nullif(auth.jwt()->>'session_id','')::uuid
          )
          and (p.role_name='ADMIN' or p.branch_id=p_branch_id or public.staff_has_branch(p.id,p_branch_id))
        )
      )
  )
$$;

drop policy if exists company_read on public.companies;
create policy company_read on public.companies for select to authenticated
using (id=public.current_user_company_id() and public.has_pos_permission('company.view'));

drop policy if exists active_staff_read_branches on public.branches;
create policy active_staff_read_branches on public.branches for select to authenticated
using (public.can_access_branch(id));

-- Company edits may never be redirected to an arbitrary company id supplied by
-- the browser.
create or replace function public.save_company(p_payload jsonb)
returns public.companies language plpgsql security definer set search_path=public as $$
declare previous public.companies; result public.companies;
begin
  if not public.has_pos_permission('company.update') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into previous from public.companies where id=(p_payload->>'id')::uuid for update;
  if not found or previous.id<>public.current_user_company_id() then raise exception 'COMPANY_ACCESS_DENIED'; end if;
  if nullif(trim(p_payload->>'name'),'') is null
     or coalesce(p_payload->>'code','') !~ '^[A-Z0-9_-]{2,30}$'
     or coalesce(p_payload->>'currency_code','') !~ '^[A-Z]{3}$'
     or not exists(select 1 from pg_timezone_names where name=p_payload->>'timezone') then
    raise exception 'INVALID_COMPANY_INFORMATION';
  end if;
  update public.companies set
    name=trim(p_payload->>'name'), code=p_payload->>'code',
    registration_no=nullif(trim(p_payload->>'registration_no'),''),
    phone=nullif(trim(p_payload->>'phone'),''), email=nullif(trim(p_payload->>'email'),''),
    address=nullif(trim(p_payload->>'address'),''), currency_code=p_payload->>'currency_code',
    timezone=p_payload->>'timezone', updated_at=now()
  where id=previous.id returning * into result;
  perform public.write_pos_audit_diff('COMPANY_UPDATED','COMPANY',result.id,null,to_jsonb(previous),to_jsonb(result));
  return result;
end;
$$;

-- Branch creation inherits the authenticated administrator's company; the
-- client cannot select another tenant during creation.
create or replace function public.save_branch(p_id uuid,p_payload jsonb,p_expected_revision bigint default null)
returns public.branches language plpgsql security definer set search_path=public as $$
declare previous public.branches; result public.branches; company uuid;
begin
  if p_id is null then
    if not public.has_pos_permission('branch.create') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
    company:=public.current_user_company_id();
  else
    if not public.has_pos_permission('branch.update') or not public.can_access_branch(p_id) then raise exception 'INSUFFICIENT_PERMISSION'; end if;
    select * into previous from public.branches where id=p_id for update;
    if not found then raise exception 'BRANCH_NOT_FOUND'; end if;
    if p_expected_revision is distinct from previous.revision then raise exception 'CONFIGURATION_CHANGED'; end if;
    company:=previous.company_id;
    if p_payload->>'status' is distinct from previous.status and not public.has_pos_permission('branch.deactivate') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  end if;
  if company is distinct from public.current_user_company_id() then raise exception 'COMPANY_ACCESS_DENIED'; end if;
  if nullif(trim(p_payload->>'name'),'') is null or coalesce(p_payload->>'code','') !~ '^[A-Z0-9_-]{2,30}$' then raise exception 'INVALID_BRANCH_INFORMATION'; end if;
  if nullif(p_payload->>'currency_code','') is not null and p_payload->>'currency_code' !~ '^[A-Z]{3}$' then raise exception 'INVALID_CURRENCY'; end if;
  if nullif(p_payload->>'timezone','') is not null and not exists(select 1 from pg_timezone_names where name=p_payload->>'timezone') then raise exception 'INVALID_TIMEZONE'; end if;
  insert into public.branches(id,company_id,code,name,status,registration_no,phone,email,address,currency_code,timezone)
  values(coalesce(p_id,gen_random_uuid()),company,p_payload->>'code',trim(p_payload->>'name'),coalesce(p_payload->>'status','INACTIVE'),nullif(p_payload->>'registration_no',''),nullif(p_payload->>'phone',''),nullif(p_payload->>'email',''),nullif(p_payload->>'address',''),nullif(p_payload->>'currency_code',''),nullif(p_payload->>'timezone',''))
  on conflict(id) do update set code=excluded.code,name=excluded.name,status=excluded.status,registration_no=excluded.registration_no,phone=excluded.phone,email=excluded.email,address=excluded.address,currency_code=excluded.currency_code,timezone=excluded.timezone,updated_at=now(),revision=branches.revision+1
  returning * into result;
  perform public.write_pos_audit_diff(case when p_id is null then 'BRANCH_CREATED' when previous.status is distinct from result.status then 'BRANCH_'||result.status else 'BRANCH_UPDATED' end,'BRANCH',result.id,null,to_jsonb(previous),to_jsonb(result));
  return result;
end;
$$;

-- E-Invoice profiles are company-owned; the previous permission-only policy
-- could expose another company's profile to any e-Invoice administrator.
drop policy if exists einvoice_profile_view on public.company_einvoice_profiles;
create policy einvoice_profile_view on public.company_einvoice_profiles for select to authenticated
using (company_id=public.current_user_company_id() and public.has_pos_permission('einvoice.view'));

commit;
