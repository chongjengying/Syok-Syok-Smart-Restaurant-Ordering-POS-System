begin;

alter table public.audit_logs add column cashier_shift_id uuid references public.cashier_shifts(id) on delete restrict;
create index audit_logs_cashier_shift_idx on public.audit_logs(cashier_shift_id,created_at desc) where cashier_shift_id is not null;

-- Admin force-close may have no POS session; its location comes from the affected shift.
do $$ declare definition text; begin
 select pg_get_functiondef('public.attribute_pos_audit()'::regprocedure) into definition;
 definition:=replace(definition,'  return new;', '  if new.entity_type=''CASHIER_SHIFT'' then
    select sh.id,sh.company_id,sh.branch_id,sh.terminal_id into new.cashier_shift_id,new.company_id,new.branch_id,new.terminal_id from public.cashier_shifts sh where sh.id=new.entity_id;
  elsif new.entity_type=''CASH_MOVEMENT'' then
    select m.shift_id,m.company_id,m.branch_id,m.terminal_id into new.cashier_shift_id,new.company_id,new.branch_id,new.terminal_id from public.cash_movements m where m.id=new.entity_id;
  end if;
  if new.cashier_shift_id is not null then new.metadata:=new.metadata||jsonb_build_object(''shiftId'',new.cashier_shift_id); end if;
  return new;');
 execute definition;
end $$;

notify pgrst,'reload schema';
commit;
