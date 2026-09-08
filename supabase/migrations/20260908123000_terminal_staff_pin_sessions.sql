begin;

-- `profiles` remains the immutable operational identity used by existing orders,
-- payments and audit rows.  New POS staff are represented by `staff`; this link
-- lets the new model coexist without rewriting historical financial records.
alter table public.staff
  add column if not exists legacy_profile_id uuid references public.profiles(id) on delete restrict,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;
create unique index if not exists staff_legacy_profile_id_key
  on public.staff(legacy_profile_id) where legacy_profile_id is not null;

create table if not exists public.staff_pin_credentials_v2 (
  staff_id uuid primary key references public.staff(id) on delete cascade,
  pin_hash text,
  status text not null default 'SETUP_REQUIRED' check (status in ('SETUP_REQUIRED','TEMPORARY_RESET','ACTIVE')),
  failed_attempts smallint not null default 0 check (failed_attempts >= 0 and failed_attempts <= 20),
  locked_until timestamptz,
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users(id) on delete set null
);
alter table public.staff_pin_credentials_v2 enable row level security;
revoke all on public.staff_pin_credentials_v2 from public, anon, authenticated;
grant all on public.staff_pin_credentials_v2 to service_role;

alter table public.terminal_staff_sessions
  add column if not exists staff_record_id uuid references public.staff(id) on delete restrict;
create index if not exists terminal_staff_sessions_staff_record_idx
  on public.terminal_staff_sessions(staff_record_id, status);

-- The actor is now the terminal Auth identity, not an Auth-backed staff profile.
do $$
declare constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid='public.terminal_staff_sessions'::regclass
    and contype='f'
    and conkey=array[(select attnum from pg_attribute where attrelid='public.terminal_staff_sessions'::regclass and attname='actor_auth_user_id')];
  if constraint_name is not null then execute format('alter table public.terminal_staff_sessions drop constraint %I', constraint_name); end if;
  if not exists (select 1 from pg_constraint where conrelid='public.terminal_staff_sessions'::regclass and conname='terminal_staff_sessions_actor_auth_user_fkey') then
    alter table public.terminal_staff_sessions add constraint terminal_staff_sessions_actor_auth_user_fkey foreign key (actor_auth_user_id) references auth.users(id) on delete restrict;
  end if;
end $$;

-- Terminal credentials are Auth users but never staff profiles.  A terminal JWT
-- is the sole JWT used throughout its selected staff session.
create or replace function public.current_terminal_staff_session()
returns public.terminal_staff_sessions
language sql stable security definer set search_path=public as $$
  select s
  from public.terminal_staff_sessions s
  join public.pos_terminals t on t.id=s.terminal_id
  join public.branches b on b.id=s.branch_id and b.status='ACTIVE'
  join public.companies c on c.id=b.company_id and c.status='ACTIVE'
  join public.staff st on st.id=s.staff_record_id and st.active
  where s.auth_session_id=nullif(auth.jwt()->>'session_id','')::uuid
    and t.auth_user_id=auth.uid()
    and s.status='ACTIVE'
    and t.status='ACTIVE' and t.registration_status='REGISTERED'
    and st.company_id=s.company_id and st.branch_id=s.branch_id;
$$;

create or replace function public.require_terminal_staff_session()
returns public.terminal_staff_sessions
language plpgsql stable security definer set search_path=public as $$
declare s public.terminal_staff_sessions;
begin
  s := public.current_terminal_staff_session();
  if s.id is null then raise exception 'ACTIVE_STAFF_SESSION_REQUIRED'; end if;
  return s;
end $$;

create or replace function public.end_terminal_staff_session()
returns void language sql security definer set search_path=public as $$
  update public.terminal_staff_sessions s
  set status='ENDED', ended_at=now()
  from public.pos_terminals t
  where s.terminal_id=t.id
    and s.auth_session_id=nullif(auth.jwt()->>'session_id','')::uuid
    and t.auth_user_id=auth.uid() and s.status in ('ACTIVE','LOCKED');
$$;

create or replace function public.lock_terminal_staff_session()
returns void language sql security definer set search_path=public as $$
  update public.terminal_staff_sessions s
  set status='LOCKED', last_activity_at=now()
  from public.pos_terminals t
  where s.terminal_id=t.id
    and s.auth_session_id=nullif(auth.jwt()->>'session_id','')::uuid
    and t.auth_user_id=auth.uid() and s.status='ACTIVE';
$$;

drop function if exists public.list_authenticated_terminal_staff();
create function public.list_authenticated_terminal_staff()
returns table(id uuid, staff_code text, name text, role text, pin_status text, pin_setup_required boolean, temporary_pin_required boolean)
language sql stable security definer set search_path=public as $$
  select st.id, st.staff_code, st.name, r.name,
         coalesce(pc.status,'SETUP_REQUIRED'),
         pc.staff_id is null or pc.status='SETUP_REQUIRED',
         pc.status='TEMPORARY_RESET'
  from public.pos_terminals t
  join public.branches b on b.id=t.branch_id and b.status='ACTIVE'
  join public.companies c on c.id=t.company_id and c.status='ACTIVE'
  join public.staff st on st.branch_id=t.branch_id and st.company_id=t.company_id and st.active
  join public.roles r on r.id=st.role_id
  left join public.staff_pin_credentials_v2 pc on pc.staff_id=st.id
  where t.auth_user_id=auth.uid() and t.status='ACTIVE' and t.registration_status='REGISTERED'
  order by st.name;
$$;

create or replace function public.verify_authenticated_terminal_staff_pin(p_staff_id uuid, p_pin text)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare t public.pos_terminals; st public.staff; pc public.staff_pin_credentials_v2; attempts smallint;
begin
  if p_pin !~ '^[0-9]{6}$' then return jsonb_build_object('ok',false,'code','INVALID_PIN'); end if;
  select * into t from public.pos_terminals where auth_user_id=auth.uid() for update;
  if not found or t.status<>'ACTIVE' or t.registration_status<>'REGISTERED' or t.lock_status='LOCKED' then
    return jsonb_build_object('ok',false,'code','TERMINAL_UNAVAILABLE');
  end if;
  select * into st from public.staff where id=p_staff_id and active and company_id=t.company_id and branch_id=t.branch_id;
  if not found then return jsonb_build_object('ok',false,'code','STAFF_ACCESS_DENIED'); end if;
  select * into pc from public.staff_pin_credentials_v2 where staff_id=st.id for update;
  if not found or pc.status='SETUP_REQUIRED' or pc.pin_hash is null then return jsonb_build_object('ok',false,'code','PIN_SETUP_REQUIRED'); end if;
  if pc.locked_until is not null and pc.locked_until>now() then return jsonb_build_object('ok',false,'code','PIN_LOCKED'); end if;
  if pc.pin_hash <> crypt(p_pin, pc.pin_hash) then
    attempts := least(pc.failed_attempts+1,20);
    update public.staff_pin_credentials_v2 set failed_attempts=attempts, locked_until=case when attempts>=5 then now()+interval '5 minutes' else null end where staff_id=st.id;
    return jsonb_build_object('ok',false,'code','INVALID_PIN');
  end if;
  update public.staff_pin_credentials_v2 set failed_attempts=0, locked_until=null where staff_id=st.id;
  return jsonb_build_object('ok',true,'staffId',st.id,'legacyProfileId',st.legacy_profile_id,'role',(select name from public.roles where id=st.role_id),'pinResetRequired',pc.status='TEMPORARY_RESET');
end $$;

create or replace function public.begin_authenticated_terminal_staff_session(p_staff_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare t public.pos_terminals; st public.staff; s public.terminal_staff_sessions; session_id uuid;
begin
  session_id := nullif(auth.jwt()->>'session_id','')::uuid;
  select * into t from public.pos_terminals where auth_user_id=auth.uid() for update;
  select * into st from public.staff where id=p_staff_id and active;
  if not found or t.id is null or t.status<>'ACTIVE' or t.registration_status<>'REGISTERED'
     or st.company_id<>t.company_id or st.branch_id<>t.branch_id or st.legacy_profile_id is null then
    raise exception 'TERMINAL_STAFF_ACCESS_DENIED';
  end if;
  update public.terminal_staff_sessions set status='ENDED', ended_at=now() where terminal_id=t.id and status in ('ACTIVE','LOCKED');
  insert into public.terminal_staff_sessions(company_id,branch_id,terminal_id,staff_id,staff_record_id,actor_auth_user_id,auth_session_id,role,permissions)
  values (t.company_id,t.branch_id,t.id,st.legacy_profile_id,st.id,auth.uid(),session_id,(select name from public.roles where id=st.role_id),array(select pm.code from public.role_permissions rp join public.permissions pm on pm.id=rp.permission_id where rp.role_id=st.role_id))
  returning * into s;
  update public.pos_terminals set authenticated_at=now(),last_seen_at=now() where id=t.id;
  return to_jsonb(s);
end $$;

revoke all on function public.current_terminal_staff_session(), public.require_terminal_staff_session(), public.end_terminal_staff_session(), public.lock_terminal_staff_session(), public.list_authenticated_terminal_staff(), public.verify_authenticated_terminal_staff_pin(uuid,text), public.begin_authenticated_terminal_staff_session(uuid) from public, anon;
grant execute on function public.current_terminal_staff_session(), public.require_terminal_staff_session(), public.end_terminal_staff_session(), public.lock_terminal_staff_session(), public.list_authenticated_terminal_staff(), public.verify_authenticated_terminal_staff_pin(uuid,text), public.begin_authenticated_terminal_staff_session(uuid) to authenticated;

commit;
