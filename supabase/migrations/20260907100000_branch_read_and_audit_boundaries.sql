begin;
-- Administrative read RPCs must obey the same RLS as direct reads. Their
-- existing permission checks, filters and return contracts remain intact.
do $$ declare f record; begin
 for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and (proname like 'get_%report%' or proname like 'list_admin_%' or proname='get_admin_dashboard') loop
  execute format('alter function %s security invoker',f.signature);
 end loop;
end $$;
alter view public.daily_sales_report set (security_invoker=true);
grant select on public.daily_sales_report to authenticated;
create policy report_staff_names on public.profiles for select to authenticated using(public.can_access_branch(branch_id) and (public.has_pos_permission('report.view') or public.has_pos_permission('user.view')));
create policy branch_receipt_scope on public.receipts as restrictive for select to authenticated using(public.can_access_branch(branch_id));
create policy branch_refund_scope on public.refunds as restrictive for select to authenticated using(exists(select 1 from public.orders o where o.id=refunds.order_id and public.can_access_branch(o.branch_id)));
create policy branch_adjustment_scope on public.order_adjustments as restrictive for select to authenticated using(public.can_read_pos_order(order_id));
create policy branch_redemption_scope on public.voucher_redemptions as restrictive for select to authenticated using(public.can_read_pos_order(order_id));
-- An administrator acting through a PIN session is restricted to the active
-- terminal's branch; email/password administration retains organization access.
create or replace function public.can_access_branch(p_branch_id uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and p.status='ACTIVE' and case
 when exists(select 1 from public.terminal_staff_sessions s where s.auth_session_id=nullif(auth.jwt()->>'session_id','')::uuid) then p_branch_id=(public.current_terminal_staff_session()).branch_id
 else p.role_name='ADMIN' or p.branch_id=p_branch_id end);
$$;
-- Never grant administration through the PIN token. Sensitive operational
-- permissions remain available according to the actual operator's current role.
create or replace function public.has_pos_permission(p_permission text) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.profiles p join public.role_permissions rp on rp.role_id=p.role_id join public.permissions pm on pm.id=rp.permission_id
 where p.id=auth.uid() and p.status='ACTIVE' and pm.code=p_permission and (
 not exists(select 1 from public.terminal_staff_sessions s where s.auth_session_id=nullif(auth.jwt()->>'session_id','')::uuid)
 or (public.current_terminal_staff_session()).id is not null and p_permission not like 'company.%' and p_permission not like 'branch.%' and p_permission not like 'terminal.%' and p_permission not like 'user.%' and p_permission not like 'role.%' and p_permission not like 'settings.%'));
$$;
create or replace function public.get_my_permissions() returns text[] language sql stable security definer set search_path=public as $$
 select coalesce(array_agg(p.code order by p.code),'{}') from public.permissions p where public.has_pos_permission(p.code);
$$;

alter table public.audit_logs add column if not exists actor_auth_user_id uuid references public.profiles(id) on delete restrict, add column if not exists actor_staff_id uuid references public.profiles(id) on delete restrict, add column if not exists approved_by_staff_id uuid references public.profiles(id) on delete restrict, add column if not exists terminal_id uuid references public.pos_terminals(id) on delete restrict, add column if not exists company_id uuid references public.companies(id) on delete restrict;
create or replace function public.attribute_pos_audit() returns trigger language plpgsql security definer set search_path=public as $$
declare s public.terminal_staff_sessions;
begin
 s:=public.current_terminal_staff_session();
 new.actor_auth_user_id:=coalesce(s.actor_auth_user_id,auth.uid(),new.actor_id);
 new.actor_staff_id:=s.staff_id;new.terminal_id:=s.terminal_id;
 if s.id is not null then new.branch_id:=s.branch_id;
 elsif new.entity_type='BRANCH' then new.branch_id:=new.entity_id;
 elsif new.entity_type='TERMINAL' then select branch_id into new.branch_id from public.pos_terminals where id=new.entity_id;
 elsif new.entity_type in ('ORDER','PAYMENT','REFUND','RECEIPT') then
  if new.entity_type='ORDER' then select branch_id into new.branch_id from public.orders where id=new.entity_id;
  elsif new.entity_type='PAYMENT' then select branch_id into new.branch_id from public.payments where id=new.entity_id;
  end if;
 end if;
 if new.entity_type='COMPANY' then new.company_id:=new.entity_id;new.branch_id:=null;
 else select company_id into new.company_id from public.branches where id=new.branch_id;end if;
 return new;
end $$;
create trigger audit_operational_attribution before insert on public.audit_logs for each row execute function public.attribute_pos_audit();
-- Global configuration controls company-wide defaults and is ADMIN-only.
do $$ declare name text; definition text; begin
 foreach name in array array['save_system_administration(jsonb,bigint)','get_system_administration()','update_payment_providers(jsonb)'] loop
  if to_regprocedure('public.'||name) is not null then
   select pg_get_functiondef(to_regprocedure('public.'||name)) into definition;
   definition:=regexp_replace(definition,'begin','begin if public.current_pos_role() is distinct from ''ADMIN'' then raise exception ''COMPANY_ADMIN_REQUIRED''; end if;', 'i');
   execute definition;
  end if;
 end loop;
end $$;

create or replace function public.assign_user_branch(p_user_id uuid,p_branch_id uuid) returns public.profiles language plpgsql security definer set search_path=public as $$
declare p public.profiles; old_row jsonb;
begin
 if not public.has_pos_permission('user.edit') or not public.can_access_branch(p_branch_id) then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 select * into p from public.profiles where id=p_user_id for update;
 if not found then raise exception 'USER_NOT_FOUND'; end if;
 if not public.can_access_branch(p.branch_id) then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 if not exists(select 1 from public.branches where id=p_branch_id and status='ACTIVE') then raise exception 'INVALID_BRANCH'; end if;
 old_row:=jsonb_build_object('branchId',p.branch_id);
 update public.profiles set branch_id=p_branch_id,updated_at=now() where id=p.id returning * into p;
 update public.terminal_staff_sessions set status='ENDED',ended_at=now() where staff_id=p.id and status in ('ACTIVE','LOCKED');
 perform public.write_pos_audit_diff('STAFF_ASSIGNED','PROFILE',p.id,null,old_row,jsonb_build_object('branchId',p_branch_id));return p;
end $$;
-- Safe counters retain their existing atomic upsert; only branch/timezone source changes.
do $$ declare definition text; begin
 select pg_get_functiondef('public.next_pos_business_number(text)'::regprocedure) into definition;
 definition:=replace(definition,'select * into v_system from public.restaurant_system_settings where id;', 'select * into v_system from jsonb_populate_record(null::public.restaurant_system_settings,public.effective_branch_settings(coalesce((public.current_terminal_staff_session()).branch_id,(select branch_id from public.profiles where id=auth.uid()))));');
 execute definition;
end $$;
create or replace function public.get_pos_display_settings() returns jsonb language plpgsql stable security definer set search_path=public as $$
declare s jsonb; branch uuid;
begin
 if not public.is_active_pos_user() then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 branch:=coalesce((public.current_terminal_staff_session()).branch_id,(select branch_id from public.profiles where id=auth.uid()));
 s:=public.effective_branch_settings(branch);
 return jsonb_build_object('restaurantInfo',s->'restaurant_info','logoPath',s->'logo_path','receiptConfig',s->'receipt_config','timezone',s->'timezone','currencyCode',s->'currency_code','currencySymbol',s->'currency_symbol','decimalPlaces',s->'decimal_places','defaultLanguage',s->'default_language','enabledLanguages',s->'enabled_languages','pos',s->'pos','payment',s->'payment');
end $$;
commit;
