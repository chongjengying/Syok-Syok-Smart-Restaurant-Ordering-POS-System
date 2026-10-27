\set ON_ERROR_STOP on
begin;
insert into public.companies(id,code,name,tax_type) values
 ('a0280000-0000-0000-0000-000000000001','QA_ROLE_A','Role A','TAX_EXEMPT'),
 ('a0280000-0000-0000-0000-000000000002','QA_ROLE_B','Role B','TAX_EXEMPT');
insert into public.branches(id,company_id,code,name) values
 ('a0280000-0000-0000-0000-000000000011','a0280000-0000-0000-0000-000000000001','QA_ROLE_A','Role A'),
 ('a0280000-0000-0000-0000-000000000012','a0280000-0000-0000-0000-000000000002','QA_ROLE_B','Role B');
insert into auth.users(id) values
 ('a0280000-0000-0000-0000-000000000021'),('a0280000-0000-0000-0000-000000000022');
insert into public.profiles(id,name,company_id,branch_id,role_id,role_name,status)
select f.id,'Role fixture',f.company,f.branch,r.id,r.name,'ACTIVE'
from (values
 ('a0280000-0000-0000-0000-000000000021'::uuid,'a0280000-0000-0000-0000-000000000001'::uuid,'a0280000-0000-0000-0000-000000000011'::uuid),
 ('a0280000-0000-0000-0000-000000000022'::uuid,'a0280000-0000-0000-0000-000000000002'::uuid,'a0280000-0000-0000-0000-000000000012'::uuid)
) f(id,company,branch) join public.roles r on r.company_id=f.company and r.name='ADMIN'
on conflict(id) do update set company_id=excluded.company_id,branch_id=excluded.branch_id,
 role_id=excluded.role_id,role_name=excluded.role_name,status='ACTIVE';
insert into public.staff(id,staff_code,name,company_id,branch_id,role_id,legacy_profile_id)
select 'a0280000-0000-0000-0000-000000000031','QA_ROLE_STAFF','Role staff',p.company_id,p.branch_id,r.id,p.id
from public.profiles p join public.roles r on r.company_id=p.company_id and r.name='CASHIER'
where p.id='a0280000-0000-0000-0000-000000000021';
create temporary table role_fixture_ids as select id,company_id,scope,name from public.roles;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.company_id='a0280000-0000-0000-0000-000000000002' and r.name='CASHIER' and p.code='payment.refund' on conflict do nothing;
create temporary table role_fixture_b_permissions as
select rp.role_id,rp.permission_id from public.role_permissions rp join public.roles r on r.id=rp.role_id
where r.company_id='a0280000-0000-0000-0000-000000000002';
grant select on role_fixture_ids to authenticated;
create temporary table role_fixture_permission_id as select id from public.permissions where code='order.create';
grant select on role_fixture_permission_id to authenticated;
select set_config('request.jwt.claims','{"sub":"a0280000-0000-0000-0000-000000000021","role":"authenticated","session_id":"a0280000-0000-0000-0000-000000000091"}',true);
select set_config('request.jwt.claim.sub','a0280000-0000-0000-0000-000000000021',true);
set local role authenticated;
do $$ declare a uuid; b uuid; template uuid; codes text[]; created public.roles; begin
 select id into a from role_fixture_ids where company_id='a0280000-0000-0000-0000-000000000001' and name='CASHIER';
 select id into b from role_fixture_ids where company_id='a0280000-0000-0000-0000-000000000002' and name='CASHIER';
 select id into template from role_fixture_ids where scope='SYSTEM' and name='CASHIER';
 if a=b or a=template then raise exception 'Shared role identity'; end if;
 if exists(select 1 from public.roles where company_id is distinct from public.current_user_company_id()) then raise exception 'Foreign/template role visible'; end if;
 if exists(select 1 from public.role_permissions where role_id=b) then raise exception 'Foreign assignments visible'; end if;
 if exists(select 1 from public.permissions where scope<>'COMPANY_ASSIGNABLE') then raise exception 'Platform permissions visible'; end if;
 codes:=public.set_role_permissions(a,array['order.create','payment.create']);
 if codes<>array['order.create','payment.create'] then raise exception 'Own permission save failed'; end if;
 perform public.set_role_permissions(a,array['order.create','payment.create','payment.refund']);
 if not exists(select 1 from public.role_permissions rp join public.permissions p on p.id=rp.permission_id where rp.role_id=a and p.code='payment.refund') then raise exception 'Own refund grant failed'; end if;
 perform public.set_role_permissions(a,array['order.create','payment.create']);
 if exists(select 1 from public.role_permissions rp join public.permissions p on p.id=rp.permission_id where rp.role_id=a and p.code='payment.refund') then raise exception 'Own refund revocation failed'; end if;
 begin delete from public.roles where id=b; raise exception 'Foreign direct delete accepted'; exception when insufficient_privilege then null; end;
 begin update public.roles set description='Foreign edit' where id=b; raise exception 'Foreign direct patch accepted'; exception when insufficient_privilege then null; end;
 begin update public.role_permissions set role_id=a where role_id=b; raise exception 'Direct permission mapping edit accepted'; exception when insufficient_privilege then null; end;
 begin perform public.create_pos_order_unbound('[]','CASH','takeaway',null,'forged-unbound'); raise exception 'Unbound order entry available'; exception when insufficient_privilege then null; end;
 begin perform public.set_role_permissions(b,array['order.create']); raise exception 'Foreign save accepted';
 exception when insufficient_privilege then if sqlerrm<>'ROLE_NOT_FOUND_OR_FORBIDDEN' then raise; end if; end;
 begin perform public.deactivate_admin_role(b); raise exception 'Foreign deactivate accepted';
 exception when insufficient_privilege then if sqlerrm<>'ROLE_NOT_FOUND_OR_FORBIDDEN' then raise; end if; end;
 begin perform public.activate_admin_role(b); raise exception 'Foreign activate accepted';
 exception when insufficient_privilege then if sqlerrm<>'ROLE_NOT_FOUND_OR_FORBIDDEN' then raise; end if; end;
 begin perform public.set_role_permissions(template,array['order.create']); raise exception 'Template save accepted';
 exception when insufficient_privilege then if sqlerrm<>'ROLE_NOT_FOUND_OR_FORBIDDEN' then raise; end if; end;
 begin perform public.set_role_permissions(a,array['platform.company.manage']); raise exception 'Platform permission assigned';
 exception when raise_exception then if sqlerrm<>'PERMISSION_NOT_COMPANY_ASSIGNABLE' then raise; end if; end;
 begin perform public.set_role_permissions(a,array['tenant.impersonate']); raise exception 'Internal permission assigned';
 exception when raise_exception then if sqlerrm<>'PERMISSION_NOT_COMPANY_ASSIGNABLE' then raise; end if; end;
 begin perform public.set_role_permissions(a,array['not.a.permission']); raise exception 'Unknown permission accepted';
 exception when raise_exception then if sqlerrm<>'PERMISSION_NOT_COMPANY_ASSIGNABLE' then raise; end if; end;
 begin perform public.set_system_template_permissions(template,array['order.create']); raise exception 'Company admin edited template';
 exception when raise_exception then if sqlerrm<>'PLATFORM_ADMIN_REQUIRED' then raise; end if; end;
 begin perform public.set_system_permission_active((select id from public.permissions where code='order.create'),false); raise exception 'Company admin edited definition';
 exception when raise_exception then if sqlerrm<>'PLATFORM_ADMIN_REQUIRED' then raise; end if; end;
 begin update public.profiles set company_id='a0280000-0000-0000-0000-000000000002' where id=auth.uid(); raise exception 'Tenant tampering accepted';
 exception when insufficient_privilege then null; end;
 begin update public.roles set is_active=false where id=a; raise exception 'Direct role update accepted';
 exception when insufficient_privilege then null; end;
 created:=public.create_admin_role('SUPERVISOR','Company A only');
 if created.company_id<>public.current_user_company_id() or created.scope<>'COMPANY' then raise exception 'Role creation ownership'; end if;
 perform public.set_role_permissions(created.id,array['report.view']);
 perform public.deactivate_admin_role(created.id);
 perform public.activate_admin_role(created.id);
 begin perform public.set_role_permissions((select id from public.roles where name='ADMIN'),array['order.create']); raise exception 'Admin core removed';
 exception when raise_exception then if sqlerrm<>'ADMIN_CORE_PERMISSIONS_REQUIRED' then raise; end if; end;
 if not exists(select 1 from public.list_admin_roles_with_counts() where id=created.id) then raise exception 'Directory missing own role'; end if;
 if not exists(select 1 from public.audit_logs where action='PERMISSION_CHANGED' and entity_id=a
  and old_value ? 'permissions' and new_value ? 'added' and new_value ? 'removed') then raise exception 'Permission diff audit missing'; end if;
 raise notice 'VERIFIED PASS: authenticated role scope, allowlist, protected template, tenant tampering, lifecycle and audit';
end $$;
reset role;
do $$ declare a uuid; b uuid; codes text[]; begin
 select id into a from public.roles where company_id='a0280000-0000-0000-0000-000000000001' and name='CASHIER';
 select id into b from public.roles where company_id='a0280000-0000-0000-0000-000000000002' and name='CASHIER';
 if exists(
  (select rp.role_id,rp.permission_id from public.role_permissions rp join public.roles r on r.id=rp.role_id where r.company_id='a0280000-0000-0000-0000-000000000002'
   except select * from role_fixture_b_permissions)
  union all
  (select * from role_fixture_b_permissions except select rp.role_id,rp.permission_id from public.role_permissions rp join public.roles r on r.id=rp.role_id where r.company_id='a0280000-0000-0000-0000-000000000002')
 ) then raise exception 'Company B permissions changed'; end if;
 begin update public.staff set role_id=b where id='a0280000-0000-0000-0000-000000000031'; raise exception 'Foreign staff role accepted';
 exception when foreign_key_violation then null; end;
 perform set_config('app.admin_profile_write','allowed',true);
 begin update public.profiles set role_id=a where id='a0280000-0000-0000-0000-000000000022'; raise exception 'Reverse foreign profile role accepted';
 exception when raise_exception then if sqlerrm<>'ROLE_COMPANY_MISMATCH' then raise; end if; end;
 begin update public.roles set company_id='a0280000-0000-0000-0000-000000000002' where id=a; raise exception 'Ownership changed';
 exception when raise_exception then if sqlerrm<>'ROLE_IDENTITY_IMMUTABLE' then raise; end if; end;
 begin delete from public.roles where id=a; raise exception 'Role deleted';
 exception when raise_exception then if sqlerrm<>'ROLE_DELETE_FORBIDDEN' then raise; end if; end;
 insert into public.platform_administrators(user_id) values('a0280000-0000-0000-0000-000000000021');
 raise notice 'VERIFIED PASS: cross-company staff FK, immutable role ownership, no destructive role deletion';
end $$;
set local role authenticated;
select public.set_system_permission_active((select id from public.permissions where code='order.create'),false);
do $$ declare a uuid; begin
 select id into a from public.roles where name='CASHIER';
 begin perform public.set_role_permissions(a,array['order.create']); raise exception 'Inactive permission assigned';
 exception when raise_exception then if sqlerrm<>'PERMISSION_NOT_COMPANY_ASSIGNABLE' then raise; end if; end;
end $$;
select public.set_system_permission_active((select id from role_fixture_permission_id),true);
select public.set_system_template_permissions((select id from role_fixture_ids where scope='SYSTEM' and name='CASHIER'),array['order.create']);
do $$ begin
 if exists(select 1 from public.role_permissions where role_id=(select id from public.roles where name='CASHIER') and permission_id not in(select id from public.permissions where code in ('order.create','payment.create')))
 then raise exception 'Template edit cascaded into company'; end if;
 raise notice 'VERIFIED PASS: explicit platform membership edits template without changing existing company role';
end $$;
reset role;
do $$ declare result jsonb; pin text:=lpad((floor(random()*1000000))::integer::text,6,'0'); a uuid; begin
 select id into a from public.roles where company_id='a0280000-0000-0000-0000-000000000001' and name='CASHIER';
 insert into public.staff_branch_assignments(staff_id,branch_id,status,is_primary)
 values('a0280000-0000-0000-0000-000000000021','a0280000-0000-0000-0000-000000000011','ACTIVE',true);
 insert into public.pos_terminals(id,company_id,branch_id,terminal_code,name,auth_user_id,access_mode)
 values('a0280000-0000-0000-0000-000000000041','a0280000-0000-0000-0000-000000000001','a0280000-0000-0000-0000-000000000011','QA_ROLE_POS','Role POS','a0280000-0000-0000-0000-000000000021','ALL_BRANCH_STAFF');
 update public.pos_terminals set status='ACTIVE',registration_status='REGISTERED',device_identifier=gen_random_uuid()::text||gen_random_uuid()::text where id='a0280000-0000-0000-0000-000000000041';
 perform set_config('request.headers',jsonb_build_object('x-pos-device-credential',(select device_identifier from public.pos_terminals where id='a0280000-0000-0000-0000-000000000041'))::text,true);
 insert into public.staff_pin_credentials_v2(staff_id,pin_hash,status)
 values('a0280000-0000-0000-0000-000000000031',extensions.crypt(pin,extensions.gen_salt('bf')),'ACTIVE');
 result:=public.login_terminal_staff('a0280000-0000-0000-0000-000000000031',pin);
 if result->>'ok'<>'true' then raise exception 'Role fixture login failed'; end if;
 if not public.has_pos_permission('payment.create') then raise exception 'Company role not effective in POS'; end if;
 perform set_config('request.jwt.claims','{"sub":"a0280000-0000-0000-0000-000000000021","role":"authenticated","session_id":"a0280000-0000-0000-0000-000000000092"}',true);
 perform public.set_role_permissions(a,array['order.create']);
 perform set_config('request.jwt.claims','{"sub":"a0280000-0000-0000-0000-000000000021","role":"authenticated","session_id":"a0280000-0000-0000-0000-000000000091"}',true);
 if public.has_pos_permission('payment.create') or not public.has_pos_permission('order.create') then raise exception 'Stale POS permission snapshot'; end if;
 perform set_config('request.jwt.claims','{"sub":"a0280000-0000-0000-0000-000000000021","role":"authenticated","session_id":"a0280000-0000-0000-0000-000000000092"}',true);
 perform public.set_role_permissions(a,array['payment.create']);
 perform set_config('request.jwt.claims','{"sub":"a0280000-0000-0000-0000-000000000021","role":"authenticated","session_id":"a0280000-0000-0000-0000-000000000091"}',true);
 begin perform public.place_order('[]','CASH','takeaway',null,'revoked-order'); raise exception 'Removed order permission bypassed'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims','{"sub":"a0280000-0000-0000-0000-000000000021","role":"authenticated","session_id":"a0280000-0000-0000-0000-000000000092"}',true);
 perform public.deactivate_admin_role(a);
 perform set_config('request.jwt.claims','{"sub":"a0280000-0000-0000-0000-000000000021","role":"authenticated","session_id":"a0280000-0000-0000-0000-000000000091"}',true);
 if (public.current_terminal_staff_session()).id is not null or cardinality(public.get_my_permissions())<>0
 then raise exception 'Inactive role retained operator session'; end if;
 raise notice 'VERIFIED PASS: PIN login uses company role, permission removal reaches live POS, role deactivation ends access without deleting history';
end $$;
select set_config('request.jwt.claims','{"sub":"a0280000-0000-0000-0000-000000000022","role":"authenticated","session_id":"a0280000-0000-0000-0000-000000000093"}',true);
select set_config('request.jwt.claim.sub','a0280000-0000-0000-0000-000000000022',true);
set local role authenticated;
do $$ declare r public.roles; begin
 r:=public.create_admin_role('SUPERVISOR','Company B only');
 if r.company_id<>'a0280000-0000-0000-0000-000000000002'::uuid then raise exception 'Duplicate name ownership incorrect'; end if;
 if exists(select 1 from public.roles where company_id<>'a0280000-0000-0000-0000-000000000002'::uuid) then raise exception 'Company B saw foreign roles'; end if;
 raise notice 'VERIFIED PASS: both companies independently create SUPERVISOR without a shared role record';
end $$;
reset role;
-- Server approval must not treat a valid foreign manager PIN as tenant access.
select set_config('request.jwt.claims','{"sub":"a0280000-0000-0000-0000-000000000021","role":"authenticated","session_id":"a0280000-0000-0000-0000-000000000095"}',true);
select set_config('request.jwt.claim.sub','a0280000-0000-0000-0000-000000000021',true);
do $$ declare ord uuid; a uuid:='a0280000-0000-0000-0000-000000000001'; b uuid:='a0280000-0000-0000-0000-000000000011'; pin text:=lpad((floor(random()*1000000))::integer::text,6,'0'); result jsonb; begin
 update public.staff set role_id=(select id from public.roles where company_id=a and name='ADMIN') where id='a0280000-0000-0000-0000-000000000031';
 if public.profile_has_company_permission('a0280000-0000-0000-0000-000000000022',a,b,'order.manage') then raise exception 'Foreign approver permission resolved'; end if;
 if not public.profile_has_company_permission('a0280000-0000-0000-0000-000000000021',a,b,'discount.approve') then raise exception 'Own approver permission missing'; end if;
 update public.staff_pin_credentials_v2 set pin_hash=extensions.crypt(pin,extensions.gen_salt('bf')) where staff_id='a0280000-0000-0000-0000-000000000031';
 result:=public.login_terminal_staff('a0280000-0000-0000-0000-000000000031',pin);
 if result->>'ok'<>'true' then raise exception 'Approval fixture login failed'; end if;
 perform public.open_cashier_shift(0);
 insert into public.orders(order_number,user_id,company_id,branch_id,status,payment_status,subtotal,tax,service_charge,total)
 values('QA-ROLE-APPROVAL','a0280000-0000-0000-0000-000000000021',a,b,'CONFIRMED','UNPAID',10,0,0,10) returning id into ord;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.approve_order_void(ord,'a0280000-0000-0000-0000-000000000021','a0280000-0000-0000-0000-000000000022','QA cross-company approval'); raise exception 'Foreign manager void accepted'; exception when insufficient_privilege then null; end;
 if (select status from public.orders where id=ord)<>'CONFIRMED' then raise exception 'Denied approval mutated order'; end if;
 perform public.approve_order_void(ord,'a0280000-0000-0000-0000-000000000021','a0280000-0000-0000-0000-000000000021','QA valid own approval');
 if (select status from public.orders where id=ord)<>'CANCELLED' then raise exception 'Own manager approval failed'; end if;
 raise notice 'VERIFIED PASS: cross-company approval denied without mutation and revoked order.create enforced by POS RPC';
end $$;
rollback;
