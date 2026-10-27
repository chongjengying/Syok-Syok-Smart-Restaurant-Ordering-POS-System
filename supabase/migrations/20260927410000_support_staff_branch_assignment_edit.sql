begin;

drop function if exists public.admin_update_staff_record(uuid,text,text,uuid,boolean);

create or replace function public.admin_update_staff_record(
  p_staff_id uuid,
  p_name text,
  p_role text,
  p_branch_id uuid,
  p_active boolean,
  p_additional_branch_ids uuid[] default '{}'
) returns jsonb language plpgsql security definer set search_path=public as $$
declare actor public.profiles; target public.staff; branch_row public.branches; role_row public.roles; previous jsonb; active_admins integer; branch_id uuid; staff_profile_id uuid;
begin
  select * into actor from public.profiles where id=auth.uid() and status='ACTIVE';
  if not found or not public.has_pos_permission('user.edit') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into target from public.staff where id=p_staff_id and company_id=actor.company_id for update;
  if not found then raise exception 'STAFF_NOT_FOUND'; end if;
  select * into branch_row from public.branches where id=p_branch_id and company_id=actor.company_id;
  if not found then raise exception 'BRANCH_NOT_FOUND'; end if;
  if p_active and branch_row.status<>'ACTIVE' then raise exception 'BRANCH_INACTIVE'; end if;
  select * into role_row from public.roles where name=upper(btrim(p_role));
  if not found or role_row.name not in ('ADMIN','MANAGER','CASHIER','WAITER','KITCHEN') then raise exception 'INVALID_STAFF_ROLE'; end if;
  if target.role_id is distinct from role_row.id and not public.has_pos_permission('user.assign_role') then raise exception 'INSUFFICIENT_ROLE_ASSIGNMENT_PERMISSION'; end if;
  if not p_active and role_row.name='ADMIN' then
    perform pg_advisory_xact_lock(hashtextextended('active-admin-roster:'||actor.company_id::text,0));
    select count(*) into active_admins from public.profiles where company_id=actor.company_id and role_name='ADMIN' and status='ACTIVE';
    if active_admins<=1 and target.active then raise exception 'LAST_ACTIVE_ADMIN_REQUIRED'; end if;
  end if;
  foreach branch_id in array coalesce(p_additional_branch_ids,'{}') loop
    if branch_id=p_branch_id then continue; end if;
    if not exists(select 1 from public.branches where id=branch_id and company_id=actor.company_id and status='ACTIVE') then raise exception 'BRANCH_NOT_FOUND'; end if;
  end loop;
  if nullif(btrim(p_name),'') is null or length(btrim(p_name))>150 then raise exception 'INVALID_STAFF_NAME'; end if;
  previous:=to_jsonb(target); staff_profile_id:=target.legacy_profile_id;
  update public.staff set name=btrim(p_name),role_id=role_row.id,branch_id=branch_row.id,active=p_active,updated_at=now(),updated_by=auth.uid() where id=target.id returning * into target;
  update public.profiles set name=btrim(p_name),role_id=role_row.id,role_name=role_row.name,status=case when p_active then 'ACTIVE' else 'INACTIVE' end,branch_id=branch_row.id,default_branch_id=branch_row.id,updated_at=now() where id=staff_profile_id;
  insert into public.staff_branch_assignments(staff_id,branch_id,is_primary,status,assigned_by,assigned_at) values(staff_profile_id,p_branch_id,true,case when p_active then 'ACTIVE' else 'INACTIVE' end,auth.uid(),now()) on conflict(staff_id,branch_id) do update set is_primary=true,status=excluded.status,removed_at=null,updated_at=now();
  update public.staff_branch_assignments set is_primary=false,status=case when p_active then 'ACTIVE' else 'INACTIVE' end,removed_at=case when p_active then null else now() end,updated_at=now() where staff_id=staff_profile_id and branch_id<>p_branch_id and branch_id not in (select unnest(coalesce(p_additional_branch_ids,'{}')));
  foreach branch_id in array coalesce(p_additional_branch_ids,'{}') loop
    insert into public.staff_branch_assignments(staff_id,branch_id,is_primary,status,assigned_by,assigned_at) values(staff_profile_id,branch_id,false,case when p_active then 'ACTIVE' else 'INACTIVE' end,auth.uid(),now()) on conflict(staff_id,branch_id) do update set is_primary=false,status=excluded.status,removed_at=null,updated_at=now();
  end loop;
  if not p_active then update public.terminal_staff_sessions set status='ENDED',ended_at=coalesce(ended_at,now()),updated_at=now() where staff_record_id=target.id and status in ('ACTIVE','LOCKED'); end if;
  perform public.write_pos_audit_diff(case when p_active then 'STAFF_UPDATED' else 'STAFF_DEACTIVATED' end,'STAFF',target.id,null,previous,to_jsonb(target));
  return jsonb_build_object('id',target.id,'name',target.name,'branchId',target.branch_id,'role',role_row.name,'status',case when target.active then 'ACTIVE' else 'INACTIVE' end);
end; $$;

revoke all on function public.admin_update_staff_record(uuid,text,text,uuid,boolean,uuid[]) from public,anon;
grant execute on function public.admin_update_staff_record(uuid,text,text,uuid,boolean,uuid[]) to authenticated;
commit;
