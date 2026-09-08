begin;
create or replace function public.enforce_order_item_financial_defaults()
returns trigger language plpgsql set search_path=public as $$
begin
  new.discount_amount := coalesce(new.discount_amount, 0);
  new.modifier_total := coalesce(new.modifier_total, 0);
  new.tax_rate := coalesce(new.tax_rate, 0);
  new.tax_mode_snapshot := coalesce(new.tax_mode_snapshot, 'EXCLUSIVE');
  new.tax_amount := coalesce(new.tax_amount, 0);
  new.service_charge_rate := coalesce(new.service_charge_rate, 0);
  new.service_charge_amount := coalesce(new.service_charge_amount, 0);
  return new;
end $$;
drop trigger if exists a_enforce_order_item_financial_defaults on public.order_items;
create trigger a_enforce_order_item_financial_defaults
before insert or update on public.order_items
for each row execute function public.enforce_order_item_financial_defaults();
commit;
