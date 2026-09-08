begin;
update public.order_items set discount_amount = 0 where discount_amount is null;
alter table public.order_items alter column discount_amount set default 0;
commit;
