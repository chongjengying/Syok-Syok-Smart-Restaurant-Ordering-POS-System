begin;

-- Reconcile staff created by the Auth-free staff module with the legacy branch
-- assignment model still used by branch management and historical POS flows.
insert into public.staff_branch_assignments(staff_id, branch_id, is_primary, status, assigned_at)
select s.legacy_profile_id, s.branch_id, true, case when s.active then 'ACTIVE' else 'INACTIVE' end, s.created_at
from public.staff s
where s.legacy_profile_id is not null
on conflict (staff_id, branch_id) do update
  set status = case when excluded.status = 'ACTIVE' then 'ACTIVE' else public.staff_branch_assignments.status end,
      updated_at = now();

create or replace function public.create_admin_staff_record(
  p_branch_id uuid, p_staff_code text, p_name text, p_role text, p_temporary_pin text
) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare b public.branches; r public.roles; legacy_id uuid:=gen_random_uuid(); staff_id uuid;
begin
  if p_staff_code !~ '^[A-Za-z0-9_-]{2,50}$' or length(trim(p_name))<2 or length(trim(p_name))>150 or p_temporary_pin !~ '^[0-9]{6}$' then raise exception 'INVALID_STAFF_INPUT'; end if;
  select * into b from public.branches where id=p_branch_id and status='ACTIVE';
  if not found then raise exception 'BRANCH_NOT_FOUND'; end if;
  select * into r from public.roles where name=upper(trim(p_role));
  if not found or r.name='ADMIN' then raise exception 'INVALID_STAFF_ROLE'; end if;
  if exists(select 1 from public.staff where company_id=b.company_id and staff_code=upper(trim(p_staff_code))) then raise exception 'STAFF_CODE_EXISTS'; end if;
  insert into public.profiles(id,role_id,role_name,name,username,email,password_hash,status,company_id,branch_id,default_branch_id)
    values(legacy_id,r.id,r.name,trim(p_name),lower(trim(p_staff_code)),null,'staff_pin_only','ACTIVE',b.company_id,b.id,b.id);
  insert into public.staff(staff_code,name,company_id,branch_id,role_id,legacy_profile_id,updated_by)
    values(upper(trim(p_staff_code)),trim(p_name),b.company_id,b.id,r.id,legacy_id,auth.uid()) returning id into staff_id;
  insert into public.staff_branch_assignments(staff_id,branch_id,is_primary,status,assigned_by,assigned_at)
    values(legacy_id,b.id,true,'ACTIVE',auth.uid(),now());
  insert into public.staff_pin_credentials_v2(staff_id,pin_hash,status,changed_by)
    values(staff_id,crypt(p_temporary_pin,gen_salt('bf',12)),'TEMPORARY_RESET',auth.uid());
  perform public.write_pos_audit('STAFF_CREATED','STAFF',staff_id,null,jsonb_build_object('staffCode',upper(trim(p_staff_code)),'branchId',b.id,'role',r.name));
  return jsonb_build_object('id',staff_id,'legacyProfileId',legacy_id,'staffCode',upper(trim(p_staff_code)),'name',trim(p_name),'role',r.name,'branchId',b.id,'pinStatus','TEMPORARY_RESET');
end $$;

revoke all on function public.create_admin_staff_record(uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.create_admin_staff_record(uuid,text,text,text,text) to service_role;

commit;
