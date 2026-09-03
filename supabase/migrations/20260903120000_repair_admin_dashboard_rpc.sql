-- Repair migration: the linked staging history marked the canonical migration applied while retaining an older RPC body.\nbegin;

-- Operational thresholds live in data rather than being scattered through UI components.
create table if not exists public.pos_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
alter table public.pos_settings enable row level security;
revoke all on public.pos_settings from public, anon, authenticated;
grant all on public.pos_settings to service_role;
insert into public.pos_settings(key,value,description) values
  ('business.name','"Syok Syok Restaurant"'::jsonb,'Business name displayed in administration'),
  ('dashboard.delayed_order_minutes','20'::jsonb,'Kitchen batch delay warning threshold')
on conflict (key) do nothing;

insert into public.permissions(code,module,description) values
  ('staff.performance.view','reporting','View aggregated staff operational performance')
on conflict (code) do update set module=excluded.module,description=excluded.description;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.code='staff.performance.view'
where r.name='ADMIN' on conflict do nothing;

-- Existing indexes cover order status/date, order items and kitchen queues. These
-- partial indexes target the remaining dashboard filters without duplicating them.
create index if not exists idx_payments_dashboard_paid
  on public.payments(paid_at desc, payment_method, order_id)
  where status in ('PAID','REFUNDED');
create index if not exists idx_payments_dashboard_failed
  on public.payments(created_at desc, order_id) where status='FAILED';
create index if not exists idx_orders_dashboard_payment_created
  on public.orders(payment_status, created_at desc)
  where status not in ('CANCELLED','REFUNDED');
create index if not exists idx_audit_logs_created_at
  on public.audit_logs(created_at desc);
create index if not exists idx_profiles_branch_status
  on public.profiles(branch_id,status) where branch_id is not null;

create table if not exists public.payment_providers(
 id uuid primary key default gen_random_uuid(),
 provider_id text not null unique check(provider_id ~ '^[A-Z0-9_]{2,40}$'),
 display_name text not null check(char_length(btrim(display_name)) between 2 and 80),
 enabled boolean not null default true,
 sort_order integer not null default 100 check(sort_order between 0 and 999),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create or replace function public.get_admin_dashboard(
  p_date_from date,
  p_date_to date,
  p_dining_mode text default null,
  p_payment_method text default null,
  p_payment_provider_id text default null,
  p_staff_id uuid default null,
  p_branch_id uuid default null,
  p_granularity text default 'DAY'
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  restaurant_tz constant text := 'Asia/Kuala_Lumpur';
  from_at timestamptz;
  to_at timestamptz;
  previous_from_at timestamptz;
  previous_to_at timestamptz;
  period_days integer;
  delayed_minutes integer := 20;
  normalized_mode text := nullif(lower(btrim(coalesce(p_dining_mode,''))), '');
  normalized_method text := nullif(upper(btrim(coalesce(p_payment_method,''))), '');
  normalized_provider text := nullif(upper(btrim(coalesce(p_payment_provider_id,''))), '');
  normalized_granularity text := upper(btrim(coalesce(p_granularity,'DAY')));
  access_json jsonb;
  sales_json jsonb := '{}'::jsonb;
  comparison_json jsonb := '{}'::jsonb;
  orders_json jsonb := '{}'::jsonb;
  order_status_json jsonb := '{}'::jsonb;
  order_types_json jsonb := '{}'::jsonb;
  payments_json jsonb := jsonb_build_object('methods','[]'::jsonb,'refunds',jsonb_build_object('count',0,'amount',0),'failed',jsonb_build_object('count',0,'amount',0),'unpaidOrders',0);
  live_json jsonb := '{}'::jsonb;
  top_products_json jsonb := '[]'::jsonb;
  top_category_json jsonb := null;
  performance_json jsonb := '[]'::jsonb;
  previous_performance_json jsonb := '[]'::jsonb;
  recent_orders_json jsonb := '[]'::jsonb;
  alerts_json jsonb := '[]'::jsonb;
  staff_json jsonb := '[]'::jsonb;
  activity_json jsonb := '[]'::jsonb;
  filter_options_json jsonb := '{}'::jsonb;
  current_net numeric := 0;
  previous_net numeric := 0;
begin
  if not public.has_pos_permission('dashboard.view') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if p_date_from is null or p_date_to is null or p_date_from>p_date_to then raise exception 'INVALID_DASHBOARD_DATE_RANGE'; end if;
  if p_date_to-p_date_from>366 then raise exception 'DASHBOARD_DATE_RANGE_TOO_LARGE'; end if;
  if normalized_mode is not null and normalized_mode not in ('dine-in','takeaway') then raise exception 'INVALID_DINING_MODE'; end if;
  if normalized_method is not null and normalized_method not in ('CASH','QR','CARD','EWALLET') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  if normalized_provider is not null and not exists(select 1 from public.payment_providers where provider_id=normalized_provider) then raise exception 'INVALID_PAYMENT_PROVIDER'; end if;
  if normalized_granularity not in ('DAY','WEEK','MONTH') then raise exception 'INVALID_DASHBOARD_GRANULARITY'; end if;

  from_at := p_date_from::timestamp at time zone restaurant_tz;
  to_at := (p_date_to+1)::timestamp at time zone restaurant_tz;
  period_days := p_date_to-p_date_from+1;
  previous_to_at := from_at;
  previous_from_at := (p_date_from-period_days)::timestamp at time zone restaurant_tz;
  select coalesce((value#>>'{}')::integer,20) into delayed_minutes from public.pos_settings where key='dashboard.delayed_order_minutes';

  access_json := jsonb_build_object(
    'reports',public.has_pos_permission('report.view'),
    'orders',public.has_pos_permission('order.view'),
    'payments',public.has_pos_permission('payment.view'),
    'tables',public.has_pos_permission('table.view'),
    'audit',public.has_pos_permission('audit.view'),
    'staffPerformance',public.has_pos_permission('staff.performance.view')
  );

  if public.has_pos_permission('report.view') then
    with settled as (
      select o.id,o.subtotal,o.discount,o.tax,o.service_charge,o.total,max(coalesce(p.paid_at,p.created_at)) settled_at
      from public.orders o join public.profiles staff on staff.id=o.user_id
      join public.payments p on p.order_id=o.id and p.status in ('PAID','REFUNDED')
      where o.status<>'CANCELLED'
        and (normalized_mode is null or o.dining_mode=normalized_mode)
        and (normalized_method is null or p.payment_method=normalized_method)
        and (normalized_provider is null or p.provider_id=normalized_provider)
        and (p_staff_id is null or o.user_id=p_staff_id)
        and (p_branch_id is null or staff.branch_id=p_branch_id)
      group by o.id
    ), current_sales as (
      select coalesce(sum(subtotal),0) gross,coalesce(sum(discount),0) discount,
        coalesce(sum(tax),0) tax,coalesce(sum(service_charge),0) service_charge,
        count(*) orders
      from settled where settled_at>=from_at and settled_at<to_at
    ), current_refunds as (
      select coalesce(sum(r.amount),0) amount,count(*) count
      from public.refunds r join public.orders o on o.id=r.order_id join public.profiles staff on staff.id=o.user_id
      where r.refunded_at>=from_at and r.refunded_at<to_at
        and (normalized_mode is null or o.dining_mode=normalized_mode)
        and (p_staff_id is null or o.user_id=p_staff_id)
        and (p_branch_id is null or staff.branch_id=p_branch_id)
        and (normalized_method is null or exists(select 1 from public.payments p where p.order_id=o.id and p.payment_method=normalized_method))
        and (normalized_provider is null or exists(select 1 from public.payments p where p.order_id=o.id and p.provider_id=normalized_provider))
    )
    select jsonb_build_object(
      'grossSales',s.gross,'discounts',s.discount,'tax',s.tax,'serviceCharge',s.service_charge,
      'refunds',r.amount,'netSales',s.gross-s.discount+s.tax+s.service_charge-r.amount,
      'averageOrderValue',case when s.orders=0 then 0 else (s.gross-s.discount+s.tax+s.service_charge)/s.orders end,
      'settledOrders',s.orders
    ),s.gross-s.discount+s.tax+s.service_charge-r.amount
    into sales_json,current_net from current_sales s cross join current_refunds r;

    with settled as (
      select o.id,o.subtotal,o.discount,o.tax,o.service_charge,max(coalesce(p.paid_at,p.created_at)) settled_at
      from public.orders o join public.profiles staff on staff.id=o.user_id
      join public.payments p on p.order_id=o.id and p.status in ('PAID','REFUNDED')
      where o.status<>'CANCELLED' and (normalized_mode is null or o.dining_mode=normalized_mode)
        and (normalized_method is null or p.payment_method=normalized_method)
        and (normalized_provider is null or p.provider_id=normalized_provider)
        and (p_staff_id is null or o.user_id=p_staff_id) and (p_branch_id is null or staff.branch_id=p_branch_id)
      group by o.id
    ), prior_sales as (
      select coalesce(sum(subtotal-discount+tax+service_charge),0) amount from settled where settled_at>=previous_from_at and settled_at<previous_to_at
    ), prior_refunds as (
      select coalesce(sum(r.amount),0) amount from public.refunds r join public.orders o on o.id=r.order_id join public.profiles staff on staff.id=o.user_id
      where r.refunded_at>=previous_from_at and r.refunded_at<previous_to_at
        and (normalized_mode is null or o.dining_mode=normalized_mode) and (p_staff_id is null or o.user_id=p_staff_id)
        and (p_branch_id is null or staff.branch_id=p_branch_id)
        and (normalized_method is null or exists(select 1 from public.payments p where p.order_id=o.id and p.payment_method=normalized_method))
        and (normalized_provider is null or exists(select 1 from public.payments p where p.order_id=o.id and p.provider_id=normalized_provider))
    ) select s.amount-r.amount into previous_net from prior_sales s cross join prior_refunds r;
    comparison_json := jsonb_build_object('previousNetSales',previous_net,'salesGrowthPercent',case when previous_net=0 then null else round((current_net-previous_net)/abs(previous_net)*100,1) end);

    with paid_orders as (
      select o.id,max(coalesce(p.paid_at,p.created_at)) settled_at
      from public.orders o join public.profiles staff on staff.id=o.user_id join public.payments p on p.order_id=o.id and p.status in ('PAID','REFUNDED')
      where o.status<>'CANCELLED' and (normalized_mode is null or o.dining_mode=normalized_mode)
        and (normalized_method is null or p.payment_method=normalized_method) and (normalized_provider is null or p.provider_id=normalized_provider) and (p_staff_id is null or o.user_id=p_staff_id)
        and (p_branch_id is null or staff.branch_id=p_branch_id) group by o.id
      having max(coalesce(p.paid_at,p.created_at))>=from_at and max(coalesce(p.paid_at,p.created_at))<to_at
    ), ranked as (
      select oi.product_id,oi.product_name_snapshot name,sum(oi.quantity) quantity,sum(oi.subtotal) revenue,
        c.id category_id,c.name category_name
      from paid_orders paid join public.order_items oi on oi.order_id=paid.id
      join public.products product on product.id=oi.product_id join public.categories c on c.id=product.category_id
      where oi.item_status<>'VOIDED' group by oi.product_id,oi.product_name_snapshot,c.id,c.name
    ) select coalesce(jsonb_agg(to_jsonb(x) order by x.quantity desc,x.revenue desc),'[]') into top_products_json
      from (select * from ranked order by quantity desc,revenue desc limit 5)x;

    with paid_orders as (
      select o.id from public.orders o join public.profiles staff on staff.id=o.user_id join public.payments p on p.order_id=o.id and p.status in ('PAID','REFUNDED')
      where o.status<>'CANCELLED' and (normalized_mode is null or o.dining_mode=normalized_mode)
        and (normalized_method is null or p.payment_method=normalized_method) and (normalized_provider is null or p.provider_id=normalized_provider) and (p_staff_id is null or o.user_id=p_staff_id)
        and (p_branch_id is null or staff.branch_id=p_branch_id)
      group by o.id having max(coalesce(p.paid_at,p.created_at))>=from_at and max(coalesce(p.paid_at,p.created_at))<to_at
    ), categories as (
      select c.id,c.name,sum(oi.subtotal) revenue from paid_orders po join public.order_items oi on oi.order_id=po.id
      join public.products product on product.id=oi.product_id join public.categories c on c.id=product.category_id
      where oi.item_status<>'VOIDED' group by c.id,c.name
    ) select to_jsonb(x) into top_category_json from (
      select id,name,revenue,case when sum(revenue) over()=0 then 0 else round(revenue/sum(revenue) over()*100,1) end sales_share_percent
      from categories order by revenue desc limit 1
    )x;

    with sale_events as (
      select max(coalesce(p.paid_at,p.created_at)) event_at,o.total amount,1 order_count
      from public.orders o join public.profiles staff on staff.id=o.user_id join public.payments p on p.order_id=o.id and p.status in ('PAID','REFUNDED')
      where o.status<>'CANCELLED' and (normalized_mode is null or o.dining_mode=normalized_mode)
        and (normalized_method is null or p.payment_method=normalized_method) and (normalized_provider is null or p.provider_id=normalized_provider) and (p_staff_id is null or o.user_id=p_staff_id)
        and (p_branch_id is null or staff.branch_id=p_branch_id) group by o.id
    ), refund_events as (
      select r.refunded_at event_at,-r.amount amount,0 order_count from public.refunds r join public.orders o on o.id=r.order_id
      join public.profiles staff on staff.id=o.user_id where (normalized_mode is null or o.dining_mode=normalized_mode)
        and (p_staff_id is null or o.user_id=p_staff_id) and (p_branch_id is null or staff.branch_id=p_branch_id)
        and (normalized_method is null or exists(select 1 from public.payments p where p.order_id=o.id and p.payment_method=normalized_method))
        and (normalized_provider is null or exists(select 1 from public.payments p where p.order_id=o.id and p.provider_id=normalized_provider))
    ), events as (select * from sale_events union all select * from refund_events), bucketed as (
      select date_trunc(lower(normalized_granularity),event_at at time zone restaurant_tz)::date bucket,
        sum(amount) revenue,sum(order_count) order_count,
        case when event_at>=from_at then 'current' else 'previous' end period
      from events where event_at>=previous_from_at and event_at<to_at group by 1,4
    )
    select coalesce(jsonb_agg(to_jsonb(x) order by bucket) filter(where period='current'),'[]'),
      coalesce(jsonb_agg(to_jsonb(x) order by bucket) filter(where period='previous'),'[]')
    into performance_json,previous_performance_json from (
      select bucket,revenue,order_count,case when order_count=0 then 0 else revenue/order_count end average_order_value,
        period from bucketed
    )x;
  end if;

  if public.has_pos_permission('order.view') then
    with scoped as (
      select o.* from public.orders o join public.profiles staff on staff.id=o.user_id
      where o.created_at>=from_at and o.created_at<to_at
        and (normalized_mode is null or o.dining_mode=normalized_mode) and (p_staff_id is null or o.user_id=p_staff_id)
        and (p_branch_id is null or staff.branch_id=p_branch_id)
        and (normalized_method is null or exists(select 1 from public.payments p where p.order_id=o.id and p.payment_method=normalized_method))
        and (normalized_provider is null or exists(select 1 from public.payments p where p.order_id=o.id and p.provider_id=normalized_provider))
    ) select jsonb_build_object('total',count(*),'open',count(*) filter(where status in ('DRAFT','PLACED','CONFIRMED','PREPARING','READY','SERVED')),
      'completed',count(*) filter(where status='COMPLETED'),'cancelled',count(*) filter(where status='CANCELLED')),
      jsonb_build_object('dineIn',count(*) filter(where dining_mode='dine-in'),'takeaway',count(*) filter(where dining_mode='takeaway'))
    into orders_json,order_types_json from scoped;

    with scoped as (
      select o.status from public.orders o join public.profiles staff on staff.id=o.user_id
      where o.created_at>=from_at and o.created_at<to_at
        and (normalized_mode is null or o.dining_mode=normalized_mode) and (p_staff_id is null or o.user_id=p_staff_id)
        and (p_branch_id is null or staff.branch_id=p_branch_id)
        and (normalized_method is null or exists(select 1 from public.payments p where p.order_id=o.id and p.payment_method=normalized_method))
        and (normalized_provider is null or exists(select 1 from public.payments p where p.order_id=o.id and p.provider_id=normalized_provider))
    ) select coalesce(jsonb_object_agg(status,total),'{}'::jsonb) into order_status_json
      from (select status,count(*) total from scoped group by status)s;

    select coalesce(jsonb_agg(to_jsonb(x) order by created_at desc),'[]') into recent_orders_json from (
      select o.id,o.order_number,o.dining_mode,t.table_number,o.total,o.status,o.payment_status,staff.name staff_name,o.created_at
      from public.orders o join public.profiles staff on staff.id=o.user_id left join public.restaurant_tables t on t.id=o.restaurant_table_id
      where o.created_at>=from_at and o.created_at<to_at and (normalized_mode is null or o.dining_mode=normalized_mode)
        and (p_staff_id is null or o.user_id=p_staff_id) and (p_branch_id is null or staff.branch_id=p_branch_id)
        and (normalized_method is null or exists(select 1 from public.payments p where p.order_id=o.id and p.payment_method=normalized_method))
        and (normalized_provider is null or exists(select 1 from public.payments p where p.order_id=o.id and p.provider_id=normalized_provider))
      order by o.created_at desc limit 8
    )x;
  end if;

  if public.has_pos_permission('payment.view') then
    with methods as (
      select p.payment_method,count(*) transaction_count,coalesce(sum(p.amount),0) amount
      from public.payments p join public.orders o on o.id=p.order_id join public.profiles staff on staff.id=o.user_id
      where p.status in ('PAID','REFUNDED') and coalesce(p.paid_at,p.created_at)>=from_at and coalesce(p.paid_at,p.created_at)<to_at
        and (normalized_mode is null or o.dining_mode=normalized_mode) and (normalized_method is null or p.payment_method=normalized_method) and (normalized_provider is null or p.provider_id=normalized_provider)
        and (p_staff_id is null or o.user_id=p_staff_id) and (p_branch_id is null or staff.branch_id=p_branch_id)
      group by p.payment_method
    ), refunded as (
      select count(*) count,coalesce(sum(r.amount),0) amount from public.refunds r join public.orders o on o.id=r.order_id join public.profiles staff on staff.id=o.user_id
      where r.refunded_at>=from_at and r.refunded_at<to_at and (normalized_mode is null or o.dining_mode=normalized_mode)
        and (normalized_method is null or exists(select 1 from public.payments p where p.order_id=o.id and p.payment_method=normalized_method))
        and (normalized_provider is null or exists(select 1 from public.payments p where p.order_id=o.id and p.provider_id=normalized_provider))
        and (p_staff_id is null or o.user_id=p_staff_id) and (p_branch_id is null or staff.branch_id=p_branch_id)
    ), failed as (
      select count(*) count,coalesce(sum(p.amount),0) amount from public.payments p join public.orders o on o.id=p.order_id join public.profiles staff on staff.id=o.user_id
      where p.status='FAILED' and p.created_at>=from_at and p.created_at<to_at and (normalized_mode is null or o.dining_mode=normalized_mode)
        and (normalized_method is null or p.payment_method=normalized_method) and (normalized_provider is null or p.provider_id=normalized_provider) and (p_staff_id is null or o.user_id=p_staff_id)
        and (p_branch_id is null or staff.branch_id=p_branch_id)
    ) select jsonb_build_object('methods',(select coalesce(jsonb_agg(to_jsonb(m) order by amount desc),'[]') from methods m),
      'refunds',to_jsonb(r),'failed',to_jsonb(f),'unpaidOrders',(select count(*) from public.orders where payment_status in ('UNPAID','PARTIALLY_PAID')))
    into payments_json from refunded r cross join failed f;
  end if;

  select jsonb_build_object(
    'tables',jsonb_build_object(
      'available',count(*) filter(where public.has_pos_permission('table.view') and status='AVAILABLE' and is_active),
      'occupied',count(*) filter(where public.has_pos_permission('table.view') and status='OCCUPIED' and is_active),
      'waitingPayment',(select count(distinct restaurant_table_id) from public.orders where public.has_pos_permission('order.view') and dining_mode='dine-in' and restaurant_table_id is not null and status='SERVED' and payment_status in ('UNPAID','PARTIALLY_PAID')),
      'cleaning',count(*) filter(where public.has_pos_permission('table.view') and status='CLEANING' and is_active)),
    'kitchen',jsonb_build_object(
      'waiting',(select count(*) from public.order_item_batches where public.has_pos_permission('order.view') and status='PENDING'),
      'preparing',(select count(*) from public.order_item_batches where public.has_pos_permission('order.view') and status='PREPARING'),
      'ready',(select count(*) from public.order_item_batches where public.has_pos_permission('order.view') and status='READY'),
      'delayed',(select count(*) from public.order_item_batches where public.has_pos_permission('order.view') and status in ('PENDING','PREPARING') and coalesce(started_at,created_at)<=now()-make_interval(mins=>delayed_minutes)))
  ) into live_json from public.restaurant_tables;

  with alert_rows as (
    select 'FAILED_PAYMENT' code,'CRITICAL' severity,'Failed payment' title,p.payment_number reference,
      format('RM %s payment failed',to_char(p.amount,'FM999999990.00')) message,'payments' destination,'FAILED' filter_value,p.created_at occurred_at
    from public.payments p where public.has_pos_permission('payment.view') and p.status='FAILED' and p.created_at>=from_at and p.created_at<to_at
    union all
    select 'KITCHEN_DELAY','CRITICAL','Kitchen delay',o.order_number,
      format('Kitchen batch waiting %s minutes',floor(extract(epoch from(now()-coalesce(b.started_at,b.created_at)))/60)),
      'orders','PREPARING',coalesce(b.started_at,b.created_at)
    from public.order_item_batches b join public.orders o on o.id=b.order_id
    where public.has_pos_permission('order.view') and b.status in ('PENDING','PREPARING') and coalesce(b.started_at,b.created_at)<=now()-make_interval(mins=>delayed_minutes)
    union all
    select 'SOLD_OUT_PRODUCT','WARNING','Product sold out',p.product_code,p.product_name,'products',p.id::text,p.updated_at
    from public.products p where public.has_pos_permission('product.view') and p.status=true and p.is_available=false
    union all
    select 'UNPAID_ORDER','WARNING','Unpaid order',o.order_number,format('RM %s remains unpaid',to_char(o.total,'FM999999990.00')),
      'orders','UNPAID',o.created_at from public.orders o where public.has_pos_permission('order.view') and o.payment_status in ('UNPAID','PARTIALLY_PAID') and o.status not in ('DRAFT','CANCELLED')
    union all
    select 'CANCELLED_ORDER','INFO','Order cancelled',o.order_number,'Order was cancelled','orders','CANCELLED',o.updated_at
    from public.orders o where public.has_pos_permission('order.view') and o.status='CANCELLED' and o.updated_at>=from_at and o.updated_at<to_at
  ) select coalesce(jsonb_agg(to_jsonb(x) order by case severity when 'CRITICAL' then 1 when 'WARNING' then 2 else 3 end,occurred_at desc),'[]')
    into alerts_json from (select * from alert_rows order by occurred_at desc limit 12)x;

  if public.has_pos_permission('staff.performance.view') then
    with settled as (
      select o.id,o.user_id,o.total,max(coalesce(p.paid_at,p.created_at)) settled_at
      from public.orders o join public.payments p on p.order_id=o.id and p.status in ('PAID','REFUNDED')
      where o.status<>'CANCELLED' and (normalized_mode is null or o.dining_mode=normalized_mode)
        and (normalized_method is null or p.payment_method=normalized_method) and (normalized_provider is null or p.provider_id=normalized_provider) and (p_staff_id is null or o.user_id=p_staff_id)
      group by o.id
    ) select coalesce(jsonb_agg(to_jsonb(x) order by sales_amount desc),'[]') into staff_json from (
      select staff.id,staff.name,staff.role_name role,staff.status account_status,count(s.id) orders_handled,
        coalesce(sum(s.total),0) sales_amount,case when count(s.id)=0 then 0 else avg(s.total) end average_order_value,
        (select count(*) from public.refunds r join public.orders ro on ro.id=r.order_id where ro.user_id=staff.id and r.refunded_at>=from_at and r.refunded_at<to_at) refund_count,
        (select count(*) from public.orders co where co.user_id=staff.id and co.status='CANCELLED' and co.created_at>=from_at and co.created_at<to_at) cancellation_count
      from public.profiles staff left join settled s on s.user_id=staff.id and s.settled_at>=from_at and s.settled_at<to_at
      where staff.status<>'INACTIVE' and (p_staff_id is null or staff.id=p_staff_id) and (p_branch_id is null or staff.branch_id=p_branch_id)
      group by staff.id order by sales_amount desc limit 8
    )x;
  end if;

  if public.has_pos_permission('audit.view') then
    select coalesce(jsonb_agg(to_jsonb(x) order by created_at desc),'[]') into activity_json from (
      select a.id,a.action,a.entity_type,a.entity_id,a.old_value,a.new_value,a.reason,a.created_at,coalesce(staff.name,'System') actor_name
      from public.audit_logs a left join public.profiles staff on staff.id=a.actor_id
      where a.created_at>=from_at and a.created_at<to_at order by a.created_at desc limit 8
    )x;
  end if;

  select jsonb_build_object(
    'branches',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by name),'[]') from public.branches where status='ACTIVE'),
    'staff',(select case when public.has_pos_permission('staff.performance.view') then coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'role',role_name) order by name),'[]') else '[]'::jsonb end from public.profiles where status='ACTIVE'),
    'paymentProviders',(select coalesce(jsonb_agg(jsonb_build_object('providerId',provider_id,'displayName',display_name,'enabled',enabled,'sortOrder',sort_order) order by sort_order,display_name),'[]') from public.payment_providers where enabled=true)
  ) into filter_options_json;

  return jsonb_build_object(
    'generatedAt',now(),'timezone',restaurant_tz,
    'businessName',coalesce((select value#>>'{}' from public.pos_settings where key='business.name'),'Syok Syok Restaurant'),
    'branchName',coalesce((select name from public.branches where id=p_branch_id),'All Branches'),
    'delayedOrderMinutes',delayed_minutes,'access',access_json,'sales',sales_json,'comparison',comparison_json,
    'orders',orders_json,'orderStatus',order_status_json,'orderTypes',order_types_json,'payments',payments_json,
    'live',live_json,'topProducts',top_products_json,'topCategory',top_category_json,
    'salesPerformance',performance_json,'previousPerformance',previous_performance_json,'recentOrders',recent_orders_json,
    'alerts',alerts_json,'staffPerformance',staff_json,'recentActivities',activity_json,'filterOptions',filter_options_json
  );
end;
$$;

revoke all on function public.get_admin_dashboard(date,date,text,text,text,uuid,uuid,text) from public,anon;
grant execute on function public.get_admin_dashboard(date,date,text,text,text,uuid,uuid,text) to authenticated;

commit;


