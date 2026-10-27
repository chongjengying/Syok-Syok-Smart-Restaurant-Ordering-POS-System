begin;

-- Operational order actions are capabilities, not role-name checks. This lets
-- administrators create equivalent custom kitchen/front-of-house roles while
-- preserving the existing built-in role behaviour.
insert into public.permissions(code,module,description) values
  ('order.kitchen.manage','operations','Receive, prepare, complete, and recover kitchen tickets'),
  ('order.serve','operations','Mark ready orders as served')
on conflict(code) do update set module=excluded.module,description=excluded.description;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id
from public.roles r cross join public.permissions p
where (r.name in ('ADMIN','MANAGER','KITCHEN') and p.code='order.kitchen.manage')
   or (r.name in ('ADMIN','MANAGER','WAITER','CASHIER') and p.code='order.serve')
on conflict do nothing;

create or replace function public.can_read_pos_order(p_order_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1
    from public.orders o
    where o.id=p_order_id
      and public.can_access_branch(o.branch_id)
      and public.has_pos_permission('order.view')
      and (
        not public.has_pos_permission('order.kitchen.manage')
        or o.status in ('CONFIRMED','PREPARING','READY')
        or exists(
          select 1 from public.order_items i
          where i.order_id=o.id and i.item_status in ('SUBMITTED','PREPARING','READY')
        )
      )
  );
$$;

create or replace function public.start_kitchen_order(p_order_id uuid)
returns public.orders
language plpgsql security definer set search_path=public
as $$
declare
  ord public.orders%rowtype;
begin
  if not public.has_pos_permission('order.kitchen.manage') then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;
  select * into ord from public.orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if not public.can_access_branch(ord.branch_id) then raise exception 'ORDER_NOT_FOUND'; end if;
  if ord.payment_status <> 'UNPAID' then raise exception 'ORDER_ALREADY_PAID'; end if;
  if ord.status = 'PREPARING' then return ord; end if;
  if ord.status <> 'CONFIRMED' then raise exception 'ORDER_NOT_READY_TO_START'; end if;
  update public.order_items set item_status='PREPARING'
  where order_id=p_order_id and item_status='SUBMITTED';
  perform set_config('app.status_change_notes','Kitchen started preparation',true);
  update public.orders
  set status='PREPARING',kitchen_started_at=clock_timestamp()
  where id=p_order_id returning * into ord;
  return ord;
end;
$$;

create or replace function public.transition_pos_order(
  p_order_id uuid,p_new_status text,p_notes text default null
)
returns public.orders
language plpgsql security definer set search_path=public
as $$
declare
  ord public.orders%rowtype;
  target text:=upper(trim(coalesce(p_new_status,'')));
  result public.orders%rowtype;
begin
  if not public.has_pos_permission('order.view') then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;
  if target not in ('CONFIRMED','PREPARING','READY','SERVED','COMPLETED','CANCELLED') then
    raise exception 'INVALID_ORDER_STATUS';
  end if;
  select * into ord from public.orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if not public.can_access_branch(ord.branch_id) then raise exception 'ORDER_NOT_FOUND'; end if;

  if target='CANCELLED' then
    if ord.payment_status in ('PAID','PARTIALLY_PAID') then raise exception 'PAID_ORDER_CANNOT_BE_CANCELLED'; end if;
    if not public.has_pos_permission('order.cancel') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
    if ord.user_id<>auth.uid() and not public.has_pos_permission('order.manage') then
      raise exception 'MANAGER_REQUIRED_FOR_LATE_CANCELLATION';
    end if;
    update public.order_items
    set item_status='VOIDED',void_reason=coalesce(nullif(left(p_notes,1000),''),'Order cancelled'),voided_by=auth.uid(),voided_at=now()
    where order_id=p_order_id and item_status not in ('SERVED','VOIDED');
    update public.payments set status='CANCELLED'
    where order_id=p_order_id and status in ('PENDING','PROCESSING','FAILED');
    update public.orders set status='CANCELLED',payment_status='UNPAID'
    where id=p_order_id returning * into result;
    return result;
  end if;

  if not ((ord.status='DRAFT' and target='CONFIRMED') or
          (ord.status='CONFIRMED' and target='PREPARING') or
          (ord.status='PREPARING' and target='READY') or
          (ord.status='READY' and target='SERVED') or
          (ord.status='SERVED' and target='COMPLETED')) then
    raise exception 'INVALID_ORDER_TRANSITION';
  end if;
  if target='CONFIRMED' and not public.has_pos_permission('order.submit') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if target in ('PREPARING','READY') and not public.has_pos_permission('order.kitchen.manage') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if target='SERVED' and not public.has_pos_permission('order.serve') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if target='COMPLETED' and not public.has_pos_permission('order.manage') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if target='COMPLETED' and ord.payment_status<>'PAID' then raise exception 'PAYMENT_NOT_CONFIRMED'; end if;

  if target='PREPARING' then
    update public.order_items set item_status='PREPARING' where order_id=p_order_id and item_status='SUBMITTED';
  elsif target='READY' then
    update public.order_items set item_status='READY' where order_id=p_order_id and item_status in ('SUBMITTED','PREPARING');
  elsif target='SERVED' then
    update public.order_items set item_status='SERVED' where order_id=p_order_id and item_status='READY';
  end if;
  perform set_config('app.status_change_notes',coalesce(left(p_notes,1000),''),true);
  update public.orders
  set status=case when target='SERVED' and payment_status='PAID' then 'COMPLETED' else target end,
      kitchen_started_at=case when target='PREPARING' then coalesce(kitchen_started_at,clock_timestamp()) else kitchen_started_at end
  where id=p_order_id returning * into result;
  return result;
end;
$$;

create or replace function public.serve_ready_order(p_order_id uuid)
returns public.orders
language plpgsql security definer set search_path=public
as $$
declare ord public.orders%rowtype;
begin
  if not public.has_pos_permission('order.serve') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into ord from public.orders where id=p_order_id for update;
  if not found or not public.can_access_branch(ord.branch_id) then raise exception 'ORDER_NOT_FOUND'; end if;
  if ord.status='SERVED' then return ord; end if;
  if ord.status<>'READY' then raise exception 'ORDER_NOT_READY'; end if;
  update public.order_items set item_status='SERVED' where order_id=p_order_id and item_status='READY';
  perform set_config('app.status_change_notes','Order served',true);
  update public.orders set status=case when payment_status='PAID' then 'COMPLETED' else 'SERVED' end
  where id=p_order_id returning * into ord;
  return ord;
end;
$$;

do $$
declare
  f record;
  definition text;
begin
  for f in
    select oid::regprocedure as signature
    from pg_proc
    where pronamespace='public'::regnamespace
      and proname in ('acknowledge_kitchen_ticket','start_kitchen_batch','ready_kitchen_batch',
                      'fail_kitchen_ticket','recover_kitchen_ticket','reprint_kitchen_ticket','complete_kitchen_ticket')
  loop
    select pg_get_functiondef(f.signature) into definition;
    definition:=regexp_replace(
      definition,
      $pattern$select role_name into role from public\.profiles where id=auth\.uid\(\) and status='ACTIVE'; if coalesce\(role,''\) not in \('ADMIN','MANAGER','KITCHEN'\) then raise exception 'INSUFFICIENT_PERMISSION'; end if;$pattern$,
      $replacement$if not public.has_pos_permission('order.kitchen.manage') then raise exception 'INSUFFICIENT_PERMISSION'; end if;$replacement$,
      'g'
    );
    execute definition;
  end loop;
end;
$$;

commit;
