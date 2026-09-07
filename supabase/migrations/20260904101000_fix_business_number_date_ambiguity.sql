create or replace function public.next_pos_business_number(p_prefix text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  code text := upper(btrim(p_prefix));
  numbering public.numbering_settings%rowtype;
  settings public.restaurant_system_settings%rowtype;
  number_date date;
  period text;
  next_value bigint;
  date_part text;
  branch text;
begin
  select * into settings from public.restaurant_system_settings where id;
  number_date := (clock_timestamp() at time zone settings.timezone)::date;

  if code = 'KB' then
    insert into public.pos_business_number_counters(prefix, business_date, last_value)
    values ('KB', number_date, 1)
    on conflict (prefix, business_date) do update
      set last_value = public.pos_business_number_counters.last_value + 1
    returning last_value into next_value;
    return 'KB-' || to_char(number_date, 'YYYYMMDD') || '-' || lpad(next_value::text, 6, '0');
  end if;

  select * into numbering from public.numbering_settings where entity_code = code;
  if not found then raise exception 'INVALID_BUSINESS_NUMBER_PREFIX'; end if;
  branch := upper(regexp_replace(coalesce(nullif(settings.restaurant_info->>'branchCode', ''), 'MAIN'), '[^A-Z0-9]', '', 'g'));
  period := case numbering.reset_frequency
    when 'NEVER' then 'ALL'
    when 'MONTHLY' then to_char(number_date, 'YYYYMM')
    when 'YEARLY' then to_char(number_date, 'YYYY')
    else to_char(number_date, 'YYYYMMDD')
  end;
  insert into public.configurable_number_counters(entity_code, branch_code, period_key, last_value)
  values (code, branch, period, 1)
  on conflict (entity_code, branch_code, period_key) do update
    set last_value = public.configurable_number_counters.last_value + 1
  returning last_value into next_value;
  if length(next_value::text) > numbering.sequence_padding then raise exception 'BUSINESS_NUMBER_EXHAUSTED'; end if;
  date_part := case numbering.date_format
    when 'YYMMDD' then to_char(number_date, 'YYMMDD')
    when 'YYYY-MM' then to_char(number_date, 'YYYY-MM')
    else to_char(number_date, 'YYYYMMDD')
  end;
  return numbering.prefix || '-' || branch || '-' || date_part || '-' || lpad(next_value::text, numbering.sequence_padding, '0');
end;
$$;

revoke all on function public.next_pos_business_number(text) from public, anon, authenticated;
