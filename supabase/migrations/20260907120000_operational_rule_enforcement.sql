begin;
-- Apply branch switches at the existing payment/discount boundaries, not in UI.
do $$ declare definition text; begin
 select pg_get_functiondef('public.assign_payment_branch_id()'::regprocedure) into definition;
 definition:=replace(definition,'if new.status in (''PAID'',''SUCCESS'') then', 'if new.status in (''PAID'',''SUCCESS'') then
  if (not coalesce((cfg#>>''{pos,partialPaymentEnabled}'')::boolean,true) or not coalesce((cfg#>>''{payment,partialPaymentAllowed}'')::boolean,true)) and new.amount < (select greatest(o.total-coalesce((select sum(p.amount) from public.payments p where p.order_id=o.id and p.status=''PAID'' and p.id<>new.id),0),0) from public.orders o where o.id=new.order_id) then raise exception ''PARTIAL_PAYMENT_DISABLED''; end if;');
 execute definition;
 select pg_get_functiondef('public.evaluate_order_discounts(uuid,text)'::regprocedure) into definition;
 definition:=replace(definition, 'if not found then raise exception ''ORDER_NOT_FOUND''; end if;', 'if not found then raise exception ''ORDER_NOT_FOUND''; end if; if not public.can_read_pos_order(o.id) then raise exception ''ORDER_BRANCH_MISMATCH''; end if;');
 definition:=replace(definition, 'where status=''ACTIVE'' and (starts_at', 'where coalesce((public.effective_branch_settings(o.branch_id)#>>''{pos,promotionEnabled}'')::boolean,true) and status=''ACTIVE'' and (starts_at');
 definition:=replace(definition, 'select * into v from public.vouchers where code=', 'if not coalesce((public.effective_branch_settings(o.branch_id)#>>''{pos,voucherEnabled}'')::boolean,true) then raise exception ''VOUCHERS_DISABLED''; end if; select * into v from public.vouchers where code=');
 execute definition;
end $$;
-- Company catalog stays shared; legacy products.branch_id is not repurposed as
-- availability. Branch availability can later use a separate association.
create policy promotion_branch_scope on public.promotions as restrictive for all to authenticated using(branch_id is null or public.can_access_branch(branch_id)) with check(public.current_pos_role()='ADMIN' or branch_id is not null and public.can_access_branch(branch_id));
create policy voucher_branch_scope on public.vouchers as restrictive for all to authenticated using(branch_id is null or public.can_access_branch(branch_id)) with check(public.current_pos_role()='ADMIN' or branch_id is not null and public.can_access_branch(branch_id));
-- Session reset/deactivation/role reassignment takes effect immediately.
create or replace function public.invalidate_changed_staff_sessions() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if old.status is distinct from new.status or old.role_id is distinct from new.role_id or old.branch_id is distinct from new.branch_id then
  update public.terminal_staff_sessions set status='ENDED',ended_at=now() where staff_id=new.id and status in ('ACTIVE','LOCKED');
 end if;
 return new;
end $$;
create trigger staff_session_access_changed after update on public.profiles for each row execute function public.invalidate_changed_staff_sessions();
-- Preserve historical table attribution and allow the same table code at another branch.
alter table public.restaurant_tables drop constraint if exists restaurant_tables_table_number_key;
create unique index if not exists restaurant_tables_branch_number_unique on public.restaurant_tables(branch_id,table_number);
create or replace function public.guard_table_branch_context() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='UPDATE' and new.branch_id is distinct from old.branch_id then raise exception 'TABLE_BRANCH_IMMUTABLE'; end if;
 if new.branch_id is null then select branch_id into new.branch_id from public.profiles where id=auth.uid(); end if;
 if new.branch_id is null then raise exception 'BRANCH_REQUIRED'; end if;
 if auth.uid() is not null and not public.can_access_branch(new.branch_id) then raise exception 'TABLE_BRANCH_MISMATCH'; end if;
 if tg_op='INSERT' and not exists(select 1 from public.branches where id=new.branch_id and status='ACTIVE') then raise exception 'BRANCH_INACTIVE'; end if;
 return new;
end $$;
create trigger a_table_branch_context before insert or update on public.restaurant_tables for each row execute function public.guard_table_branch_context();
-- Scope existing PIN reset and staff mutation RPCs to both old and new branch.
do $$ declare signature text; definition text; begin
 foreach signature in array array['admin_update_staff(uuid,jsonb)','require_staff_pin_setup(uuid)'] loop
  select pg_get_functiondef(to_regprocedure('public.'||signature)) into definition;
  definition:=regexp_replace(definition,'begin','begin if public.current_pos_role() is distinct from ''ADMIN'' and not exists(select 1 from public.profiles scope_profile where scope_profile.id=p_user_id and public.can_access_branch(scope_profile.branch_id)) then raise exception ''INSUFFICIENT_PERMISSION''; end if;', 'i');
  if signature='admin_update_staff(uuid,jsonb)' then
   definition:=replace(definition,'begin if public.current_pos_role()', 'begin if nullif(p_payload->>''branchId'','''') is not null and not public.can_access_branch((p_payload->>''branchId'')::uuid) then raise exception ''INSUFFICIENT_PERMISSION''; end if; if public.current_pos_role()');
  end if;
  execute definition;
 end loop;
end $$;
commit;
