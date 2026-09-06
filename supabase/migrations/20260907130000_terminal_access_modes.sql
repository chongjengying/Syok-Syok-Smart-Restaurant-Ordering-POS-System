begin;

alter table public.pos_terminals
  add column if not exists access_mode text not null default 'ROLE_RESTRICTED',
  add column if not exists allowed_roles text[] not null default array['ADMIN','MANAGER','WAITER'];
alter table public.pos_terminals drop constraint if exists pos_terminals_access_mode_check;
alter table public.pos_terminals add constraint pos_terminals_access_mode_check
  check (access_mode in ('ALL_BRANCH_STAFF','ROLE_RESTRICTED','STAFF_RESTRICTED'));
alter table public.pos_terminals drop constraint if exists pos_terminals_allowed_roles_check;
alter table public.pos_terminals add constraint pos_terminals_allowed_roles_check
  check (allowed_roles <@ array['ADMIN','MANAGER','WAITER','KITCHEN','CASHIER']::text[]);

create table if not exists public.terminal_staff_access (
  terminal_id uuid not null references public.pos_terminals(id) on delete cascade,
  staff_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (terminal_id, staff_id)
);
alter table public.terminal_staff_access enable row level security;
create index if not exists terminal_staff_access_staff_idx on public.terminal_staff_access(staff_id);

update public.pos_terminals
set access_mode='ROLE_RESTRICTED',
    allowed_roles=case when terminal_type='KDS' then array['ADMIN','MANAGER','KITCHEN'] else array['ADMIN','MANAGER','WAITER'] end
where access_mode is null or allowed_roles='{}';

create or replace function public.can_use_terminal(p_terminal_id uuid, p_staff_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.pos_terminals t
    join public.profiles p on p.branch_id=t.branch_id and p.id=p_staff_id
    join public.branches b on b.id=t.branch_id and b.status='ACTIVE'
    join public.companies c on c.id=b.company_id and c.status='ACTIVE'
    where t.id=p_terminal_id and t.status='ACTIVE' and t.registration_status='REGISTERED'
      and p.status='ACTIVE'
      and case t.access_mode
        when 'ALL_BRANCH_STAFF' then true
        when 'ROLE_RESTRICTED' then p.role_name=any(t.allowed_roles)
        when 'STAFF_RESTRICTED' then exists(select 1 from public.terminal_staff_access a where a.terminal_id=t.id and a.staff_id=p.id)
        else false
      end
  );
$$;
revoke all on function public.can_use_terminal(uuid,uuid) from public,anon;
grant execute on function public.can_use_terminal(uuid,uuid) to authenticated,service_role;

create or replace function public.save_terminal_access(
  p_terminal_id uuid, p_access_mode text, p_allowed_roles text[], p_staff_ids uuid[]
) returns public.pos_terminals language plpgsql security definer set search_path=public as $$
declare t public.pos_terminals; mode text:=upper(trim(p_access_mode)); role_list text[]:=coalesce(p_allowed_roles,array[]::text[]);
begin
  if not public.has_pos_permission('terminal.update') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into t from public.pos_terminals where id=p_terminal_id for update;
  if not found or not public.can_access_branch(t.branch_id) then raise exception 'TERMINAL_NOT_FOUND'; end if;
  if mode not in ('ALL_BRANCH_STAFF','ROLE_RESTRICTED','STAFF_RESTRICTED') then raise exception 'INVALID_TERMINAL_ACCESS_MODE'; end if;
  if exists(select 1 from unnest(role_list) r where r not in ('ADMIN','MANAGER','WAITER','KITCHEN','CASHIER')) then raise exception 'INVALID_TERMINAL_ROLE'; end if;
  if mode='ROLE_RESTRICTED' and cardinality(role_list)=0 then raise exception 'TERMINAL_ROLE_REQUIRED'; end if;
  if mode='STAFF_RESTRICTED' and cardinality(coalesce(p_staff_ids,array[]::uuid[]))=0 then raise exception 'TERMINAL_STAFF_REQUIRED'; end if;
  if exists(select 1 from public.profiles p where p.id=any(coalesce(p_staff_ids,array[]::uuid[])) and (p.branch_id<>t.branch_id or p.status<>'ACTIVE')) then raise exception 'STAFF_BRANCH_ACCESS_DENIED'; end if;
  update public.pos_terminals set access_mode=mode,allowed_roles=role_list,updated_at=now() where id=t.id returning * into t;
  delete from public.terminal_staff_access where terminal_id=t.id;
  if mode='STAFF_RESTRICTED' then insert into public.terminal_staff_access(terminal_id,staff_id) select t.id,unnest(p_staff_ids); end if;
  perform public.write_pos_audit_diff('TERMINAL_ACCESS_UPDATED','TERMINAL',t.id,null,null,jsonb_build_object('accessMode',mode,'allowedRoles',role_list,'staffCount',cardinality(coalesce(p_staff_ids,array[]::uuid[]))));
  return t;
end $$;
revoke all on function public.save_terminal_access(uuid,text,text[],uuid[]) from public,anon;
grant execute on function public.save_terminal_access(uuid,text,text[],uuid[]) to authenticated;

create or replace function public.begin_terminal_staff_session(p_actor uuid,p_staff_id uuid,p_device_identifier text,p_auth_session_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare t public.pos_terminals; p public.profiles; s public.terminal_staff_sessions;
begin
  select * into t from public.pos_terminals where device_identifier=p_device_identifier for update;
  if not found or t.status<>'ACTIVE' or t.registration_status<>'REGISTERED' then raise exception 'TERMINAL_INVALID'; end if;
  if not public.can_use_terminal(t.id,p_staff_id) then raise exception 'TERMINAL_STAFF_ACCESS_DENIED'; end if;
  select * into p from public.profiles where id=p_staff_id and status='ACTIVE' and branch_id=t.branch_id;
  if not found then raise exception 'STAFF_BRANCH_ACCESS_DENIED'; end if;
  if not exists(select 1 from auth.sessions where id=p_auth_session_id and user_id=p_staff_id) then raise exception 'INVALID_AUTH_SESSION'; end if;
  update public.terminal_staff_sessions set status='ENDED',ended_at=now() where terminal_id=t.id and status in ('ACTIVE','LOCKED');
  insert into public.terminal_staff_sessions(company_id,branch_id,terminal_id,staff_id,actor_auth_user_id,auth_session_id,role,permissions)
  values(t.company_id,t.branch_id,t.id,p.id,p_actor,p_auth_session_id,p.role_name,array(select pm.code from public.role_permissions rp join public.permissions pm on pm.id=rp.permission_id where rp.role_id=p.role_id)) returning * into s;
  update public.pos_terminals set last_seen_at=now() where id=t.id;
  return to_jsonb(s);
end $$;
commit;
