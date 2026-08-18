-- The linked project recorded the older order RPC migration before its dining
-- columns were added locally. Repair that schema drift without rewriting
-- applied migration history.
alter table public.orders
  add column if not exists dining_mode text not null default 'takeaway',
  add column if not exists table_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_dining_mode_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_dining_mode_check
      check (dining_mode in ('dine-in', 'takeaway'));
  end if;

end;
$$;

alter table public.orders drop constraint if exists orders_dine_in_table_check;
alter table public.orders
  add constraint orders_dine_in_table_check
  check (dining_mode <> 'dine-in' or restaurant_table_id is not null);
