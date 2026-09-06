create or replace function public.next_pos_business_number(p_prefix text)
returns text language plpgsql security definer set search_path=public as $$
declare code text:=upper(trim(p_prefix)); d date; n integer; s public.restaurant_system_settings%rowtype;
begin
  select * into s from public.restaurant_system_settings where id;
  d := (clock_timestamp() at time zone coalesce(s.timezone,'Asia/Kuala_Lumpur'))::date;
  if code='KB' then
    insert into public.pos_business_number_counters(prefix,business_date,last_value)
    values ('KB', d, 1)
    on conflict(prefix,business_date) do update set last_value=public.pos_business_number_counters.last_value+1
    returning last_value into n;
    return 'KB-'||to_char(d,'YYYYMMDD')||'-'||lpad(n::text,6,'0');
  end if;
  raise exception 'INVALID_BUSINESS_NUMBER_PREFIX';
end; $$;
