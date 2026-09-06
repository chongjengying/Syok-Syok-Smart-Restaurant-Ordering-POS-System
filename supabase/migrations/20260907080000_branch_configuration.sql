begin;
-- The existing singleton remains the default configuration. Branches store only
-- explicit overrides; effective configuration is resolved in one server path.
create or replace function public.effective_branch_settings(p_branch_id uuid) returns jsonb language sql stable security definer set search_path=public as $$
 select to_jsonb(s)||b.configuration||jsonb_build_object(
 'currency_code',coalesce(b.currency_code,c.currency_code,s.currency_code),
 'timezone',coalesce(b.timezone,c.timezone,s.timezone),
 'restaurant_info',s.restaurant_info||jsonb_build_object('restaurantName',c.name,'branchName',b.name,'branchCode',b.code,'address',coalesce(b.address,c.address),'phone',coalesce(b.phone,c.phone),'registrationNo',coalesce(b.registration_no,c.registration_no)),
 'receipt_config',s.receipt_config||coalesce(b.configuration->'receipt_config','{}'))
 from public.restaurant_system_settings s cross join public.branches b join public.companies c on c.id=b.company_id where s.id and b.id=p_branch_id;
$$;
revoke all on function public.effective_branch_settings(uuid) from public,anon,authenticated;

create or replace function public.get_branch_management(p_branch_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare b public.branches; settings jsonb;
begin
 if not public.can_access_branch(p_branch_id) or not public.has_pos_permission('branch.view') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 select * into b from public.branches where id=p_branch_id;
 if not found then raise exception 'BRANCH_NOT_FOUND'; end if;
 settings:=public.effective_branch_settings(b.id);
 return jsonb_build_object('branch',to_jsonb(b),'company',(select to_jsonb(c) from public.companies c where c.id=b.company_id),'settings',settings,
 'activeTerminalCount',(select count(*) from public.pos_terminals where branch_id=b.id and status='ACTIVE'),
 'activeStaffCount',(select count(*) from public.profiles where branch_id=b.id and status='ACTIVE'),
 'terminals',(select coalesce(jsonb_agg(to_jsonb(t)-'device_identifier' order by t.terminal_code),'[]') from public.pos_terminals t where t.branch_id=b.id),
 'staff',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'role',p.role_name,'status',p.status,'pinStatus',coalesce(sc.status,'SETUP_REQUIRED'),'lastActive',(select max(last_activity_at) from public.terminal_staff_sessions where staff_id=p.id)) order by p.name),'[]') from public.profiles p left join public.staff_pin_credentials sc on sc.user_id=p.id where p.branch_id=b.id),
 'tables',(select coalesce(jsonb_agg(to_jsonb(t) order by t.table_number),'[]') from public.restaurant_tables t where t.branch_id=b.id),
 'openOrders',(select count(*) from public.orders where branch_id=b.id and status not in ('COMPLETED','CANCELLED') and payment_status<>'PAID'),
 'todayOrders',(select count(*) from public.orders where branch_id=b.id and (created_at at time zone (settings->>'timezone'))::date=(now() at time zone (settings->>'timezone'))::date),
 'audit',(select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc),'[]') from (select * from public.audit_logs where branch_id=b.id and public.has_pos_permission('audit.view') order by created_at desc limit 50) a));
end $$;
create or replace function public.save_branch_configuration(p_branch_id uuid,p_patch jsonb,p_expected_revision bigint) returns jsonb language plpgsql security definer set search_path=public as $$
declare b public.branches; k text; v jsonb; next_config jsonb;
begin
 if not public.can_access_branch(p_branch_id) or not public.has_pos_permission('settings.manage') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 select * into b from public.branches where id=p_branch_id for update;
 if not found then raise exception 'BRANCH_NOT_FOUND'; end if;
 if b.revision is distinct from p_expected_revision then raise exception 'CONFIGURATION_CHANGED'; end if;
 if jsonb_typeof(p_patch) is distinct from 'object' then raise exception 'INVALID_CONFIGURATION'; end if;
 for k,v in select * from jsonb_each(p_patch) loop
  if not k=any(array['tax_enabled','tax_name','tax_rate','tax_mode','service_charge_enabled','service_charge_name','service_charge_rate','service_charge_order_types','rounding_rule','receipt_config','pos','payment','kitchen','business_hours']) then raise exception 'UNKNOWN_CONFIGURATION_FIELD: %',k; end if;
  if v='null'::jsonb then continue; end if;
  if k in ('tax_rate','service_charge_rate') and (jsonb_typeof(v)<>'number' or (v#>>'{}')::numeric not between 0 and 100) then raise exception 'INVALID_RATE'; end if;
  if k in ('tax_enabled','service_charge_enabled') and jsonb_typeof(v)<>'boolean' then raise exception 'INVALID_BOOLEAN'; end if;
  if k='tax_mode' and (v#>>'{}') not in ('INCLUSIVE','EXCLUSIVE') then raise exception 'INVALID_TAX_MODE'; end if;
  if k='rounding_rule' and (v#>>'{}') not in ('NONE','0.05','0.10') then raise exception 'INVALID_ROUNDING_RULE'; end if;
  if k='service_charge_order_types' and (jsonb_typeof(v)<>'array' or exists(select 1 from jsonb_array_elements_text(v) x where x not in ('DINE_IN','TAKEAWAY'))) then raise exception 'INVALID_ORDER_TYPE'; end if;
  if k in ('receipt_config','pos','payment','kitchen') and jsonb_typeof(v)<>'object' then raise exception 'INVALID_CONFIGURATION'; end if;
 end loop;
 next_config:=jsonb_strip_nulls(b.configuration||p_patch);
 -- Type-check the operational switches on the server before accepting them.
 for k,v in select * from jsonb_each(coalesce(next_config->'pos','{}')) loop
  if k='idleTimeoutMinutes' then
   if jsonb_typeof(v)<>'number' or (v#>>'{}')::numeric not between 1 and 120 then raise exception 'INVALID_IDLE_TIMEOUT'; end if;
  elsif k='defaultOrderType' then
   if (v#>>'{}') not in ('DINE_IN','TAKEAWAY') then raise exception 'INVALID_ORDER_TYPE'; end if;
  elsif k in ('dineInEnabled','takeawayEnabled','splitPaymentEnabled','partialPaymentEnabled','voucherEnabled','promotionEnabled','autoLockEnabled') then
   if jsonb_typeof(v)<>'boolean' then raise exception 'INVALID_BOOLEAN'; end if;
  else raise exception 'UNKNOWN_POS_SETTING'; end if;
 end loop;
 for k,v in select * from jsonb_each(coalesce(next_config->'payment','{}')) loop
  if k not in ('cashEnabled','cardEnabled','qrEnabled','referenceRequired','partialPaymentAllowed','splitPaymentEnabled') or jsonb_typeof(v)<>'boolean' then raise exception 'INVALID_PAYMENT_SETTING'; end if;
 end loop;
 update public.branches set configuration=next_config,revision=revision+1,updated_at=now() where id=b.id;
 perform public.write_pos_audit_diff('BRANCH_CONFIGURATION_UPDATED','BRANCH',b.id,null,b.configuration,next_config);
 return public.get_branch_management(b.id);
end $$;
revoke all on function public.get_branch_management(uuid),public.save_branch_configuration(uuid,jsonb,bigint) from public,anon;
grant execute on function public.get_branch_management(uuid),public.save_branch_configuration(uuid,jsonb,bigint) to authenticated;

-- Reuse the existing financial trigger, changing only its source configuration.
do $migration$
declare definition text;
begin
 select pg_get_functiondef('public.apply_order_financial_configuration()'::regprocedure) into definition;
 definition:=replace(definition,'select * into s from public.restaurant_system_settings where id;',
 'select * into s from jsonb_populate_record(null::public.restaurant_system_settings,public.effective_branch_settings(new.branch_id));');
 execute definition;
end $migration$;
-- Fix split payments taken by different cashiers: receipt paid amount includes
-- every successful payment, while cashier attribution uses the last payment.
do $migration$
declare definition text;
begin
 select pg_get_functiondef('public.issue_paid_order_receipt()'::regprocedure) into definition;
 definition:=replace(definition,'select p.user_id,round(sum(p.amount),2) into actor,paid from public.payments p where p.order_id=new.id and p.status=''PAID'' group by p.user_id order by max(p.paid_at) desc limit 1;',
 'select p.user_id into actor from public.payments p where p.order_id=new.id and p.status=''PAID'' order by p.paid_at desc,p.id desc limit 1; select round(sum(p.amount),2) into paid from public.payments p where p.order_id=new.id and p.status=''PAID'';');
 definition:=replace(definition,'select coalesce(to_jsonb(s)-''password''-''secret'',''{}'') into restaurant from public.restaurant_system_settings s limit 1;',
 'restaurant:=public.effective_branch_settings(new.branch_id);');
 execute definition;
end $migration$;
commit;
