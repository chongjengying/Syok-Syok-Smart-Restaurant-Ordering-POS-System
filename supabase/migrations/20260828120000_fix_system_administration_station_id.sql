begin;

create or replace function public.save_system_administration(
  p_payload jsonb,
  p_expected_revision bigint
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.restaurant_system_settings%rowtype;
  entry jsonb;
  v_station_id uuid;
  allowed_keys text[] := array[
    'restaurantInfo','logoPath','taxEnabled','taxName','taxRate','taxMode',
    'serviceChargeEnabled','serviceChargeName','serviceChargeRate',
    'serviceChargeOrderTypes','receiptConfig','timezone','currencyCode',
    'currencySymbol','decimalPlaces','roundingRule','defaultLanguage',
    'enabledLanguages','backupConfig','printers','stations','numbering',
    'integrations'
  ];
  unknown text;
begin
  if not public.has_pos_permission('settings.manage') then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;

  select * into current_row
  from public.restaurant_system_settings settings
  where settings.id
  for update;

  if current_row.revision <> p_expected_revision then
    raise exception 'CONFIGURATION_CHANGED';
  end if;

  select key into unknown
  from jsonb_object_keys(p_payload) key
  where not (key = any(allowed_keys))
  limit 1;
  if unknown is not null then raise exception 'UNKNOWN_CONFIGURATION_FIELD'; end if;
  if jsonb_typeof(p_payload->'restaurantInfo') <> 'object'
     or char_length(btrim(p_payload#>>'{restaurantInfo,restaurantName}')) not between 1 and 150
  then raise exception 'INVALID_RESTAURANT_INFORMATION'; end if;
  if (p_payload->>'taxRate')::numeric not between 0 and 100
     or (p_payload->>'serviceChargeRate')::numeric not between 0 and 100
  then raise exception 'INVALID_RATE'; end if;
  if upper(p_payload->>'taxMode') not in ('INCLUSIVE','EXCLUSIVE') then raise exception 'INVALID_TAX_MODE'; end if;
  if upper(p_payload->>'currencyCode') !~ '^[A-Z]{3}$' then raise exception 'INVALID_CURRENCY'; end if;
  if p_payload->>'timezone' !~ '^[A-Za-z_]+/[A-Za-z_+-]+$' then raise exception 'INVALID_TIMEZONE'; end if;
  if not exists(select 1 from pg_timezone_names where name = p_payload->>'timezone') then raise exception 'INVALID_TIMEZONE'; end if;
  if jsonb_typeof(p_payload->'receiptConfig') <> 'object'
     or jsonb_typeof(p_payload->'backupConfig') <> 'object'
  then raise exception 'INVALID_CONFIGURATION'; end if;
  if not ((p_payload->>'defaultLanguage') = any(array(select jsonb_array_elements_text(p_payload->'enabledLanguages'))))
  then raise exception 'DEFAULT_LANGUAGE_MUST_BE_ENABLED'; end if;
  if coalesce(p_payload->>'logoPath','') <> ''
     and p_payload->>'logoPath' !~ '^branding/logo-[0-9a-f-]{36}\.(png|jpg|webp)$'
  then raise exception 'INVALID_LOGO_PATH'; end if;

  update public.restaurant_system_settings
  set restaurant_info = p_payload->'restaurantInfo',
      logo_path = nullif(left(p_payload->>'logoPath',500),''),
      tax_enabled = (p_payload->>'taxEnabled')::boolean,
      tax_name = left(btrim(p_payload->>'taxName'),40),
      tax_rate = (p_payload->>'taxRate')::numeric,
      tax_mode = upper(p_payload->>'taxMode'),
      service_charge_enabled = (p_payload->>'serviceChargeEnabled')::boolean,
      service_charge_name = left(btrim(p_payload->>'serviceChargeName'),40),
      service_charge_rate = (p_payload->>'serviceChargeRate')::numeric,
      service_charge_order_types = array(select upper(jsonb_array_elements_text(p_payload->'serviceChargeOrderTypes'))),
      receipt_config = p_payload->'receiptConfig',
      timezone = p_payload->>'timezone',
      currency_code = upper(p_payload->>'currencyCode'),
      currency_symbol = left(p_payload->>'currencySymbol',8),
      decimal_places = (p_payload->>'decimalPlaces')::smallint,
      rounding_rule = p_payload->>'roundingRule',
      default_language = p_payload->>'defaultLanguage',
      enabled_languages = array(select jsonb_array_elements_text(p_payload->'enabledLanguages')),
      backup_config = p_payload->'backupConfig',
      revision = revision + 1,
      updated_at = now(),
      updated_by = auth.uid()
  where id;

  delete from public.kitchen_station_categories ksc where ksc.station_id is not null;
  delete from public.kitchen_stations ks where ks.id is not null;
  delete from public.printer_configs pc where pc.id is not null;

  for entry in select * from jsonb_array_elements(coalesce(p_payload->'printers','[]')) loop
    insert into public.printer_configs(
      id,name,type,connection_type,ip_address,port,paper_width,auto_cut,copies,enabled,updated_by
    ) values (
      coalesce(nullif(entry->>'id','')::uuid,gen_random_uuid()),
      left(btrim(entry->>'name'),100),upper(entry->>'type'),upper(entry->>'connectionType'),
      nullif(entry->>'ipAddress','')::inet,nullif(entry->>'port','')::integer,
      (entry->>'paperWidth')::smallint,coalesce((entry->>'autoCut')::boolean,false),
      (entry->>'copies')::smallint,(entry->>'enabled')::boolean,auth.uid()
    );
  end loop;

  for entry in select * from jsonb_array_elements(coalesce(p_payload->'stations','[]')) loop
    v_station_id := coalesce(nullif(entry->>'id','')::uuid,gen_random_uuid());
    insert into public.kitchen_stations(
      id,name,code,station_type,printer_id,kds_device_key,enabled,updated_by
    ) values (
      v_station_id,left(btrim(entry->>'name'),100),upper(btrim(entry->>'code')),
      upper(entry->>'stationType'),nullif(entry->>'printerId','')::uuid,
      nullif(left(btrim(entry->>'kdsDeviceKey'),100),''),(entry->>'enabled')::boolean,auth.uid()
    );
    insert into public.kitchen_station_categories(station_id,category_id)
    select v_station_id, category.value::uuid
    from jsonb_array_elements_text(coalesce(entry->'categoryIds','[]')) category(value);
  end loop;

  for entry in select * from jsonb_array_elements(coalesce(p_payload->'numbering','[]')) loop
    update public.numbering_settings
    set prefix = upper(entry->>'prefix'),
        sequence_padding = (entry->>'sequencePadding')::smallint,
        date_format = entry->>'dateFormat',
        reset_frequency = upper(entry->>'resetFrequency'),
        updated_at = now(),
        updated_by = auth.uid()
    where entity_code = upper(entry->>'entityCode');
  end loop;

  for entry in select * from jsonb_array_elements(coalesce(p_payload->'integrations','[]')) loop
    if coalesce(entry->'publicConfig','{}') ?| array['secret','apiKey','token','password','privateKey','accessToken','refreshToken']
    then raise exception 'SECRET_FIELD_NOT_ALLOWED'; end if;
    update public.integration_configs
    set provider = nullif(left(btrim(entry->>'provider'),80),''),
        enabled = (entry->>'enabled')::boolean,
        status = case when (entry->>'enabled')::boolean and credentials_configured then 'DISCONNECTED' else 'NOT_CONFIGURED' end,
        public_config = coalesce(entry->'publicConfig','{}'),
        updated_at = now(),
        updated_by = auth.uid()
    where integration_type = upper(entry->>'integrationType');
  end loop;

  perform public.write_pos_audit(
    'SYSTEM_CONFIGURATION_UPDATED','SETTING',null,null,
    jsonb_build_object(
      'revisionFrom',current_row.revision,
      'revisionTo',current_row.revision+1,
      'environment',current_setting('app.environment',true),
      'taxChanged',current_row.tax_rate is distinct from (p_payload->>'taxRate')::numeric,
      'serviceChargeChanged',current_row.service_charge_rate is distinct from (p_payload->>'serviceChargeRate')::numeric,
      'currencyChanged',current_row.currency_code is distinct from upper(p_payload->>'currencyCode'),
      'timezoneChanged',current_row.timezone is distinct from p_payload->>'timezone'
    )
  );
  return public.get_system_administration();
exception
  when unique_violation then raise exception 'DUPLICATE_CONFIGURATION';
  when invalid_text_representation then raise exception 'INVALID_CONFIGURATION';
end;
$$;

revoke all on function public.save_system_administration(jsonb,bigint) from public,anon;
grant execute on function public.save_system_administration(jsonb,bigint) to authenticated;

commit;
