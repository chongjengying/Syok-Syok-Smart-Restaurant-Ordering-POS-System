begin;

alter table public.profiles add column if not exists phone text;

create or replace function public.create_admin_staff_record(
  p_branch_id uuid,
  p_staff_code text,
  p_name text,
  p_role text,
  p_temporary_pin text,
  p_email text default null,
  p_phone text default null,
  p_additional_branch_ids uuid[] default '{}',
  p_status text default 'ACTIVE',
  p_pin_mode text default 'ADMIN_TEMPORARY'
)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare
  created jsonb;
  legacy_id uuid;
  staff_id uuid;
  branch_row public.branches;
  additional_id uuid;
  next_status text := upper(coalesce(p_status,'ACTIVE'));
  next_pin_mode text := upper(coalesce(p_pin_mode,'ADMIN_TEMPORARY'));
begin
  if next_status not in ('ACTIVE','INACTIVE') then raise exception 'INVALID_STAFF_STATUS'; end if;
  if next_pin_mode not in ('STAFF_SET','ADMIN_TEMPORARY') then raise exception 'INVALID_PIN_MODE'; end if;
  if p_email is not null and p_email !~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'INVALID_STAFF_EMAIL'; end if;
  if p_phone is not null and length(p_phone)>40 then raise exception 'INVALID_STAFF_PHONE'; end if;
  select * into branch_row from public.branches where id=p_branch_id and status='ACTIVE';
  if not found then raise exception 'BRANCH_NOT_FOUND'; end if;
  foreach additional_id in array coalesce(p_additional_branch_ids,'{}') loop
    if additional_id=p_branch_id then continue; end if;
    if not exists(select 1 from public.branches where id=additional_id and company_id=branch_row.company_id and status='ACTIVE') then raise exception 'BRANCH_NOT_FOUND'; end if;
  end loop;
  select public.create_admin_staff_record(p_branch_id,p_staff_code,p_name,p_role,p_temporary_pin) into created;
  legacy_id := (created->>'legacyProfileId')::uuid;
  staff_id := (created->>'id')::uuid;
  update public.profiles set email=nullif(lower(trim(p_email)),''),phone=nullif(trim(p_phone),''),status=next_status,updated_at=now() where id=legacy_id;
  update public.staff set active=next_status='ACTIVE',updated_at=now(),updated_by=auth.uid() where id=staff_id;
  perform public.assign_user_branch(legacy_id,p_branch_id,true);
  foreach additional_id in array coalesce(p_additional_branch_ids,'{}') loop
    if additional_id<>p_branch_id then perform public.assign_user_branch(legacy_id,additional_id,false); end if;
  end loop;
  if next_pin_mode='STAFF_SET' then
    update public.staff_pin_credentials_v2 set status='SETUP_REQUIRED',pin_hash=null,changed_at=now(),changed_by=auth.uid() where staff_id=staff_id;
  end if;
  return created || jsonb_build_object('status',next_status,'pinStatus',case when next_pin_mode='STAFF_SET' then 'SETUP_REQUIRED' else 'TEMPORARY_RESET' end);
end;
$$;

revoke all on function public.create_admin_staff_record(uuid,text,text,text,text,text,text,uuid[],text,text) from public,anon,authenticated;
grant execute on function public.create_admin_staff_record(uuid,text,text,text,text,text,text,uuid[],text,text) to service_role;

commit;
