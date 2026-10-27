\set ON_ERROR_STOP on
begin;

insert into public.companies (id, code, name, tax_type) values
  ('a0400000-0000-0000-0000-000000000001', 'QA_VIEW_A', 'View RLS A', 'TAX_EXEMPT'),
  ('a0400000-0000-0000-0000-000000000002', 'QA_VIEW_B', 'View RLS B', 'TAX_EXEMPT');
insert into public.branches (id, company_id, code, name) values
  ('a0400000-0000-0000-0000-000000000011', 'a0400000-0000-0000-0000-000000000001', 'QA_VIEW_A', 'View A'),
  ('a0400000-0000-0000-0000-000000000012', 'a0400000-0000-0000-0000-000000000002', 'QA_VIEW_B', 'View B');
insert into auth.users (id) values
  ('a0400000-0000-0000-0000-000000000021'),
  ('a0400000-0000-0000-0000-000000000022');
insert into public.profiles (id, name, role_id, role_name, company_id, branch_id)
select fixture.id, 'View RLS fixture', r.id, r.name, fixture.company_id, fixture.branch_id
from (values
  ('a0400000-0000-0000-0000-000000000021'::uuid, 'a0400000-0000-0000-0000-000000000001'::uuid, 'a0400000-0000-0000-0000-000000000011'::uuid),
  ('a0400000-0000-0000-0000-000000000022'::uuid, 'a0400000-0000-0000-0000-000000000002'::uuid, 'a0400000-0000-0000-0000-000000000012'::uuid)
) fixture(id, company_id, branch_id)
join public.roles r on r.name = 'CASHIER' and r.company_id=fixture.company_id
on conflict (id) do update set name=excluded.name, role_id=excluded.role_id,
  role_name=excluded.role_name, company_id=excluded.company_id, branch_id=excluded.branch_id, status='ACTIVE';
insert into public.staff_branch_assignments (staff_id, branch_id, status) values
  ('a0400000-0000-0000-0000-000000000021', 'a0400000-0000-0000-0000-000000000011', 'ACTIVE'),
  ('a0400000-0000-0000-0000-000000000022', 'a0400000-0000-0000-0000-000000000012', 'INACTIVE');


insert into public.branches(id,company_id,code,name)
values('a0400000-0000-0000-0000-000000000013','a0400000-0000-0000-0000-000000000001','QA_SECONDARY','Secondary branch');
insert into public.staff(id,staff_code,name,company_id,branch_id,role_id,legacy_profile_id)
select fixture.id,fixture.code,'Access fixture',p.company_id,p.branch_id,p.role_id,p.id
from (values
 ('a0400000-0000-0000-0000-000000000031'::uuid,'QA_ACCESS_A','a0400000-0000-0000-0000-000000000021'::uuid),
 ('a0400000-0000-0000-0000-000000000032'::uuid,'QA_ACCESS_B','a0400000-0000-0000-0000-000000000022'::uuid)
) fixture(id,code,profile_id) join public.profiles p on p.id=fixture.profile_id;
insert into public.pos_terminals(id,company_id,branch_id,terminal_code,name,auth_user_id,access_mode)
values('a0400000-0000-0000-0000-000000000041','a0400000-0000-0000-0000-000000000001','a0400000-0000-0000-0000-000000000011','QA_ACCESS','Access fixture','a0400000-0000-0000-0000-000000000021','ALL_BRANCH_STAFF');
select set_config('request.jwt.claims','{"sub":"a0400000-0000-0000-0000-000000000021","role":"authenticated","session_id":"a0400000-0000-0000-0000-000000000051"}',true);
select set_config('request.jwt.claim.sub','a0400000-0000-0000-0000-000000000021',true);
do $$
declare
 t uuid:='a0400000-0000-0000-0000-000000000041';
 a uuid:='a0400000-0000-0000-0000-000000000031';
 b uuid:='a0400000-0000-0000-0000-000000000032';
 pin text:=lpad((floor(random()*1000000))::integer::text,6,'0');
 result jsonb;
begin
 perform set_config('app.admin_profile_write','allowed',true);
 update public.pos_terminals set status='ACTIVE',registration_status='REGISTERED',device_identifier=gen_random_uuid()::text||gen_random_uuid()::text where id=t;
 perform set_config('request.headers',jsonb_build_object('x-pos-device-credential',(select device_identifier from public.pos_terminals where id=t))::text,true);
 if public.terminal_staff_access_reason(t,a) is not null then raise exception 'All branch staff rejected: %', public.terminal_staff_access_reason(t,a); end if;
 if public.terminal_staff_access_reason(t,b)<>'STAFF_COMPANY_ACCESS_DENIED' then raise exception 'Company isolation failed'; end if;
 update public.pos_terminals set access_mode='SELECTED_STAFF' where id=t;
 if public.terminal_staff_access_reason(t,a)<>'STAFF_TERMINAL_ACCESS_DENIED' then raise exception 'Selection missing was allowed'; end if;
 begin
  insert into public.terminal_staff_access(terminal_id,staff_id) values(t,b);
  raise exception 'Cross-company selection accepted';
 exception when raise_exception then
  if sqlerrm<>'STAFF_BRANCH_ACCESS_DENIED' then raise; end if;
 end;
 insert into public.terminal_staff_access(terminal_id,staff_id) values(t,a);
 insert into public.staff_pin_credentials_v2(staff_id,pin_hash,status)
 values(a,extensions.crypt(pin,extensions.gen_salt('bf')),'ACTIVE');
 result:=public.login_terminal_staff(a,pin);
 if result->>'ok'<>'true' then raise exception 'Valid PIN login failed: %',result->>'code'; end if;
 if (public.current_terminal_staff_session()).id is null then raise exception 'Session context unavailable'; end if;
 update public.staff_branch_assignments set status='INACTIVE' where staff_id='a0400000-0000-0000-0000-000000000021';
 if public.terminal_staff_access_reason(t,a)<>'STAFF_OUTLET_ACCESS_DENIED' then raise exception 'Primary branch bypassed assignment removal'; end if;
 if (public.current_terminal_staff_session()).id is not null then raise exception 'Revoked branch session still valid'; end if;
 if exists(select 1 from public.terminal_staff_sessions where terminal_id=t and status='ACTIVE') then raise exception 'Revoked session not ended'; end if;
 update public.staff_branch_assignments set status='ACTIVE' where staff_id='a0400000-0000-0000-0000-000000000021';
 update public.pos_terminals set lock_status='LOCKED' where id=t;
 if public.terminal_staff_access_reason(t,a)<>'TERMINAL_LOCKED' then raise exception 'Lock bypassed'; end if;
 update public.pos_terminals set lock_status='UNLOCKED' where id=t;
 update public.branches set status='INACTIVE' where id='a0400000-0000-0000-0000-000000000011';
 if public.terminal_staff_access_reason(t,a)<>'BRANCH_INACTIVE' then raise exception 'Inactive branch allowed'; end if;
 update public.branches set status='ACTIVE' where id='a0400000-0000-0000-0000-000000000011';
 result:=public.login_terminal_staff(a,pin);
 if result->>'ok'<>'true' then raise exception 'Restored branch login failed'; end if;
 update public.staff set active=false where id=a;
 if public.terminal_staff_access_reason(t,a)<>'STAFF_INACTIVE' then raise exception 'Inactive staff allowed'; end if;
 if (public.current_terminal_staff_session()).id is not null then raise exception 'Deactivated staff retained session'; end if;
 update public.staff set active=true where id=a;
 update public.profiles set role_name='ADMIN',role_id=(select id from public.roles where name='ADMIN' and company_id='a0400000-0000-0000-0000-000000000001') where id='a0400000-0000-0000-0000-000000000021';
 perform set_config('request.jwt.claims','{"sub":"a0400000-0000-0000-0000-000000000021","role":"authenticated","session_id":"a0400000-0000-0000-0000-000000000052"}',true);
 begin
  perform public.save_terminal_access(t,'SELECTED_STAFF','{}',array['a0400000-0000-0000-0000-000000000099'::uuid]);
  raise exception 'Unknown staff accepted';
 exception when raise_exception then
  if sqlerrm<>'STAFF_BRANCH_ACCESS_DENIED' then raise; end if;
 end;
 perform public.save_terminal_access(t,'ALL_BRANCH_STAFF','{}','{}');
 if exists(select 1 from public.terminal_staff_access where terminal_id=t) then raise exception 'All branch staff requires individual rows'; end if;
 if not exists(select 1 from public.audit_logs where entity_id=t and action='TERMINAL_ACCESS_UPDATED' and metadata->>'newAccessMode'='ALL_BRANCH_STAFF') then raise exception 'Access audit missing'; end if;
 begin
  perform public.save_terminal_with_access(null,'a0400000-0000-0000-0000-000000000011','QA_ATOMIC','Atomic access test','CASHIER','SELECTED_STAFF','{}');
  raise exception 'Empty selected staff was accepted';
 exception when raise_exception then
  if sqlerrm<>'TERMINAL_STAFF_REQUIRED' then raise; end if;
 end;
 if exists(select 1 from public.pos_terminals where terminal_code='QA_ATOMIC') then raise exception 'Invalid access left a partially created terminal'; end if;
 update public.profiles set company_id='a0400000-0000-0000-0000-000000000001',role_id=(select id from public.roles where name='CASHIER' and company_id='a0400000-0000-0000-0000-000000000001'),branch_id='a0400000-0000-0000-0000-000000000013',status='ACTIVE' where id='a0400000-0000-0000-0000-000000000022';
 update public.staff set company_id='a0400000-0000-0000-0000-000000000001',role_id=(select id from public.roles where name='CASHIER' and company_id='a0400000-0000-0000-0000-000000000001'),branch_id='a0400000-0000-0000-0000-000000000013' where id=b;
 if public.terminal_staff_access_reason(t,b)<>'STAFF_OUTLET_ACCESS_DENIED' then raise exception 'Same-company unassigned branch allowed'; end if;
 insert into public.staff_branch_assignments(staff_id,branch_id,status) values('a0400000-0000-0000-0000-000000000022','a0400000-0000-0000-0000-000000000011','ACTIVE');
 if public.terminal_staff_access_reason(t,b) is not null then raise exception 'New branch staff not automatically allowed'; end if;
 if jsonb_array_length(public.list_branch_terminal_staff('a0400000-0000-0000-0000-000000000011'))<>2 then raise exception 'Secondary branch candidate missing'; end if;
 insert into public.staff_pin_credentials_v2(staff_id,pin_hash,status) values(b,extensions.crypt(pin,extensions.gen_salt('bf')),'ACTIVE');
 result:=public.login_terminal_staff(b,pin);
 if result->>'ok'<>'true' then raise exception 'Secondary branch login failed'; end if;
 if public.get_my_staff_session()->>'branchId'<>'a0400000-0000-0000-0000-000000000011' then raise exception 'Session returned primary instead of terminal branch'; end if;
 perform public.open_cashier_shift(100);
 if not exists(select 1 from public.cashier_shifts where terminal_id=t and branch_id='a0400000-0000-0000-0000-000000000011' and status='OPEN') then raise exception 'Shift used wrong branch context'; end if;
 perform public.close_cashier_shift((select id from public.cashier_shifts where terminal_id=t and status='OPEN'),100,false,null);
 perform public.end_terminal_staff_session();
 perform set_config('request.jwt.claims','{"sub":"a0400000-0000-0000-0000-000000000021","role":"authenticated","session_id":"a0400000-0000-0000-0000-000000000053"}',true);
 perform public.save_terminal_access(t,'SELECTED_STAFF','{}',array[a]);
 update public.pos_terminals set branch_id='a0400000-0000-0000-0000-000000000012',company_id='a0400000-0000-0000-0000-000000000002' where id=t;
 if exists(select 1 from public.terminal_staff_access where terminal_id=t) then raise exception 'Moved terminal retained invalid staff'; end if;
 if has_function_privilege('authenticated','public.begin_authenticated_terminal_staff_session(uuid)','EXECUTE') then raise exception 'PIN bypass RPC still exposed'; end if;
 if has_function_privilege('authenticated','public.begin_terminal_staff_session(uuid,uuid,text,uuid)','EXECUTE') then raise exception 'Legacy PIN bypass RPC still exposed'; end if;
 if has_function_privilege('authenticated','public.terminal_staff_access_reason(uuid,uuid)','EXECUTE') then raise exception 'Internal staff lookup exposed'; end if;
end $$;
set local role authenticated;
do $$ declare result jsonb; begin
 result:=public.login_terminal_staff('a0400000-0000-0000-0000-000000000031',null);
 if result->>'code'<>'STAFF_COMPANY_ACCESS_DENIED' then raise exception 'Authenticated RPC bypassed company checks'; end if;
 result:=public.login_terminal_staff('a0400000-0000-0000-0000-000000000099',null);
 if result->>'code'<>'STAFF_NOT_FOUND' then raise exception 'Unknown staff validation order changed'; end if;
end $$;
reset role;
do $$ declare moved public.pos_terminals; begin
 update public.pos_terminals set company_id='a0400000-0000-0000-0000-000000000001',branch_id='a0400000-0000-0000-0000-000000000011',status='ACTIVE',registration_status='REGISTERED',auth_user_id='a0400000-0000-0000-0000-000000000021' where id='a0400000-0000-0000-0000-000000000041';
 perform public.save_terminal_access('a0400000-0000-0000-0000-000000000041','SELECTED_STAFF','{}',array['a0400000-0000-0000-0000-000000000031'::uuid]);
 begin
  perform public.reassign_pos_terminal('a0400000-0000-0000-0000-000000000041','a0400000-0000-0000-0000-000000000012');
  raise exception 'Cross-company move accepted';
 exception when raise_exception then if sqlerrm<>'INVALID_BRANCH' then raise; end if; end;
 update public.pos_terminals set device_identifier=gen_random_uuid()::text||gen_random_uuid()::text where id='a0400000-0000-0000-0000-000000000041';
 moved:=public.reassign_pos_terminal('a0400000-0000-0000-0000-000000000041','a0400000-0000-0000-0000-000000000013');
 if moved.auth_user_id is not null or moved.registration_status<>'UNREGISTERED' then raise exception 'Moved terminal retained device credential'; end if;
 if exists(select 1 from public.terminal_staff_access where terminal_id=moved.id) then raise exception 'Move RPC retained invalid staff'; end if;
 if exists(select 1 from public.terminal_device_assignments where terminal_id=moved.id and status='ACTIVE') then raise exception 'Moved device history still active'; end if;
end $$;
\if :{?keep_transaction}
\else
rollback;
\endif
