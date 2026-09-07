begin;

-- A draft is an operational record, so creation is authorized separately from
-- viewing orders. Kitchen users intentionally receive no create permission.
insert into public.permissions(code, module, description) values
  ('order.create', 'operations', 'Create POS draft orders')
on conflict (code) do update set module = excluded.module, description = excluded.description;
insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id from public.roles role
join public.permissions permission on permission.code = 'order.create'
where role.name in ('ADMIN', 'MANAGER', 'WAITER', 'CASHIER') on conflict do nothing;

-- Retain legacy fields for compatibility, but record the immutable POS context
-- explicitly on every new order.
alter table public.orders
  add column if not exists company_id uuid references public.companies(id) on delete restrict,
  add column if not exists created_by_staff_id uuid references public.profiles(id) on delete restrict,
  add column if not exists order_type text,
  add column if not exists opened_at timestamptz,
  add column if not exists submitted_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.profiles(id) on delete restrict,
  add column if not exists cancel_reason text;
update public.orders o set company_id = b.company_id, created_by_staff_id = o.user_id,
  order_type = case when o.dining_mode = 'takeaway' then 'TAKEAWAY' else 'DINE_IN' end,
  opened_at = coalesce(o.opened_at, o.created_at)
from public.branches b where b.id = o.branch_id
  and (o.company_id is null or o.created_by_staff_id is null or o.order_type is null or o.opened_at is null);
alter table public.orders drop constraint if exists orders_order_type_check;
alter table public.orders add constraint orders_order_type_check check (order_type is null or order_type in ('DINE_IN', 'TAKEAWAY'));
create index if not exists orders_company_branch_created_idx on public.orders(company_id, branch_id, created_at desc);
create index if not exists orders_created_by_staff_idx on public.orders(created_by_staff_id, created_at desc);

-- Browser IDs never determine the order context; the active terminal staff
-- session does. This also protects legacy order-creation RPCs.
create or replace function public.assign_order_creation_context()
returns trigger language plpgsql security definer set search_path = public as $$
declare s public.terminal_staff_sessions;
begin
  s := public.require_terminal_staff_session();
  new.company_id := s.company_id;
  new.branch_id := s.branch_id;
  new.terminal_id := s.terminal_id;
  new.staff_session_id := s.id;
  new.user_id := s.staff_id;
  new.created_by_staff_id := s.staff_id;
  new.opened_at := coalesce(new.opened_at, now());
  new.order_type := case new.dining_mode when 'dine-in' then 'DINE_IN' when 'takeaway' then 'TAKEAWAY' else null end;
  if new.order_type is null then raise exception 'INVALID_DINING_MODE'; end if;
  return new;
end;
$$;
drop trigger if exists b_order_creation_context on public.orders;
create trigger b_order_creation_context before insert on public.orders for each row execute function public.assign_order_creation_context();

-- One counter row per branch/date is incremented atomically in the same
-- transaction as the order insert.
create or replace function public.next_branch_order_number(p_branch_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare branch_row public.branches%rowtype; number_settings public.numbering_settings%rowtype; business_date date; next_value bigint; period_key text;
begin
  select * into branch_row from public.branches where id = p_branch_id and status = 'ACTIVE';
  if not found then raise exception 'BRANCH_INACTIVE'; end if;
  select * into number_settings from public.numbering_settings where entity_code = 'ORD';
  if not found then raise exception 'ORDER_NUMBERING_NOT_CONFIGURED'; end if;
  business_date := (clock_timestamp() at time zone coalesce(branch_row.timezone, 'Asia/Kuala_Lumpur'))::date;
  period_key := to_char(business_date, 'YYYYMMDD');
  insert into public.configurable_number_counters(entity_code, branch_code, period_key, last_value)
  values ('ORD', upper(regexp_replace(branch_row.code, '[^A-Z0-9]', '', 'g')), period_key, 1)
  on conflict (entity_code, branch_code, period_key) do update set last_value = public.configurable_number_counters.last_value + 1
  returning last_value into next_value;
  if length(next_value::text) > number_settings.sequence_padding then raise exception 'BUSINESS_NUMBER_EXHAUSTED'; end if;
  return number_settings.prefix || '-' || upper(regexp_replace(branch_row.code, '[^A-Z0-9]', '', 'g')) || '-' || period_key || '-' || lpad(next_value::text, number_settings.sequence_padding, '0');
end;
$$;
revoke all on function public.next_branch_order_number(uuid) from public, anon, authenticated;

create or replace function public.create_pos_draft(p_dining_mode text, p_table_id uuid default null, p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.terminal_staff_sessions; key text; existing public.orders%rowtype;
  new_order public.orders%rowtype; new_payment public.payments%rowtype; number_value text;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if p_dining_mode not in ('dine-in', 'takeaway') then raise exception 'INVALID_DINING_MODE'; end if;
  if (p_dining_mode = 'dine-in' and p_table_id is null) or (p_dining_mode = 'takeaway' and p_table_id is not null) then raise exception 'INVALID_TABLE_ID'; end if;
  if not public.has_pos_permission('order.create') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  s := public.require_terminal_staff_session();
  if s.company_id is null then raise exception 'COMPANY_CONTEXT_REQUIRED'; end if;
  key := nullif(left(btrim(coalesce(p_idempotency_key, '')), 128), '');
  if key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(s.staff_id::text || ':' || key, 0));
  select * into existing from public.orders where created_by_staff_id = s.staff_id and idempotency_key = key for update;
  if found then
    if existing.dining_mode <> p_dining_mode or existing.restaurant_table_id is distinct from p_table_id then raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST'; end if;
    return jsonb_build_object('id', existing.id, 'order_number', existing.order_number, 'order_type', existing.order_type, 'status', existing.status, 'table_id', existing.restaurant_table_id, 'created_at', existing.created_at, 'payment_id', (select id from public.payments where order_id = existing.id order by created_at desc limit 1));
  end if;
  if p_table_id is not null then
    perform 1 from public.restaurant_tables table_row
    join public.branches branch_row on branch_row.id = table_row.branch_id and branch_row.company_id = s.company_id
    where table_row.id = p_table_id and table_row.branch_id = s.branch_id and table_row.is_active and table_row.status = 'AVAILABLE'
    for update of table_row;
    if not found then
      if exists (select 1 from public.restaurant_tables where id = p_table_id) then raise exception 'TABLE_NOT_AVAILABLE'; end if;
      raise exception 'TABLE_NOT_FOUND_OR_OUT_OF_SCOPE';
    end if;
    if exists (select 1 from public.orders where restaurant_table_id = p_table_id and status in ('DRAFT', 'PLACED', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'COLLECTED') and payment_status in ('PENDING', 'UNPAID', 'PARTIALLY_PAID')) then raise exception 'ACTIVE_ORDER_EXISTS'; end if;
  end if;
  number_value := public.next_branch_order_number(s.branch_id);
  perform set_config('app.order_idempotency_fingerprint', md5(p_dining_mode || '|' || coalesce(p_table_id::text, '')), true);
  insert into public.orders(order_number, user_id, company_id, branch_id, terminal_id, created_by_staff_id, staff_session_id, order_type, opened_at, subtotal, discount, tax, service_charge, total, status, payment_status, dining_mode, table_id, restaurant_table_id, idempotency_key)
  values(number_value, s.staff_id, s.company_id, s.branch_id, s.terminal_id, s.staff_id, s.id, case when p_dining_mode = 'dine-in' then 'DINE_IN' else 'TAKEAWAY' end, now(), 0, 0, 0, 0, 0, 'DRAFT', 'UNPAID', p_dining_mode, case when p_table_id is null then null else p_table_id::text end, p_table_id, key)
  returning * into new_order;
  insert into public.payments(order_id, user_id, branch_id, terminal_id, staff_session_id, payment_method, amount, reference, status, paid_at)
  values(new_order.id, s.staff_id, s.branch_id, s.terminal_id, s.id, 'CASH', 0, number_value, 'PENDING', null) returning * into new_payment;
  perform public.write_pos_audit('ORDER_CREATED', 'ORDER', new_order.id, null, jsonb_build_object('companyId', s.company_id, 'branchId', s.branch_id, 'terminalId', s.terminal_id, 'staffId', s.staff_id, 'staffSessionId', s.id, 'orderType', new_order.order_type, 'tableId', new_order.restaurant_table_id, 'orderNumber', new_order.order_number));
  if new_order.restaurant_table_id is not null then perform public.write_pos_audit('TABLE_OCCUPIED', 'RESTAURANT_TABLE', new_order.restaurant_table_id, null, jsonb_build_object('orderId', new_order.id, 'branchId', s.branch_id, 'terminalId', s.terminal_id)); end if;
  return jsonb_build_object('id', new_order.id, 'order_number', new_order.order_number, 'order_type', new_order.order_type, 'status', new_order.status, 'table_id', new_order.restaurant_table_id, 'created_at', new_order.created_at, 'payment_id', new_payment.id);
end;
$$;
revoke all on function public.create_pos_draft(text, uuid, text) from public, anon;
grant execute on function public.create_pos_draft(text, uuid, text) to authenticated;
commit;
