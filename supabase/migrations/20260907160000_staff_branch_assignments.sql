begin;
create table if not exists public.staff_branch_assignments (
 id uuid primary key default gen_random_uuid(),
 staff_id uuid not null references public.profiles(id) on delete cascade,
 branch_id uuid not null references public.branches(id) on delete restrict,
 is_primary boolean not null default false,
 status text not null default 'ACTIVE' check(status in ('ACTIVE','INACTIVE')),
 assigned_by uuid references public.profiles(id) on delete set null,
 assigned_at timestamptz not null default now(),
 removed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(staff_id,branch_id)
);
create unique index if not exists one_primary_staff_branch on public.staff_branch_assignments(staff_id) where is_primary and status='ACTIVE';
create index if not exists staff_branch_assignments_branch_idx on public.staff_branch_assignments(branch_id,status);
alter table public.staff_branch_assignments enable row level security;
create policy staff_assignment_read on public.staff_branch_assignments for select to authenticated using(public.can_access_branch(branch_id) or staff_id=auth.uid());
create policy staff_assignment_manage on public.staff_branch_assignments for all to authenticated using(public.has_pos_permission('user.edit') and public.can_access_branch(branch_id)) with check(public.has_pos_permission('user.edit') and public.can_access_branch(branch_id));

insert into public.staff_branch_assignments(staff_id,branch_id,is_primary,status)
select p.id,p.branch_id,true,case when p.status='ACTIVE' then 'ACTIVE' else 'INACTIVE' end
from public.profiles p join public.branches b on b.id=p.branch_id
where p.branch_id is not null
on conflict(staff_id,branch_id) do update set is_primary=true,status=case when excluded.status='ACTIVE' then 'ACTIVE' else public.staff_branch_assignments.status end;

create or replace function public.staff_has_branch(p_staff_id uuid,p_branch_id uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.staff_branch_assignments a where a.staff_id=p_staff_id and a.branch_id=p_branch_id and a.status='ACTIVE');
$$;
create or replace function public.can_access_branch(p_branch_id uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and p.status='ACTIVE' and (p.role_name='ADMIN' or public.staff_has_branch(p.id,p_branch_id)));
$$;

create or replace function public.assign_user_branch(p_user_id uuid,p_branch_id uuid,p_is_primary boolean default false) returns public.staff_branch_assignments language plpgsql security definer set search_path=public as $$
declare result public.staff_branch_assignments; old jsonb;
begin
 if not public.has_pos_permission('user.edit') or not public.can_access_branch(p_branch_id) then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 if not exists(select 1 from public.profiles where id=p_user_id and status='ACTIVE') then raise exception 'STAFF_NOT_ACTIVE'; end if;
 if not exists(select 1 from public.branches where id=p_branch_id and status='ACTIVE') then raise exception 'INVALID_BRANCH'; end if;
 select to_jsonb(a) into old from public.staff_branch_assignments a where a.staff_id=p_user_id and a.branch_id=p_branch_id;
 if p_is_primary then update public.staff_branch_assignments set is_primary=false,updated_at=now() where staff_id=p_user_id and is_primary; end if;
 insert into public.staff_branch_assignments(staff_id,branch_id,is_primary,status,assigned_by,assigned_at,removed_at)
 values(p_user_id,p_branch_id,p_is_primary,'ACTIVE',auth.uid(),now(),null)
 on conflict(staff_id,branch_id) do update set is_primary=excluded.is_primary,status='ACTIVE',assigned_by=auth.uid(),assigned_at=coalesce(public.staff_branch_assignments.assigned_at,now()),removed_at=null,updated_at=now()
 returning * into result;
 update public.profiles set branch_id=(select branch_id from public.staff_branch_assignments where staff_id=p_user_id and is_primary and status='ACTIVE' limit 1),updated_at=now() where id=p_user_id;
 perform public.write_pos_audit_diff(case when old is null then 'STAFF_BRANCH_ASSIGNED' when (old->>'status')='INACTIVE' then 'STAFF_BRANCH_ACTIVATED' else 'STAFF_PRIMARY_BRANCH_CHANGED' end,'STAFF_BRANCH_ASSIGNMENT',result.id,null,old,to_jsonb(result));
 return result;
end $$;
create or replace function public.set_staff_branch_assignment_status(p_assignment_id uuid,p_status text) returns public.staff_branch_assignments language plpgsql security definer set search_path=public as $$
declare a public.staff_branch_assignments; old jsonb; next_status text:=upper(p_status);
begin
 if next_status not in ('ACTIVE','INACTIVE') then raise exception 'INVALID_ASSIGNMENT_STATUS'; end if;
 select * into a from public.staff_branch_assignments where id=p_assignment_id for update;
 if not found or not public.can_access_branch(a.branch_id) or not public.has_pos_permission('user.edit') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 if next_status='ACTIVE' and not exists(select 1 from public.profiles where id=a.staff_id and status='ACTIVE') then raise exception 'STAFF_NOT_ACTIVE'; end if;
 old:=to_jsonb(a); update public.staff_branch_assignments set status=next_status,removed_at=case when next_status='INACTIVE' then now() else null end,updated_at=now() where id=a.id returning * into a;
 if a.is_primary and next_status='INACTIVE' then update public.profiles set branch_id=null,updated_at=now() where id=a.staff_id and branch_id=a.branch_id; end if;
 perform public.write_pos_audit_diff(case when next_status='ACTIVE' then 'STAFF_BRANCH_ACTIVATED' else 'STAFF_BRANCH_REMOVED' end,'STAFF_BRANCH_ASSIGNMENT',a.id,null,old,to_jsonb(a)); return a;
end $$;
create or replace function public.list_terminal_branch_staff(p_device_identifier text) returns table(id uuid,name text,role text,pin_status text,pin_setup_required boolean,temporary_pin_required boolean) language plpgsql stable security definer set search_path=public as $$
declare t public.pos_terminals;
begin
 select * into t from public.pos_terminals where device_identifier=p_device_identifier and status='ACTIVE' and registration_status='REGISTERED';
 if not found then raise exception 'TERMINAL_INVALID'; end if;
 return query select p.id,p.name::text,p.role_name::text,coalesce(sc.status,'SETUP_REQUIRED'),sc.user_id is null or sc.status='SETUP_REQUIRED',sc.status='TEMPORARY_RESET'
 from public.profiles p join public.staff_branch_assignments a on a.staff_id=p.id and a.branch_id=t.branch_id and a.status='ACTIVE' left join public.staff_pin_credentials sc on sc.user_id=p.id
 where p.status='ACTIVE' and public.can_use_terminal(t.id,p.id) order by p.name;
end $$;
create or replace function public.begin_terminal_staff_session(p_actor uuid,p_staff_id uuid,p_device_identifier text,p_auth_session_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare t public.pos_terminals; p public.profiles; s public.terminal_staff_sessions;
begin
 select * into t from public.pos_terminals where device_identifier=p_device_identifier for update;
 if not found or t.status<>'ACTIVE' or t.registration_status<>'REGISTERED' then raise exception 'TERMINAL_INVALID'; end if;
 if not public.staff_has_branch(p_staff_id,t.branch_id) then raise exception 'STAFF_BRANCH_ACCESS_DENIED'; end if;
 if not public.can_use_terminal(t.id,p_staff_id) then raise exception 'TERMINAL_STAFF_ACCESS_DENIED'; end if;
 select * into p from public.profiles where id=p_staff_id and status='ACTIVE'; if not found then raise exception 'STAFF_NOT_ACTIVE'; end if;
 if not exists(select 1 from auth.sessions where id=p_auth_session_id and user_id=p_staff_id) then raise exception 'INVALID_AUTH_SESSION'; end if;
 update public.terminal_staff_sessions set status='ENDED',ended_at=now() where terminal_id=t.id and status in ('ACTIVE','LOCKED');
 insert into public.terminal_staff_sessions(company_id,branch_id,terminal_id,staff_id,actor_auth_user_id,auth_session_id,role,permissions) values(t.company_id,t.branch_id,t.id,p.id,p_actor,p_auth_session_id,p.role_name,array(select pm.code from public.role_permissions rp join public.permissions pm on pm.id=rp.permission_id where rp.role_id=p.role_id)) returning * into s;
 update public.pos_terminals set last_seen_at=now() where id=t.id; return to_jsonb(s);
end $$;
revoke all on function public.assign_user_branch(uuid,uuid,boolean),public.set_staff_branch_assignment_status(uuid,text) from public,anon;
grant execute on function public.assign_user_branch(uuid,uuid,boolean),public.set_staff_branch_assignment_status(uuid,text) to authenticated;
commit;
