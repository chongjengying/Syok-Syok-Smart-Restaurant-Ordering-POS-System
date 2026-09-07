begin;

-- Staff access is assignment-based. profiles.branch_id remains the primary
-- branch for defaults and reporting, never the sole authorization source.
create or replace function public.staff_has_branch(p_staff_id uuid,p_branch_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1
    from public.staff_branch_assignments a
    join public.profiles p on p.id=a.staff_id
    join public.branches b on b.id=a.branch_id and b.company_id=p.company_id and b.status='ACTIVE'
    where a.staff_id=p_staff_id and a.branch_id=p_branch_id
      and a.status='ACTIVE' and p.status='ACTIVE'
  );
$$;

create or replace function public.can_use_terminal(p_terminal_id uuid,p_staff_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1
    from public.pos_terminals t
    join public.branches b on b.id=t.branch_id and b.status='ACTIVE' and b.company_id=t.company_id
    join public.companies c on c.id=b.company_id and c.status='ACTIVE'
    join public.profiles p on p.id=p_staff_id and p.company_id=c.id and p.status='ACTIVE'
    where t.id=p_terminal_id and t.status='ACTIVE' and t.registration_status='REGISTERED'
      and public.staff_has_branch(p.id,t.branch_id)
      and case t.access_mode
        when 'ALL_BRANCH_STAFF' then true
        when 'ROLE_RESTRICTED' then p.role_name=any(t.allowed_roles)
        when 'STAFF_RESTRICTED' then exists(select 1 from public.terminal_staff_access a where a.terminal_id=t.id and a.staff_id=p.id)
        else false
      end
  );
$$;

create or replace function public.list_terminal_branch_staff(p_device_identifier text)
returns table(id uuid,name text,role text,pin_status text,pin_setup_required boolean,temporary_pin_required boolean)
language plpgsql stable security definer set search_path=public as $$
declare t public.pos_terminals;
begin
  if not public.is_active_pos_user() then raise exception 'ACTIVE_PROFILE_REQUIRED'; end if;
  select * into t from public.pos_terminals where device_identifier=p_device_identifier and status='ACTIVE' and registration_status='REGISTERED';
  if not found then raise exception 'TERMINAL_INVALID'; end if;
  if not exists(select 1 from public.branches b join public.companies c on c.id=b.company_id where b.id=t.branch_id and b.status='ACTIVE' and c.status='ACTIVE') then raise exception 'BRANCH_INACTIVE'; end if;
  return query
    select p.id,p.name::text,p.role_name::text,coalesce(sc.status,'SETUP_REQUIRED'),sc.user_id is null or sc.status='SETUP_REQUIRED',sc.status='TEMPORARY_RESET'
    from public.profiles p left join public.staff_pin_credentials sc on sc.user_id=p.id
    where p.status='ACTIVE' and public.can_use_terminal(t.id,p.id)
    order by case p.role_name when 'ADMIN' then 1 when 'MANAGER' then 2 when 'WAITER' then 3 else 4 end,p.name;
end $$;

create or replace function public.begin_terminal_staff_session(p_actor uuid,p_staff_id uuid,p_device_identifier text,p_auth_session_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare t public.pos_terminals; p public.profiles; s public.terminal_staff_sessions; existing public.terminal_staff_sessions;
begin
  select * into t from public.pos_terminals where device_identifier=p_device_identifier for update;
  if not found or t.status<>'ACTIVE' or t.registration_status<>'REGISTERED' then raise exception 'TERMINAL_INVALID'; end if;
  if not public.can_use_terminal(t.id,p_staff_id) then raise exception 'TERMINAL_STAFF_ACCESS_DENIED'; end if;
  select * into p from public.profiles where id=p_staff_id and status='ACTIVE' and company_id=t.company_id;
  if not found or not public.staff_has_branch(p.id,t.branch_id) then raise exception 'STAFF_BRANCH_ACCESS_DENIED'; end if;
  if not exists(select 1 from auth.sessions where id=p_auth_session_id and user_id=p_staff_id) then raise exception 'INVALID_AUTH_SESSION'; end if;
  select * into existing from public.terminal_staff_sessions where staff_id=p_staff_id and status in ('ACTIVE','LOCKED') for update;
  if found and existing.terminal_id<>t.id then raise exception 'STAFF_ALREADY_ACTIVE_ON_TERMINAL'; end if;
  update public.terminal_staff_sessions set status='ENDED',ended_at=now() where terminal_id=t.id and status in ('ACTIVE','LOCKED');
  insert into public.terminal_staff_sessions(company_id,branch_id,terminal_id,staff_id,actor_auth_user_id,auth_session_id,role,permissions)
  values(t.company_id,t.branch_id,t.id,p.id,p_actor,p_auth_session_id,p.role_name,array(select pm.code from public.role_permissions rp join public.permissions pm on pm.id=rp.permission_id where rp.role_id=p.role_id)) returning * into s;
  update public.pos_terminals set last_seen_at=now() where id=t.id;
  return to_jsonb(s);
end $$;

-- Staff updates must stay inside the caller's tenant, including when the
-- target profile supplies a different branch in the payload.
create or replace function public.admin_update_staff(p_user_id uuid,p_payload jsonb)
returns public.profiles language plpgsql security definer set search_path=public as $$
declare target public.profiles%rowtype; requested_role text; requested_status text; requested_role_id uuid; requested_branch_id uuid; active_admins integer; branch_id uuid;
begin
  if not public.has_pos_permission('user.edit') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into target from public.profiles where id=p_user_id for update;
  if not found or target.company_id is distinct from public.current_user_company_id() then raise exception 'USER_NOT_FOUND'; end if;
  requested_role:=upper(coalesce(nullif(btrim(p_payload->>'role'),''),target.role_name));
  requested_status:=upper(coalesce(nullif(btrim(p_payload->>'status'),''),target.status));
  if requested_status not in ('ACTIVE','INACTIVE','LOCKED') then raise exception 'INVALID_USER_STATUS'; end if;
  if p_payload ? 'username' and nullif(btrim(p_payload->>'username'),'') is not null and lower(btrim(p_payload->>'username')) !~ '^[a-z0-9._-]{3,50}$' then raise exception 'INVALID_USERNAME'; end if;
  select id into requested_role_id from public.roles where name=requested_role; if not found then raise exception 'INVALID_ROLE'; end if;
  requested_branch_id:=nullif(p_payload->>'branchId','')::uuid;
  if requested_branch_id is null then requested_branch_id:=target.branch_id; end if;
  if requested_branch_id is null or not public.can_access_branch(requested_branch_id) then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if not exists(select 1 from public.branches where id=requested_branch_id and company_id=target.company_id and status='ACTIVE') then raise exception 'INVALID_BRANCH'; end if;
  if requested_role is distinct from target.role_name and not public.has_pos_permission('user.assign_role') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if target.role_name='ADMIN' and target.status='ACTIVE' and (requested_role<>'ADMIN' or requested_status<>'ACTIVE') then
    perform pg_advisory_xact_lock(hashtextextended('active-admin-roster',0)); select count(*) into active_admins from public.profiles where company_id=target.company_id and role_name='ADMIN' and status='ACTIVE'; if active_admins<=1 then raise exception 'LAST_ACTIVE_ADMIN_REQUIRED'; end if;
  end if;
  perform set_config('app.admin_profile_write','allowed',true);
  update public.profiles set name=coalesce(nullif(left(btrim(p_payload->>'name'),150),''),name),username=case when p_payload ? 'username' then nullif(left(lower(btrim(p_payload->>'username')),50),'') else username end,role_id=requested_role_id,role_name=requested_role,status=requested_status,branch_id=requested_branch_id,updated_at=now() where id=p_user_id returning * into target;
  perform public.assign_user_branch(p_user_id,requested_branch_id,true);
  if target.status='ACTIVE' then
    for branch_id in select value::uuid from jsonb_array_elements_text(coalesce(p_payload->'additionalBranches','[]'::jsonb)) value where value::uuid<>requested_branch_id loop
      perform public.assign_user_branch(p_user_id,branch_id,false);
    end loop;
  end if;
  return target;
end $$;

revoke all on function public.can_use_terminal(uuid,uuid),public.list_terminal_branch_staff(text),public.begin_terminal_staff_session(uuid,uuid,text,uuid),public.admin_update_staff(uuid,jsonb) from public,anon;
grant execute on function public.can_use_terminal(uuid,uuid),public.list_terminal_branch_staff(text),public.begin_terminal_staff_session(uuid,uuid,text,uuid),public.admin_update_staff(uuid,jsonb) to authenticated;
grant execute on function public.begin_terminal_staff_session(uuid,uuid,text,uuid) to service_role;
commit;
