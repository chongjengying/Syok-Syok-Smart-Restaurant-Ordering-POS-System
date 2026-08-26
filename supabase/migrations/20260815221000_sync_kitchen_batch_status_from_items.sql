-- Keep batch history correct for both the new batch endpoints and older
-- order-level lifecycle RPCs that update item_status in bulk.

create or replace function public.sync_pos_kitchen_batch_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_batch_id uuid := coalesce(new.batch_id, old.batch_id);
  derived_status text;
begin
  if target_batch_id is null then return coalesce(new, old); end if;

  derived_status := case
    when exists (select 1 from public.order_items where batch_id = target_batch_id and item_status = 'PREPARING') then 'PREPARING'
    when exists (select 1 from public.order_items where batch_id = target_batch_id and item_status = 'SUBMITTED') then 'PENDING'
    when exists (select 1 from public.order_items where batch_id = target_batch_id and item_status = 'READY') then 'READY'
    when exists (select 1 from public.order_items where batch_id = target_batch_id and item_status = 'SERVED') then 'SERVED'
    else 'CANCELLED'
  end;

  update public.order_item_batches
  set status = derived_status,
      started_at = case
        when derived_status in ('PREPARING', 'READY', 'SERVED') then coalesce(started_at, clock_timestamp())
        else started_at
      end,
      ready_at = case
        when derived_status in ('READY', 'SERVED') then coalesce(ready_at, clock_timestamp())
        else ready_at
      end,
      served_at = case
        when derived_status = 'SERVED' then coalesce(served_at, clock_timestamp())
        else served_at
      end
  where id = target_batch_id
    and status is distinct from derived_status;
  return coalesce(new, old);
end;
$$;

revoke all on function public.sync_pos_kitchen_batch_status() from public, anon, authenticated;
drop trigger if exists trg_sync_pos_kitchen_batch_status on public.order_items;
create trigger trg_sync_pos_kitchen_batch_status
after update of item_status on public.order_items
for each row
when (old.item_status is distinct from new.item_status)
execute function public.sync_pos_kitchen_batch_status();
