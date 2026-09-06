begin;
create or replace function public.admin_update_staff(p_user_id uuid,p_payload jsonb) returns public.profiles
language plpgsql security definer set search_path=public as $$
declare target public.profiles%rowtype; requested_role text; requested_status text; requested_role_id uuid; requested_branch_id uuid; active_admins integer; branch_id uuid;
begin
 if not public.has_pos_permission('user.edit') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 select * into target from public.profiles where id=p_user_id for update; if not found then raise exception 'USER_NOT_FOUND'; end if;
 requested_role:=upper(coalesce(nullif(btrim(p_payload->>'role'),''),target.role_name)); requested_status:=upper(coalesce(nullif(btrim(p_payload->>'status'),''),target.status));
 if requested_status not in ('ACTIVE','INACTIVE','LOCKED') then raise exception 'INVALID_USER_STATUS'; end if;
 select id into requested_role_id from public.roles where name=requested_role; if not found then raise exception 'INVALID_ROLE'; end if;
 requested_branch_id:=nullif(p_payload->>'branchId','')::uuid;
 if requested_branch_id is null then requested_branch_id:=target.branch_id; end if;
 if requested_branch_id is null then raise exception 'PRIMARY_BRANCH_REQUIRED'; end if;
 if not public.can_access_branch(requested_branch_id) then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 if not exists(select 1 from public.branches where id=requested_branch_id and status='ACTIVE') then raise exception 'INVALID_BRANCH'; end if;
 if requested_role is distinct from target.role_name and not public.has_pos_permission('user.assign_role') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 if target.role_name='ADMIN' and target.status='ACTIVE' and (requested_role<>'ADMIN' or requested_status<>'ACTIVE') then
   perform pg_advisory_xact_lock(hashtextextended('active-admin-roster',0)); select count(*) into active_admins from public.profiles where role_name='ADMIN' and status='ACTIVE'; if active_admins<=1 then raise exception 'LAST_ACTIVE_ADMIN_REQUIRED'; end if;
 end if;
 perform set_config('app.admin_profile_write','allowed',true);
 update public.profiles set name=coalesce(nullif(left(btrim(p_payload->>'name'),150),''),name),username=case when p_payload ? 'username' then nullif(left(lower(btrim(p_payload->>'username')),50),'') else username end,role_id=requested_role_id,role_name=requested_role,status=requested_status,branch_id=requested_branch_id where id=p_user_id returning * into target;
 perform public.assign_user_branch(p_user_id,requested_branch_id,true);
 if target.status='ACTIVE' then
   for branch_id in select value::uuid from jsonb_array_elements_text(coalesce(p_payload->'additionalBranches','[]'::jsonb)) value where value::uuid<>requested_branch_id loop perform public.assign_user_branch(p_user_id,branch_id,false); end loop;
 end if;
 perform public.write_pos_audit_diff(case when target.created_at=target.updated_at then 'STAFF_CREATED' else 'STAFF_UPDATED' end,'PROFILE',target.id,null,null,to_jsonb(target));
 return target;
end $$;
commit;
