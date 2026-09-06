-- Preserve configurable order/payment/receipt/refund numbering and avoid
-- PL/pgSQL variable names that collide with counter column names.
create or replace function public.next_pos_business_number(p_prefix text)
returns text language plpgsql security definer set search_path=public as $$
declare
  v_code text := upper(btrim(p_prefix));
  v_settings public.numbering_settings%rowtype;
  v_system public.restaurant_system_settings%rowtype;
  v_date date;
  v_period text;
  v_next bigint;
  v_date_part text;
  v_branch text;
begin
  select * into v_system from public.restaurant_system_settings where id;
  v_date := (clock_timestamp() at time zone coalesce(v_system.timezone,'Asia/Kuala_Lumpur'))::date;
  if v_code = 'KB' then
    insert into public.pos_business_number_counters(prefix,business_date,last_value)
    values ('KB',v_date,1)
    on conflict(prefix,business_date) do update
      set last_value=public.pos_business_number_counters.last_value+1
    returning last_value into v_next;
    if v_next > 999999 then raise exception 'BUSINESS_NUMBER_EXHAUSTED'; end if;
    return 'KB-'||to_char(v_date,'YYYYMMDD')||'-'||lpad(v_next::text,6,'0');
  end if;
  select * into v_settings from public.numbering_settings where entity_code=v_code;
  if not found then raise exception 'INVALID_BUSINESS_NUMBER_PREFIX'; end if;
  v_branch := upper(regexp_replace(coalesce(nullif(v_system.restaurant_info->>'branchCode',''),'MAIN'),'[^A-Z0-9]','','g'));
  v_period := case v_settings.reset_frequency when 'NEVER' then 'ALL' when 'MONTHLY' then to_char(v_date,'YYYYMM') when 'YEARLY' then to_char(v_date,'YYYY') else to_char(v_date,'YYYYMMDD') end;
  insert into public.configurable_number_counters(entity_code,branch_code,period_key,last_value)
  values(v_code,v_branch,v_period,1)
  on conflict(entity_code,branch_code,period_key) do update
    set last_value=public.configurable_number_counters.last_value+1
  returning last_value into v_next;
  if length(v_next::text)>v_settings.sequence_padding then raise exception 'BUSINESS_NUMBER_EXHAUSTED'; end if;
  v_date_part := case v_settings.date_format when 'YYMMDD' then to_char(v_date,'YYMMDD') when 'YYYY-MM' then to_char(v_date,'YYYY-MM') else to_char(v_date,'YYYYMMDD') end;
  return v_settings.prefix||'-'||v_branch||'-'||v_date_part||'-'||lpad(v_next::text,v_settings.sequence_padding,'0');
end;
$$;
revoke all on function public.next_pos_business_number(text) from public,anon,authenticated;
