begin;

create or replace function public.create_admin_staff_record(p_branch_id uuid, p_staff_code text, p_name text, p_role text, p_temporary_pin text)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
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
  insert into public.staff_pin_credentials_v2(staff_id,pin_hash,status,changed_by)
  values(staff_id,crypt(p_temporary_pin,gen_salt('bf',12)),'TEMPORARY_RESET',auth.uid());
  perform public.write_pos_audit('STAFF_CREATED','STAFF',staff_id,null,jsonb_build_object('staffCode',upper(trim(p_staff_code)),'branchId',b.id,'role',r.name));
  return jsonb_build_object('id',staff_id,'legacyProfileId',legacy_id,'staffCode',upper(trim(p_staff_code)),'name',trim(p_name),'role',r.name,'branchId',b.id,'pinStatus','TEMPORARY_RESET');
end $$;

create or replace function public.set_authenticated_terminal_staff_pin(p_staff_id uuid, p_pin text)
returns void language plpgsql security definer set search_path=public,extensions as $$
declare s public.terminal_staff_sessions; c public.staff_pin_credentials_v2;
begin
  if p_pin !~ '^[0-9]{6}$' or p_pin ~ '^(\d)\1{5}$' or p_pin in ('012345','123456','234567','345678','456789','567890','987654','876543','765432','654321','543210') then raise exception 'INVALID_STAFF_PIN'; end if;
  s:=public.require_terminal_staff_session();
  if s.staff_record_id is distinct from p_staff_id then raise exception 'STAFF_SESSION_MISMATCH'; end if;
  if exists(select 1 from public.staff_pin_credentials_v2 x where x.staff_id<>p_staff_id and x.status='ACTIVE' and x.pin_hash is not null and x.pin_hash=crypt(p_pin,x.pin_hash)) then raise exception 'STAFF_PIN_ALREADY_IN_USE'; end if;
  select * into c from public.staff_pin_credentials_v2 where staff_id=p_staff_id for update;
  if not found then raise exception 'STAFF_PIN_NOT_FOUND'; end if;
  update public.staff_pin_credentials_v2 set pin_hash=crypt(p_pin,gen_salt('bf',12)),status='ACTIVE',failed_attempts=0,locked_until=null,changed_at=now(),changed_by=auth.uid() where staff_id=p_staff_id;
  perform public.write_pos_audit('STAFF_PIN_CHANGED','STAFF',p_staff_id,null,jsonb_build_object('terminalId',s.terminal_id));
end $$;

drop function if exists public.list_authenticated_terminal_staff();
create function public.list_authenticated_terminal_staff()
returns table(id uuid, staff_code text, name text, role text, pin_status text, pin_setup_required boolean, temporary_pin_required boolean)
language sql stable security definer set search_path=public as $$
  select st.id,st.staff_code,st.name,r.name,coalesce(pc.status,'SETUP_REQUIRED'),pc.staff_id is null or pc.status='SETUP_REQUIRED',pc.status='TEMPORARY_RESET'
  from public.pos_terminals t
  join public.branches b on b.id=t.branch_id and b.status='ACTIVE'
  join public.companies co on co.id=t.company_id and co.status='ACTIVE'
  join public.staff st on st.branch_id=t.branch_id and st.company_id=t.company_id and st.active
  join public.roles r on r.id=st.role_id
  left join public.staff_pin_credentials_v2 pc on pc.staff_id=st.id
  where t.auth_user_id=auth.uid() and t.status='ACTIVE' and t.registration_status='REGISTERED'
    and public.can_use_terminal(t.id,st.legacy_profile_id)
  order by st.name;
$$;

create or replace function public.verify_authenticated_terminal_staff_pin(p_staff_id uuid, p_pin text)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare t public.pos_terminals; st public.staff; pc public.staff_pin_credentials_v2; attempts smallint;
begin
  if p_pin !~ '^[0-9]{6}$' then return jsonb_build_object('ok',false,'code','INVALID_PIN'); end if;
  select * into t from public.pos_terminals where auth_user_id=auth.uid() for update;
  if not found or t.status<>'ACTIVE' or t.registration_status<>'REGISTERED' or t.lock_status='LOCKED' then return jsonb_build_object('ok',false,'code','TERMINAL_UNAVAILABLE'); end if;
  select * into st from public.staff where id=p_staff_id and active and company_id=t.company_id and branch_id=t.branch_id and public.can_use_terminal(t.id,legacy_profile_id);
  if not found then return jsonb_build_object('ok',false,'code','STAFF_ACCESS_DENIED'); end if;
  select * into pc from public.staff_pin_credentials_v2 where staff_id=st.id for update;
  if not found or pc.status='SETUP_REQUIRED' or pc.pin_hash is null then return jsonb_build_object('ok',false,'code','PIN_SETUP_REQUIRED'); end if;
  if pc.locked_until is not null and pc.locked_until>now() then return jsonb_build_object('ok',false,'code','PIN_LOCKED'); end if;
  if pc.pin_hash<>crypt(p_pin,pc.pin_hash) then attempts:=least(pc.failed_attempts+1,20); update public.staff_pin_credentials_v2 set failed_attempts=attempts,locked_until=case when attempts>=5 then now()+interval '5 minutes' else null end where staff_id=st.id; return jsonb_build_object('ok',false,'code','INVALID_PIN'); end if;
  update public.staff_pin_credentials_v2 set failed_attempts=0,locked_until=null where staff_id=st.id;
  return jsonb_build_object('ok',true,'staffId',st.id,'legacyProfileId',st.legacy_profile_id,'role',(select name from public.roles where id=st.role_id),'pinResetRequired',pc.status='TEMPORARY_RESET');
end $$;

revoke all on function public.create_admin_staff_record(uuid,text,text,text,text), public.set_authenticated_terminal_staff_pin(uuid,text) from public, anon, authenticated;
grant execute on function public.create_admin_staff_record(uuid,text,text,text,text) to service_role;
grant execute on function public.set_authenticated_terminal_staff_pin(uuid,text) to authenticated;

commit;
