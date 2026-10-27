begin;

create or replace function public.record_cash_refund_movement()
returns trigger language plpgsql security definer set search_path=public as $$
declare payment_row public.payments%rowtype; refund_shift uuid;
begin
  select * into payment_row from public.payments where id=new.payment_id;
  refund_shift:=new.cashier_shift_id;
  if payment_row.payment_method='CASH' and refund_shift is not null then
    insert into public.cash_movements(company_id,branch_id,terminal_id,shift_id,staff_id,movement_type,amount,reason)
    values(
      (select company_id from public.branches where id=payment_row.branch_id),
      payment_row.branch_id,coalesce(new.terminal_id,payment_row.terminal_id),refund_shift,
      new.requested_by,'CASH_REFUND',new.amount,'Refund '||new.refund_number
    );
  end if;
  return new;
end;
$$;
drop trigger if exists trg_record_cash_refund_movement on public.refunds;
create trigger trg_record_cash_refund_movement after insert on public.refunds for each row execute function public.record_cash_refund_movement();

commit;
