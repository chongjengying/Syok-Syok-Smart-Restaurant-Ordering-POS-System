begin;

do $$
declare b public.branches; t public.pos_terminals; s public.terminal_staff_sessions;
        o public.orders; pay public.payments; receipt public.receipts;
        manager_role uuid; result jsonb; void_row public.payment_voids;
        proof text:='local-financial-exception-proof'; key text:='local-financial-exception-void';
begin
 select * into b from public.branches where status='ACTIVE' and name like 'Local POS acceptance %' order by created_at desc limit 1;
 if b.id is null then raise exception 'ACTIVE_ACCEPTANCE_BRANCH_REQUIRED'; end if;
 select * into o from public.orders where branch_id=b.id and payment_status='PAID' order by created_at desc limit 1;
 select * into pay from public.payments where order_id=o.id and status='PAID' limit 1;
 select * into receipt from public.receipts where order_id=o.id and status='ISSUED' limit 1;
 select * into t from public.pos_terminals where branch_id=b.id and registration_status='REGISTERED' limit 1;
 select * into s from public.terminal_staff_sessions where terminal_id=t.id and role='CASHIER' order by started_at desc limit 1;
 select id into manager_role from public.roles where company_id=b.company_id and name='MANAGER' and scope='COMPANY';
 if o.id is null or pay.id is null or receipt.id is null or t.id is null or s.id is null or manager_role is null then
   raise exception 'COMPLETE_ACCEPTANCE_FINANCIAL_FIXTURE_REQUIRED';
 end if;
 insert into public.role_permissions(role_id,permission_id)
 select manager_role,p.id from public.permissions p where p.code in ('payment.void','receipt.reprint')
 on conflict do nothing;
 update public.staff set role_id=manager_role where id=s.staff_record_id;
 update public.staff_pin_credentials_v2 set locked_until=null,failed_attempts=0 where staff_id=s.staff_record_id;
 update public.terminal_device_assignments set credential_hash=encode(extensions.digest(proof,'sha256'),'hex')
 where assignment_id=s.device_assignment_id;
 update public.terminal_staff_sessions set status='ACTIVE',ended_at=null,role='MANAGER' where id=s.id;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',t.auth_user_id,'role','authenticated','session_id',s.auth_session_id)::text,true);
 perform set_config('request.jwt.claim.sub',t.auth_user_id::text,true);
 perform set_config('request.headers',jsonb_build_object('x-pos-device-credential',proof)::text,true);
 if (public.current_terminal_staff_session()).id is distinct from s.id or not public.has_pos_permission('payment.void') then
   raise exception 'MANAGER_DEVICE_SESSION_NOT_ACTIVE';
 end if;
 result:=public.reprint_pos_receipt(receipt.id,'Local actor attribution check');
 if result->'reprint'->>'reprinted_by' is distinct from s.staff_id::text then raise exception 'REPRINT_ACTOR_NOT_STAFF'; end if;
 result:=public.void_pos_payment(pay.id,'Local actor attribution check',key,'{}'::jsonb);
 select * into void_row from public.payment_voids where payment_id=pay.id and idempotency_key=key;
 if void_row.requested_by is distinct from s.staff_id or result->>'replayed'<>'false' then raise exception 'VOID_ACTOR_NOT_STAFF'; end if;
 result:=public.void_pos_payment(pay.id,'Local actor attribution check',key,'{}'::jsonb);
 if result->>'replayed'<>'true' then raise exception 'VOID_IDEMPOTENT_REPLAY_FAILED'; end if;
 raise notice 'VERIFIED PASS: manager PIN session receipt reprint and payment void use staff profile actor, same-tenant scope and idempotent retry';
end $$;

rollback;
