begin;

create or replace function public.verify_pos_manager_approval_pin(
 p_order_id uuid,p_requested_by uuid,p_manager_id uuid,p_pin text,p_permission text)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare o public.orders; st public.staff; c public.staff_pin_credentials_v2;
        result jsonb; attempts smallint;
begin
 if auth.role()<>'service_role' then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 if p_permission not in ('discount.approve','order.manage') then raise exception 'INVALID_APPROVAL_PERMISSION'; end if;
 if p_pin is null or p_pin !~ '^[0-9]{6}$' then return jsonb_build_object('ok',false,'code','INVALID_PIN'); end if;
 select * into o from public.orders where id=p_order_id;
 if not found or not public.profile_has_company_permission(p_requested_by,o.company_id,o.branch_id,
   case when p_permission='discount.approve' then 'discount.apply' else 'order.view' end)
 then return jsonb_build_object('ok',false,'code','REQUESTER_OUT_OF_SCOPE'); end if;
 select * into st from public.staff
 where (id=p_manager_id or legacy_profile_id=p_manager_id) and company_id=o.company_id and active
 order by case when id=p_manager_id then 0 else 1 end limit 1;
 if st.id is null then
   if not public.profile_has_company_permission(p_manager_id,o.company_id,o.branch_id,p_permission)
     then return jsonb_build_object('ok',false,'code','MANAGER_UNAVAILABLE'); end if;
   result:=public.verify_staff_pin_exchange(p_manager_id,p_pin);
   return result||jsonb_build_object('legacyProfileId',p_manager_id);
 end if;
 if not public.profile_has_company_permission(st.legacy_profile_id,o.company_id,o.branch_id,p_permission)
   or not public.staff_record_has_branch(st.id,o.branch_id)
 then return jsonb_build_object('ok',false,'code','MANAGER_UNAVAILABLE'); end if;
 perform pg_advisory_xact_lock(hashtextextended('staff-manager-approval:'||st.id::text,0));
 select * into c from public.staff_pin_credentials_v2 where staff_id=st.id for update;
 if not found or c.status='SETUP_REQUIRED' or c.pin_hash is null then
   return jsonb_build_object('ok',false,'code','PIN_SETUP_REQUIRED'); end if;
 if c.locked_until is not null and c.locked_until>now() then
   return jsonb_build_object('ok',false,'code','PIN_LOCKED'); end if;
 if c.pin_hash<>crypt(p_pin,c.pin_hash) then
   attempts:=least(c.failed_attempts+1,20);
   update public.staff_pin_credentials_v2 set failed_attempts=attempts,
     locked_until=case when attempts>=5 then now()+interval '5 minutes' else null end where staff_id=st.id;
   return jsonb_build_object('ok',false,'code',case when attempts>=5 then 'PIN_LOCKED' else 'INVALID_PIN' end);
 end if;
 update public.staff_pin_credentials_v2 set failed_attempts=0,locked_until=null where staff_id=st.id;
 return jsonb_build_object('ok',true,'legacyProfileId',st.legacy_profile_id);
end $$;
revoke all on function public.verify_pos_manager_approval_pin(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.verify_pos_manager_approval_pin(uuid,uuid,uuid,text,text) to service_role;

commit;
