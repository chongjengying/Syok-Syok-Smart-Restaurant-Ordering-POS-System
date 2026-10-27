begin;

create or replace function public.guard_transaction_shift_context() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.cashier_shift_id is distinct from old.cashier_shift_id or new.branch_id is distinct from old.branch_id or new.terminal_id is distinct from old.terminal_id then raise exception 'TRANSACTION_SHIFT_CONTEXT_IMMUTABLE'; end if;
 if (tg_table_name='orders' or old.status in ('PAID','REFUNDED','VOIDED')) and
   (new.staff_session_id is distinct from old.staff_session_id or new.user_id is distinct from old.user_id) then raise exception 'TRANSACTION_SHIFT_CONTEXT_IMMUTABLE'; end if;
 return new;
end $$;

create function public.guard_order_item_shift() returns trigger
language plpgsql security definer set search_path=public as $$
declare sh public.cashier_shifts; shift_id uuid; financial_change boolean;
begin
 financial_change:=tg_op='INSERT';
 if tg_op='UPDATE' then financial_change:=new.order_id is distinct from old.order_id or new.product_id is distinct from old.product_id
   or new.quantity is distinct from old.quantity or new.unit_price is distinct from old.unit_price or new.subtotal is distinct from old.subtotal
   or new.item_status='VOIDED' and old.item_status<>'VOIDED'; end if;
 if financial_change then
   select cashier_shift_id into shift_id from public.orders where id=new.order_id;
   -- Legacy unlinked orders remain readable, but cannot acquire new items.
   select * into sh from public.cashier_shifts where id=shift_id and status='OPEN' for share;
   if sh.id is null then raise exception 'ACTIVE_CASHIER_SHIFT_REQUIRED'; end if;
 end if;
 return new;
end $$;
create trigger b_order_item_shift_guard before insert or update on public.order_items for each row execute function public.guard_order_item_shift();
revoke all on function public.guard_order_item_shift() from public,anon,authenticated;

-- A staff handoff changes the operator, not the shift owner. Staff detail can show both.
do $$ declare definition text; begin
 select pg_get_functiondef('public.get_admin_staff_detail(uuid)'::regprocedure) into definition;
 definition:=replace(definition,'return result;', 'return result || jsonb_build_object(''currentShift'',case when public.has_pos_permission(''cash.shift.view'') then (
   select jsonb_build_object(''id'',sh.id,''shift_number'',sh.shift_number,''status'',sh.status,''opened_at'',sh.opened_at,''branch'',b.name,''terminal'',t.name,''terminal_code'',t.terminal_code,''owner_name'',p.name)
   from public.cashier_shifts sh join public.branches b on b.id=sh.branch_id join public.pos_terminals t on t.id=sh.terminal_id join public.profiles p on p.id=sh.opened_by_staff_id
   where sh.company_id=st.company_id and sh.status=''OPEN'' and public.can_access_branch(sh.branch_id)
     and exists(select 1 from public.terminal_staff_sessions ss where ss.staff_record_id=st.id and ss.terminal_id=sh.terminal_id and ss.company_id=sh.company_id and ss.branch_id=sh.branch_id and ss.status=''ACTIVE'' and public.terminal_staff_access_reason(t.id,st.id) is null)
   order by sh.opened_at desc limit 1) end);');
 execute definition;
end $$;

notify pgrst,'reload schema';
commit;
