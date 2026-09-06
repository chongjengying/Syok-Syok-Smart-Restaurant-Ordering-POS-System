-- Calculate charges from the post-discount base. Fully discounted orders pay zero.
create or replace function public.apply_order_financial_configuration() returns trigger language plpgsql security definer set search_path=public as $$
declare s public.restaurant_system_settings%rowtype; base numeric(12,2); raw_total numeric(12,4); rounded_total numeric(12,2); increment numeric;
begin
 select * into s from public.restaurant_system_settings where id;
 if tg_op='INSERT' then new.tax_name:=s.tax_name;new.tax_rate:=case when s.tax_enabled then s.tax_rate else 0 end;new.tax_mode:=s.tax_mode;new.service_charge_name:=s.service_charge_name;new.service_charge_rate:=case when s.service_charge_enabled and upper(replace(new.dining_mode,'-','_'))=any(s.service_charge_order_types) then s.service_charge_rate else 0 end;new.currency_code:=s.currency_code;end if;
 if tg_op='INSERT' or new.subtotal is distinct from old.subtotal or new.discount is distinct from old.discount or new.dining_mode is distinct from old.dining_mode then
  base:=greatest(round(coalesce(new.subtotal,0)-coalesce(new.discount,0),2),0);
  if new.tax_mode='INCLUSIVE' then new.tax:=round(base*new.tax_rate/(100+new.tax_rate),2);else new.tax:=round(base*new.tax_rate/100,2);end if;
  new.service_charge:=round(base*new.service_charge_rate/100,2);raw_total:=base+case when new.tax_mode='EXCLUSIVE' then new.tax else 0 end+new.service_charge;
  increment:=case s.rounding_rule when '0.05' then .05 when '0.10' then .10 else .01 end;rounded_total:=round(raw_total/increment)*increment;new.rounding:=round(rounded_total-raw_total,2);new.total:=round(rounded_total,2);
 end if;return new;
end;$$;
