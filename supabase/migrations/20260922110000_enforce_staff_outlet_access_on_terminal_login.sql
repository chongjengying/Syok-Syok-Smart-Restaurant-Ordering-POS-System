begin;

create or replace function public.verify_authenticated_terminal_staff_pin(p_staff_id uuid, p_pin text)
returns jsonb language plpgsql security definer set search_path=public, extensions
as $$
declare t public.pos_terminals; st public.staff; pc public.staff_pin_credentials_v2; attempts smallint; allowed boolean; outlet_allowed boolean;
begin
  if p_pin !~ '^[0-9]{6}$' then return jsonb_build_object('ok',false,'code','INVALID_PIN'); end if;
  select * into t from public.pos_terminals where auth_user_id=auth.uid() for update;
  if not found or t.status<>'ACTIVE' or t.registration_status<>'REGISTERED' or t.lock_status='LOCKED' then return jsonb_build_object('ok',false,'code','TERMINAL_UNAVAILABLE'); end if;
  select * into st from public.staff where id=p_staff_id and active and company_id=t.company_id;
  if not found then return jsonb_build_object('ok',false,'code','STAFF_ACCESS_DENIED'); end if;
  outlet_allowed := st.branch_id=t.branch_id or exists(select 1 from public.staff_branch_assignments a where a.staff_id=st.legacy_profile_id and a.branch_id=t.branch_id and a.status='ACTIVE');
  if not outlet_allowed then return jsonb_build_object('ok',false,'code','STAFF_OUTLET_ACCESS_DENIED'); end if;
  allowed := t.access_mode='ALL_BRANCH_STAFF' or (t.access_mode='ROLE_RESTRICTED' and exists(select 1 from public.roles r where r.id=st.role_id and r.name=any(t.allowed_roles))) or exists(select 1 from public.terminal_staff_access a where a.terminal_id=t.id and a.staff_id=st.id);
  if not allowed then return jsonb_build_object('ok',false,'code','STAFF_TERMINAL_ACCESS_DENIED'); end if;
  select * into pc from public.staff_pin_credentials_v2 where staff_id=st.id for update;
  if not found or pc.status='SETUP_REQUIRED' or pc.pin_hash is null then return jsonb_build_object('ok',false,'code','PIN_SETUP_REQUIRED'); end if;
  if pc.locked_until is not null and pc.locked_until>now() then return jsonb_build_object('ok',false,'code','PIN_LOCKED'); end if;
  if pc.pin_hash <> crypt(p_pin,pc.pin_hash) then
    attempts:=least(pc.failed_attempts+1,20); update public.staff_pin_credentials_v2 set failed_attempts=attempts,locked_until=case when attempts>=5 then now()+interval '5 minutes' else null end where staff_id=st.id;
    perform public.write_pos_audit('STAFF_PIN_LOGIN_FAILED','STAFF',st.id,null,jsonb_build_object('terminalId',t.id,'employeeId',st.staff_code,'reason','INVALID_PIN'));
    return jsonb_build_object('ok',false,'code','INVALID_PIN');
  end if;
  update public.staff_pin_credentials_v2 set failed_attempts=0,locked_until=null where staff_id=st.id;
  perform public.write_pos_audit('STAFF_PIN_LOGIN_VERIFIED','STAFF',st.id,null,jsonb_build_object('terminalId',t.id,'employeeId',st.staff_code,'outletId',t.branch_id));
  return jsonb_build_object('ok',true,'staffId',st.id,'legacyProfileId',st.legacy_profile_id,'role',(select name from public.roles where id=st.role_id),'pinResetRequired',pc.status='TEMPORARY_RESET');
end $$;

drop function if exists public.list_authenticated_terminal_staff();
create function public.list_authenticated_terminal_staff()
returns table(id uuid, staff_code text, name text, role text, pin_status text, pin_setup_required boolean, temporary_pin_required boolean)
language sql stable security definer set search_path=public as $$
  select st.id,st.staff_code,st.name,r.name,coalesce(pc.status,'SETUP_REQUIRED'),pc.staff_id is null or pc.status='SETUP_REQUIRED',pc.status='TEMPORARY_RESET'
  from public.pos_terminals t join public.staff st on st.company_id=t.company_id and st.active
  join public.roles r on r.id=st.role_id left join public.staff_pin_credentials_v2 pc on pc.staff_id=st.id
  where t.auth_user_id=auth.uid() and t.status='ACTIVE' and t.registration_status='REGISTERED'
    and (st.branch_id=t.branch_id or exists(select 1 from public.staff_branch_assignments a where a.staff_id=st.legacy_profile_id and a.branch_id=t.branch_id and a.status='ACTIVE'))
    and (t.access_mode='ALL_BRANCH_STAFF' or (t.access_mode='ROLE_RESTRICTED' and r.name=any(t.allowed_roles)) or (t.access_mode='STAFF_RESTRICTED' and exists(select 1 from public.terminal_staff_access a where a.terminal_id=t.id and a.staff_id=st.id)))
  order by st.name;
$$;
revoke all on function public.list_authenticated_terminal_staff() from public,anon;
grant execute on function public.list_authenticated_terminal_staff() to authenticated;

commit;
