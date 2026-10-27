begin;

-- Refund receipts need their own numbering configuration, not an unsupported prefix.
alter table public.numbering_settings drop constraint numbering_settings_entity_code_check;
alter table public.numbering_settings add constraint numbering_settings_entity_code_check check(entity_code in ('ORD','PAY','RCP','REF','RFD'));
insert into public.numbering_settings(entity_code,prefix) values('ORD','ORD'),('PAY','PAY'),('RCP','RCP'),('REF','REF'),('RFD','RFD') on conflict(entity_code) do nothing;

create function public.guard_transaction_shift_context() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.cashier_shift_id is distinct from old.cashier_shift_id or new.branch_id is distinct from old.branch_id
   or new.terminal_id is distinct from old.terminal_id or new.staff_session_id is distinct from old.staff_session_id
   or new.user_id is distinct from old.user_id then raise exception 'TRANSACTION_SHIFT_CONTEXT_IMMUTABLE'; end if;
 return new;
end $$;
create trigger c_order_shift_immutable before update on public.orders for each row execute function public.guard_transaction_shift_context();
create trigger c_payment_shift_immutable before update on public.payments for each row execute function public.guard_transaction_shift_context();

create or replace function public.enforce_paid_payment_role() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.status='PAID' and (tg_op='INSERT' or old.status is distinct from new.status) and not public.has_pos_permission('payment.create') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 return new;
end $$;

do $$ declare definition text; begin
 select pg_get_functiondef('public.assign_manual_payment_confirmation()'::regprocedure) into definition;
 definition:=replace(definition,'coalesce(public.current_pos_role(),'''') not in (''ADMIN'',''MANAGER'',''CASHIER'')','not public.has_pos_permission(''payment.create'')');
 execute definition;
 select pg_get_functiondef('public.complete_payment(uuid,text,numeric,text,text,text)'::regprocedure) into definition;
 definition:=replace(definition,'coalesce(staff_role, '''') not in (''ADMIN'', ''MANAGER'', ''CASHIER'')','not public.has_pos_permission(''payment.create'')');
 execute definition;
end $$;

revoke all on function public.guard_transaction_shift_context() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
