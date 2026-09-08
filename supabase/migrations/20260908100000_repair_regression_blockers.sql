begin;

-- Keep numbering variables distinct from counter column names so PL/pgSQL can
-- compile and the counter increment remains atomic.
create or replace function public.next_branch_order_number(p_branch_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  branch_row public.branches%rowtype;
  number_settings public.numbering_settings%rowtype;
  business_date date;
  next_value bigint;
  v_period_key text;
  v_branch_code text;
begin
  select * into branch_row from public.branches where id = p_branch_id and status = 'ACTIVE';
  if not found then raise exception 'BRANCH_INACTIVE'; end if;
  select * into number_settings from public.numbering_settings where entity_code = 'ORD';
  if not found then raise exception 'ORDER_NUMBERING_NOT_CONFIGURED'; end if;
  business_date := (clock_timestamp() at time zone coalesce(branch_row.timezone, 'Asia/Kuala_Lumpur'))::date;
  v_period_key := to_char(business_date, 'YYYYMMDD');
  v_branch_code := upper(regexp_replace(branch_row.code, '[^A-Z0-9]', '', 'g'));
  insert into public.configurable_number_counters(entity_code, branch_code, period_key, last_value)
  values ('ORD', v_branch_code, v_period_key, 1)
  on conflict (entity_code, branch_code, period_key) do update
    set last_value = public.configurable_number_counters.last_value + 1
  returning last_value into next_value;
  if length(next_value::text) > number_settings.sequence_padding then raise exception 'BUSINESS_NUMBER_EXHAUSTED'; end if;
  return number_settings.prefix || '-' || v_branch_code || '-' || v_period_key || '-' || lpad(next_value::text, number_settings.sequence_padding, '0');
end;
$$;
revoke all on function public.next_branch_order_number(uuid) from public, anon, authenticated;

create or replace function public.begin_pos_payment_attempt(p_order_id uuid,p_payment_method text,p_requested_amount numeric,p_received_amount numeric,p_idempotency_key text,p_provider_id text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  s public.terminal_staff_sessions;
  ord public.orders%rowtype;
  attempt public.payment_attempts%rowtype;
  key text:=nullif(left(btrim(coalesce(p_idempotency_key,'')),128),'');
  method text:=upper(btrim(coalesce(p_payment_method,'')));
  provider_key text:=nullif(upper(btrim(coalesce(p_provider_id,''))), '');
begin
  if key is null or p_requested_amount is null or p_requested_amount<=0 then raise exception 'INVALID_PAYMENT_ATTEMPT'; end if;
  s:=public.require_terminal_staff_session();
  if not public.has_pos_permission('payment.create') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into ord from public.orders where id=p_order_id;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if ord.company_id<>s.company_id or ord.branch_id<>s.branch_id then raise exception 'ORDER_BRANCH_MISMATCH'; end if;
  insert into public.payment_attempts(company_id,branch_id,terminal_id,staff_id,staff_session_id,order_id,idempotency_key,payment_method,provider_id,requested_amount,received_amount,status)
  values(s.company_id,s.branch_id,s.terminal_id,s.staff_id,s.id,ord.id,key,method,provider_key,round(p_requested_amount,2),case when p_received_amount is null then null else round(p_received_amount,2) end,'PENDING')
  on conflict(company_id,idempotency_key) do update set idempotency_key=excluded.idempotency_key
  returning * into attempt;
  return jsonb_build_object('id',attempt.id,'status',attempt.status,'replayed',attempt.created_at<clock_timestamp()-interval '1 millisecond');
end $$;
revoke all on function public.begin_pos_payment_attempt(uuid,text,numeric,numeric,text,text) from public,anon;
grant execute on function public.begin_pos_payment_attempt(uuid,text,numeric,numeric,text,text) to authenticated;

-- The original POS table predates System Administration. Add the columns the
-- administration and routing functions use, retaining the legacy status flag.
alter table public.kitchen_stations
  add column if not exists code text,
  add column if not exists station_type text,
  add column if not exists printer_id uuid references public.printer_configs(id) on delete set null,
  add column if not exists kds_device_key text,
  add column if not exists enabled boolean,
  add column if not exists updated_by uuid references public.profiles(id) on delete set null;
update public.kitchen_stations
set code = coalesce(code, upper(regexp_replace(name, '[^A-Za-z0-9]', '_', 'g'))),
    station_type = coalesce(station_type, 'KITCHEN'),
    enabled = coalesce(enabled, status, true)
where code is null or station_type is null or enabled is null;
alter table public.kitchen_stations alter column code set not null;
create unique index if not exists kitchen_stations_code_uidx on public.kitchen_stations(code);

-- Qualify names that collide with PL/pgSQL variables. Rebuilding from the
-- installed definition preserves the reviewed business logic byte-for-byte
-- outside these name-resolution repairs.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.evaluate_order_discounts(uuid,text)'::regprocedure) into definition;
  definition := replace(definition,
    'select coalesce(sum(amount),0) from public.order_adjustments where order_id=o.id and status=''APPLIED''',
    'select coalesce(sum(a_total.amount),0) from public.order_adjustments a_total where a_total.order_id=o.id and a_total.status=''APPLIED''');
  execute definition;

  select pg_get_functiondef('public.apply_manual_order_discount(uuid,text,numeric,text)'::regprocedure) into definition;
  definition := replace(definition,
    'delete from public.order_adjustments where order_id=o.id and kind=''MANUAL'' and status=''APPLIED''',
    'delete from public.order_adjustments a_delete where a_delete.order_id=o.id and a_delete.kind=''MANUAL'' and a_delete.status=''APPLIED''');
  definition := replace(definition,
    'select coalesce(sum(amount),0) from public.order_adjustments where order_id=o.id and status=''APPLIED''',
    'select coalesce(sum(a_total.amount),0) from public.order_adjustments a_total where a_total.order_id=o.id and a_total.status=''APPLIED''');
  execute definition;

  select pg_get_functiondef('public.approve_manual_order_discount(uuid,uuid,uuid,text,numeric,text)'::regprocedure) into definition;
  definition := replace(definition,
    'delete from public.order_adjustments where order_id=o.id and kind=''MANUAL'' and status=''APPLIED''',
    'delete from public.order_adjustments a_delete where a_delete.order_id=o.id and a_delete.kind=''MANUAL'' and a_delete.status=''APPLIED''');
  definition := replace(definition,
    'select coalesce(sum(amount),0) from public.order_adjustments where order_id=o.id and status=''APPLIED''',
    'select coalesce(sum(a_total.amount),0) from public.order_adjustments a_total where a_total.order_id=o.id and a_total.status=''APPLIED''');
  execute definition;
end $$;

commit;
