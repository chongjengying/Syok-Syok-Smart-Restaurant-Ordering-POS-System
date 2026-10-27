begin;

alter table public.terminal_device_assignments add column credential_hash text;
update public.terminal_device_assignments set credential_hash=encode(extensions.digest(device_identifier,'sha256'),'hex');
alter table public.terminal_staff_sessions add column device_assignment_id uuid references public.terminal_device_assignments(assignment_id) on delete restrict;
update public.terminal_staff_sessions s set device_assignment_id=d.assignment_id
from public.terminal_device_assignments d where d.terminal_id=s.terminal_id and d.status='ACTIVE' and s.status in ('ACTIVE','LOCKED');
create unique index terminal_device_one_active_identity on public.terminal_device_assignments(device_identifier) where status='ACTIVE';

revoke select on public.pos_terminals,public.terminal_device_assignments from authenticated;
-- Device proof is never included in browser-readable table projections.
do $$ declare columns text; begin
 select string_agg(quote_ident(attname),',') into columns from pg_attribute where attrelid='public.pos_terminals'::regclass and attnum>0 and not attisdropped and attname<>'device_identifier';
 execute 'grant select ('||columns||') on public.pos_terminals to authenticated';
end $$;
grant select(assignment_id,terminal_id,assigned_at,activated_at,revoked_at,revoked_by,revoke_reason,status,device_name) on public.terminal_device_assignments to authenticated;

create function public.initialize_device_assignment_credential() returns trigger
language plpgsql security definer set search_path=public as $$
begin new.credential_hash:=coalesce(new.credential_hash,encode(extensions.digest(new.device_identifier,'sha256'),'hex')); return new; end $$;
create trigger initialize_device_assignment_credential before insert on public.terminal_device_assignments for each row execute function public.initialize_device_assignment_credential();

create function public.request_device_credential() returns text language sql stable security definer set search_path=public as $$
 select nullif(coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-pos-device-credential','');
$$;
create function public.terminal_device_access_reason(p_terminal_id uuid) returns text
language plpgsql stable security definer set search_path=public as $$
declare t public.pos_terminals; proof text:=public.request_device_credential();
begin
 select * into t from public.pos_terminals where id=p_terminal_id;
 if not found then return 'DEVICE_NOT_ACTIVATED'; end if;
 if not exists(select 1 from public.companies where id=t.company_id and status='ACTIVE') then return 'COMPANY_INACTIVE'; end if;
 if not exists(select 1 from public.branches where id=t.branch_id and company_id=t.company_id and status='ACTIVE') then return 'BRANCH_INACTIVE'; end if;
 if t.status in ('RETIRED','ARCHIVED') then return 'TERMINAL_RETIRED'; end if;
 if t.registration_status='REVOKED' then return 'DEVICE_REVOKED'; end if;
 if t.lock_status='LOCKED' then return 'TERMINAL_LOCKED'; end if;
 if t.status<>'ACTIVE' then return 'TERMINAL_UNAVAILABLE'; end if;
 if t.registration_status<>'REGISTERED' or t.device_identifier is null then return 'DEVICE_NOT_ACTIVATED'; end if;
 if t.auth_user_id is distinct from auth.uid() or proof is null or length(proof)>256 or not exists(
   select 1 from public.terminal_device_assignments d where d.terminal_id=t.id and d.status='ACTIVE'
     and d.device_identifier=t.device_identifier and d.credential_hash=encode(extensions.digest(proof,'sha256'),'hex')
 ) then return 'DEVICE_AUTHENTICATION_INVALID'; end if;
 return null;
end $$;

create or replace function public.resolve_authenticated_terminal(p_device_identifier text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare t public.pos_terminals; b public.branches; c public.companies; reason text; proof text:=public.request_device_credential();
begin
 if auth.uid() is null or proof is null then return jsonb_build_object('ok',false,'code','DEVICE_AUTHENTICATION_INVALID'); end if;
 select pt.* into t from public.pos_terminals pt join public.terminal_device_assignments d on d.terminal_id=pt.id and d.status='ACTIVE'
 where pt.device_identifier=p_device_identifier and d.device_identifier=pt.device_identifier
   and d.credential_hash=encode(extensions.digest(proof,'sha256'),'hex') and (pt.auth_user_id is null or pt.auth_user_id=auth.uid())
 for update of pt;
 if not found then return jsonb_build_object('ok',false,'code','DEVICE_AUTHENTICATION_INVALID'); end if;
 if t.status<>'ACTIVE' or t.registration_status<>'REGISTERED' or t.lock_status='LOCKED'
    or not exists(select 1 from public.branches where id=t.branch_id and company_id=t.company_id and status='ACTIVE')
    or not exists(select 1 from public.companies where id=t.company_id and status='ACTIVE')
 then return jsonb_build_object('ok',false,'code','TERMINAL_UNAVAILABLE'); end if;
 if t.auth_user_id is null then update public.pos_terminals set auth_user_id=auth.uid() where id=t.id returning * into t; end if;
 reason:=public.terminal_device_access_reason(t.id);
 if reason is not null then return jsonb_build_object('ok',false,'code',reason); end if;
 select * into b from public.branches where id=t.branch_id;
 select * into c from public.companies where id=t.company_id;
 update public.pos_terminals set authenticated_at=now(),last_seen_at=now() where id=t.id;
 return jsonb_build_object('ok',true,'terminalId',t.id,'terminalCode',t.terminal_code,'terminalName',t.name,'terminalType',t.terminal_type,'branchId',b.id,'branchCode',b.code,'branchName',b.name,'companyId',c.id,'companyCode',c.code,'companyName',c.name,'lockStatus',t.lock_status);
end $$;
create or replace function public.resolve_authenticated_terminal() returns jsonb
language plpgsql security definer set search_path=public as $$
begin return public.resolve_authenticated_terminal((select device_identifier from public.pos_terminals where auth_user_id=auth.uid())); end $$;

create or replace function public.current_terminal_staff_session() returns public.terminal_staff_sessions
language sql stable security definer set search_path=public as $$
 select s from public.terminal_staff_sessions s join public.pos_terminals t on t.id=s.terminal_id
 join public.terminal_device_assignments d on d.assignment_id=s.device_assignment_id and d.terminal_id=t.id and d.status='ACTIVE'
 where s.auth_session_id=nullif(auth.jwt()->>'session_id','')::uuid and t.auth_user_id=auth.uid()
   and s.status='ACTIVE' and s.branch_id=t.branch_id and s.company_id=t.company_id
   and public.terminal_device_access_reason(t.id) is null and public.terminal_staff_access_reason(t.id,s.staff_record_id) is null;
$$;

create function public.attribute_staff_session_device() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 select assignment_id into new.device_assignment_id from public.terminal_device_assignments where terminal_id=new.terminal_id and status='ACTIVE';
 if new.device_assignment_id is null then raise exception 'DEVICE_NOT_ACTIVATED'; end if;
 return new;
end $$;
create trigger attribute_staff_session_device before insert on public.terminal_staff_sessions for each row execute function public.attribute_staff_session_device();

create or replace function public.login_terminal_staff(p_staff_id uuid,p_pin text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare verification jsonb; staff_session jsonb; reason text; t public.pos_terminals;
begin
 select * into t from public.pos_terminals where auth_user_id=auth.uid() for update;
 reason:=public.terminal_device_access_reason(t.id);
 if reason is not null then return jsonb_build_object('ok',false,'code',reason); end if;
 verification:=public.verify_authenticated_terminal_staff_pin(p_staff_id,p_pin);
 if not coalesce((verification->>'ok')::boolean,false) then return verification; end if;
 staff_session:=public.begin_authenticated_terminal_staff_session(p_staff_id);
 perform public.write_pos_audit_diff('STAFF_LOGIN','STAFF_SESSION',(staff_session->>'id')::uuid,null,null,staff_session,jsonb_build_object('deviceAssignmentId',staff_session->>'device_assignment_id'));
 return jsonb_build_object('ok',true,'staffSession',staff_session,'pinResetRequired',verification->'pinResetRequired');
end $$;
create or replace function public.list_authenticated_terminal_staff()
returns table(id uuid,staff_code text,name text,role text,pin_status text,pin_setup_required boolean,temporary_pin_required boolean)
language sql stable security definer set search_path=public as $$
 select st.id,st.staff_code,st.name,r.name,coalesce(pc.status,'SETUP_REQUIRED'),pc.staff_id is null or pc.status='SETUP_REQUIRED',pc.status='TEMPORARY_RESET'
 from public.pos_terminals t join public.staff st on st.company_id=t.company_id join public.roles r on r.id=st.role_id left join public.staff_pin_credentials_v2 pc on pc.staff_id=st.id
 where t.auth_user_id=auth.uid() and public.terminal_device_access_reason(t.id) is null and public.terminal_staff_access_reason(t.id,st.id) is null order by st.name;
$$;

create function public.finish_terminal_staff_session(p_handoff boolean) returns void
language plpgsql security definer set search_path=public as $$
declare s public.terminal_staff_sessions; previous jsonb; terminal_id uuid;
begin
 select id into terminal_id from public.pos_terminals where auth_user_id=auth.uid() for update;
 select ss.* into s from public.terminal_staff_sessions ss join public.pos_terminals t on t.id=ss.terminal_id
 where t.auth_user_id=auth.uid() and ss.auth_session_id=nullif(auth.jwt()->>'session_id','')::uuid and ss.status in ('ACTIVE','LOCKED') for update of ss;
 if not found then return; end if;
 if not p_handoff and exists(select 1 from public.cashier_shifts where terminal_id=s.terminal_id and status='OPEN') then raise exception 'ACTIVE_SHIFT_SIGN_OUT_BLOCKED'; end if;
 previous:=to_jsonb(s);
 perform public.write_pos_audit_diff(case when p_handoff then 'STAFF_HANDOFF_SIGN_OUT' else 'STAFF_LOGOUT' end,'STAFF_SESSION',s.id,null,previous,previous||jsonb_build_object('status','ENDED','ended_at',now()),jsonb_build_object('deviceAssignmentId',s.device_assignment_id,'shiftPreserved',p_handoff));
 update public.terminal_staff_sessions set status='ENDED',ended_at=coalesce(ended_at,now()),updated_at=now() where id=s.id;
end $$;
create or replace function public.end_terminal_staff_session() returns void language sql security definer set search_path=public as $$ select public.finish_terminal_staff_session(false); $$;
create function public.switch_terminal_staff_session() returns void language sql security definer set search_path=public as $$ select public.finish_terminal_staff_session(true); $$;

revoke all on function public.initialize_device_assignment_credential(),public.request_device_credential(),public.terminal_device_access_reason(uuid),public.attribute_staff_session_device(),public.finish_terminal_staff_session(boolean) from public,anon,authenticated;
revoke all on function public.switch_terminal_staff_session() from public,anon;
grant execute on function public.switch_terminal_staff_session() to authenticated;
notify pgrst,'reload schema';
commit;
