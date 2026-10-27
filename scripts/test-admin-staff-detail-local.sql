\set keep_transaction true
\ir test-terminal-staff-access-local.sql

do $$ declare detail jsonb; before_permissions text[]; after_permissions text[]; begin
 detail:=public.get_admin_staff_detail('a0400000-0000-0000-0000-000000000031');
 if detail->>'name'<>'Access fixture' or jsonb_array_length(detail->'permissions')=0 then raise exception 'Staff detail or role permissions missing'; end if;
 if detail::text like '%pin_hash%' or detail::text like '%password_hash%' then raise exception 'Credential material exposed'; end if;
 if jsonb_array_length(detail->'loginHistory')=0 then raise exception 'Real session history missing'; end if;
 if jsonb_array_length(public.get_admin_staff_detail('a0400000-0000-0000-0000-000000000032')->'shifts')=0 then raise exception 'Real shift history missing'; end if;
 begin
  perform public.get_admin_staff_detail('a0400000-0000-0000-0000-000000000099');
  raise exception 'Unknown staff accepted';
 exception when raise_exception then if sqlerrm<>'STAFF_NOT_FOUND' then raise; end if; end;
 update public.staff set company_id='a0400000-0000-0000-0000-000000000002',role_id=(select id from public.roles where company_id='a0400000-0000-0000-0000-000000000002' and name='CASHIER') where id='a0400000-0000-0000-0000-000000000032';
 begin
  perform public.get_admin_staff_detail('a0400000-0000-0000-0000-000000000032');
  raise exception 'Cross-company details exposed';
 exception when raise_exception then if sqlerrm<>'STAFF_NOT_FOUND' then raise; end if; end;
 update public.pos_terminals set branch_id='a0400000-0000-0000-0000-000000000011',registration_status='REGISTERED',status='ACTIVE',auth_user_id='a0400000-0000-0000-0000-000000000021',access_mode='ALL_BRANCH_STAFF' where id='a0400000-0000-0000-0000-000000000041';
 update public.pos_terminals set device_identifier=gen_random_uuid()::text||gen_random_uuid()::text where id='a0400000-0000-0000-0000-000000000041';
 perform set_config('request.headers',jsonb_build_object('x-pos-device-credential',(select device_identifier from public.pos_terminals where id='a0400000-0000-0000-0000-000000000041'))::text,true);
 insert into public.terminal_staff_sessions(company_id,branch_id,terminal_id,staff_id,staff_record_id,actor_auth_user_id,auth_session_id,role,permissions)
 values('a0400000-0000-0000-0000-000000000001','a0400000-0000-0000-0000-000000000011','a0400000-0000-0000-0000-000000000041','a0400000-0000-0000-0000-000000000021','a0400000-0000-0000-0000-000000000031','a0400000-0000-0000-0000-000000000021','a0400000-0000-0000-0000-000000000053','ADMIN',array['user.edit']);
 update public.staff set role_id=(select id from public.roles where name='CASHIER' and company_id='a0400000-0000-0000-0000-000000000001') where id='a0400000-0000-0000-0000-000000000031';
 before_permissions:=public.get_my_permissions();
 if public.has_pos_permission('user.edit') then raise exception 'POS inherited device Admin privileges'; end if;
 if public.current_user_company_id()<>'a0400000-0000-0000-0000-000000000001'::uuid or public.can_access_branch('a0400000-0000-0000-0000-000000000013') then raise exception 'POS tenant or branch scope bypassed'; end if;
 begin
  perform public.get_admin_staff_detail('a0400000-0000-0000-0000-000000000031');
  raise exception 'Cashier read Admin staff detail';
 exception when raise_exception then if sqlerrm<>'INSUFFICIENT_PERMISSION' then raise; end if; end;
 update public.staff set role_id=(select id from public.roles where name='MANAGER' and company_id='a0400000-0000-0000-0000-000000000001') where id='a0400000-0000-0000-0000-000000000031';
 after_permissions:=public.get_my_permissions();
 if before_permissions=after_permissions or public.current_pos_role()<>'MANAGER' then raise exception 'Role change did not reach live POS permissions'; end if;
 update public.terminal_staff_sessions set status='ENDED',ended_at=now() where auth_session_id='a0400000-0000-0000-0000-000000000053';
 if cardinality(public.get_my_permissions())<>0 then raise exception 'Ended POS session fell back to device privileges'; end if;
 if public.current_user_company_id() is not null then raise exception 'Ended POS session retained tenant context'; end if;
end $$;

rollback;
