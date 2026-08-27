begin;

insert into public.permissions(code,module,description) values
('settings.view','settings','View restaurant system administration configuration')
on conflict(code) do update set module=excluded.module,description=excluded.description;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.name in ('ADMIN','MANAGER') and p.code='settings.view' on conflict do nothing;

create table if not exists public.restaurant_system_settings(
  id boolean primary key default true check(id),
  restaurant_info jsonb not null default '{}'::jsonb check(jsonb_typeof(restaurant_info)='object'),
  logo_path text,
  tax_enabled boolean not null default true,
  tax_name varchar(40) not null default 'SST',
  tax_rate numeric(7,4) not null default 6 check(tax_rate between 0 and 100),
  tax_mode varchar(12) not null default 'EXCLUSIVE' check(tax_mode in ('INCLUSIVE','EXCLUSIVE')),
  service_charge_enabled boolean not null default true,
  service_charge_name varchar(40) not null default 'Service Charge',
  service_charge_rate numeric(7,4) not null default 10 check(service_charge_rate between 0 and 100),
  service_charge_order_types text[] not null default array['DINE_IN'] check(service_charge_order_types <@ array['DINE_IN','TAKEAWAY']::text[]),
  receipt_config jsonb not null default '{"showLogo":true,"receiptHeader":"","showRestaurantName":true,"showAddress":true,"showPhone":true,"showTaxNumber":true,"showOrderNumber":true,"showTableNumber":true,"showStaffName":true,"showPaymentMethod":true,"showTax":true,"showServiceCharge":true,"showDiscount":true,"showItemNotes":true,"receiptFooter":"","thankYouMessage":"Thank you!","autoPrint":false,"copies":1,"paperSize":"80mm"}'::jsonb,
  timezone varchar(80) not null default 'Asia/Kuala_Lumpur',
  currency_code char(3) not null default 'MYR' check(currency_code ~ '^[A-Z]{3}$'),
  currency_symbol varchar(8) not null default 'RM',
  decimal_places smallint not null default 2 check(decimal_places between 0 and 4),
  rounding_rule varchar(10) not null default 'NONE' check(rounding_rule in ('NONE','0.05','0.10')),
  default_language varchar(5) not null default 'en' check(default_language in ('en','zh','ms')),
  enabled_languages text[] not null default array['en','zh','ms'] check(enabled_languages <@ array['en','zh','ms']::text[]),
  backup_config jsonb not null default '{"mode":"MANAGED_EXTERNALLY","provider":"SUPABASE","frequency":"PROVIDER_MANAGED","retention":"PROVIDER_MANAGED"}'::jsonb,
  revision bigint not null default 1 check(revision>0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
insert into public.restaurant_system_settings(id,restaurant_info) values(true,jsonb_build_object('restaurantName','Restaurant','branchName','Main Branch','branchCode','MAIN','country','Malaysia')) on conflict(id) do nothing;

create table if not exists public.printer_configs(
 id uuid primary key default gen_random_uuid(),name varchar(100) not null,type varchar(30) not null check(type in ('RECEIPT','KITCHEN','BEVERAGE','OTHER')),
 connection_type varchar(30) not null check(connection_type in ('NETWORK','USB','BLUETOOTH','SYSTEM_PRINT')),ip_address inet,port integer check(port between 1 and 65535),
 paper_width smallint not null default 80 check(paper_width in (58,80)),auto_cut boolean not null default false,copies smallint not null default 1 check(copies between 1 and 9),enabled boolean not null default true,
 updated_at timestamptz not null default now(),updated_by uuid references public.profiles(id) on delete set null
);
create table if not exists public.kitchen_stations(
 id uuid primary key default gen_random_uuid(),name varchar(100) not null,code varchar(30) not null unique check(code ~ '^[A-Z0-9_-]{2,30}$'),
 station_type varchar(30) not null check(station_type in ('MAIN_KITCHEN','BEVERAGE','DESSERT','BAR','OTHER')),printer_id uuid references public.printer_configs(id) on delete set null,
 kds_device_key varchar(100),enabled boolean not null default true,updated_at timestamptz not null default now(),updated_by uuid references public.profiles(id) on delete set null
);
create table if not exists public.kitchen_station_categories(
 station_id uuid not null references public.kitchen_stations(id) on delete cascade,category_id uuid not null references public.categories(id) on delete restrict,primary key(station_id,category_id),unique(category_id)
);
create table if not exists public.integration_configs(
 id uuid primary key default gen_random_uuid(),integration_type varchar(30) not null unique check(integration_type in ('PAYMENT_GATEWAY','WHATSAPP','ACCOUNTING','EMAIL','SMS','DELIVERY','EXTERNAL_API','WEBHOOK')),
 provider varchar(80),enabled boolean not null default false,status varchar(20) not null default 'NOT_CONFIGURED' check(status in ('CONNECTED','NOT_CONFIGURED','DISCONNECTED','ERROR')),
 public_config jsonb not null default '{}'::jsonb check(jsonb_typeof(public_config)='object'),credentials_configured boolean not null default false,
 updated_at timestamptz not null default now(),updated_by uuid references public.profiles(id) on delete set null
);
insert into public.integration_configs(integration_type,provider,status,public_config) values
('PAYMENT_GATEWAY','MANUAL','NOT_CONFIGURED','{"mode":"CASH_AND_MANUAL_QR"}'::jsonb),('WHATSAPP',null,'NOT_CONFIGURED','{}'),('ACCOUNTING',null,'NOT_CONFIGURED','{}'),('EMAIL',null,'NOT_CONFIGURED','{}'),('SMS',null,'NOT_CONFIGURED','{}'),('DELIVERY',null,'NOT_CONFIGURED','{}'),('EXTERNAL_API',null,'NOT_CONFIGURED','{}'),('WEBHOOK',null,'NOT_CONFIGURED','{}') on conflict(integration_type) do nothing;

create table if not exists public.numbering_settings(
 entity_code varchar(4) primary key check(entity_code in ('ORD','PAY','RCP','REF')),prefix varchar(8) not null check(prefix ~ '^[A-Z0-9]{2,8}$'),sequence_padding smallint not null default 6 check(sequence_padding between 3 and 10),
 date_format varchar(10) not null default 'YYYYMMDD' check(date_format in ('YYYYMMDD','YYMMDD','YYYY-MM')),reset_frequency varchar(10) not null default 'DAILY' check(reset_frequency in ('NEVER','DAILY','MONTHLY','YEARLY')),
 updated_at timestamptz not null default now(),updated_by uuid references public.profiles(id) on delete set null
);
insert into public.numbering_settings(entity_code,prefix) values('ORD','ORD'),('PAY','PAY'),('RCP','RCP'),('REF','REF') on conflict(entity_code) do nothing;
create table if not exists public.configurable_number_counters(entity_code varchar(4) not null,branch_code varchar(12) not null,period_key varchar(10) not null,last_value bigint not null check(last_value>0),primary key(entity_code,branch_code,period_key));

alter table public.restaurant_system_settings enable row level security;alter table public.printer_configs enable row level security;alter table public.kitchen_stations enable row level security;alter table public.kitchen_station_categories enable row level security;alter table public.integration_configs enable row level security;alter table public.numbering_settings enable row level security;alter table public.configurable_number_counters enable row level security;
revoke all on public.restaurant_system_settings,public.printer_configs,public.kitchen_stations,public.kitchen_station_categories,public.integration_configs,public.numbering_settings,public.configurable_number_counters from public,anon,authenticated;
grant select on public.restaurant_system_settings,public.printer_configs,public.kitchen_stations,public.kitchen_station_categories,public.integration_configs,public.numbering_settings to authenticated;
grant all on public.restaurant_system_settings,public.printer_configs,public.kitchen_stations,public.kitchen_station_categories,public.integration_configs,public.numbering_settings,public.configurable_number_counters to service_role;
create policy settings_read_main on public.restaurant_system_settings for select to authenticated using(public.has_pos_permission('settings.view'));
create policy settings_read_printers on public.printer_configs for select to authenticated using(public.has_pos_permission('settings.view'));
create policy settings_read_stations on public.kitchen_stations for select to authenticated using(public.has_pos_permission('settings.view'));
create policy settings_read_station_categories on public.kitchen_station_categories for select to authenticated using(public.has_pos_permission('settings.view'));
create policy settings_read_integrations on public.integration_configs for select to authenticated using(public.has_pos_permission('settings.view'));
create policy settings_read_numbering on public.numbering_settings for select to authenticated using(public.has_pos_permission('settings.view'));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('restaurant-assets','restaurant-assets',true,5242880,array['image/png','image/jpeg','image/webp']) on conflict(id) do update set public=true,file_size_limit=5242880,allowed_mime_types=excluded.allowed_mime_types;
create policy restaurant_assets_public_read on storage.objects for select using(bucket_id='restaurant-assets');
create policy restaurant_assets_admin_insert on storage.objects for insert to authenticated with check(bucket_id='restaurant-assets' and public.has_pos_permission('settings.manage') and name~'^branding/logo-[0-9a-f-]{36}\.(png|jpg|webp)$');
create policy restaurant_assets_admin_delete on storage.objects for delete to authenticated using(bucket_id='restaurant-assets' and public.has_pos_permission('settings.manage') and name~'^branding/logo-[0-9a-f-]{36}\.(png|jpg|webp)$');

create or replace function public.get_system_administration() returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
 if not public.has_pos_permission('settings.view') then raise exception 'INSUFFICIENT_PERMISSION';end if;
 select to_jsonb(s)||jsonb_build_object('canEdit',public.has_pos_permission('settings.manage'),'printers',(select coalesce(jsonb_agg(to_jsonb(p) order by p.name),'[]') from public.printer_configs p),'stations',(select coalesce(jsonb_agg(to_jsonb(k)||jsonb_build_object('categoryIds',(select coalesce(jsonb_agg(c.category_id),'[]') from public.kitchen_station_categories c where c.station_id=k.id)) order by k.name),'[]') from public.kitchen_stations k),'numbering',(select coalesce(jsonb_agg(to_jsonb(n) order by n.entity_code),'[]') from public.numbering_settings n),'integrations',(select coalesce(jsonb_agg(to_jsonb(i)-'public_config'||jsonb_build_object('public_config',i.public_config-'secret'-'apiKey'-'token'-'password')),'[]') from public.integration_configs i),'categories',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'code',c.category_code) order by c.name),'[]') from public.categories c where c.status)) into result from public.restaurant_system_settings s where s.id;
 return result;
end;$$;

create or replace function public.save_system_administration(p_payload jsonb,p_expected_revision bigint) returns jsonb language plpgsql security definer set search_path=public as $$
declare current_row public.restaurant_system_settings%rowtype;entry jsonb;station_id uuid;allowed_keys text[]:=array['restaurantInfo','logoPath','taxEnabled','taxName','taxRate','taxMode','serviceChargeEnabled','serviceChargeName','serviceChargeRate','serviceChargeOrderTypes','receiptConfig','timezone','currencyCode','currencySymbol','decimalPlaces','roundingRule','defaultLanguage','enabledLanguages','backupConfig','printers','stations','numbering','integrations'];unknown text;
begin
 if not public.has_pos_permission('settings.manage') then raise exception 'INSUFFICIENT_PERMISSION';end if;
 select * into current_row from public.restaurant_system_settings where id for update;
 if current_row.revision<>p_expected_revision then raise exception 'CONFIGURATION_CHANGED';end if;
 select key into unknown from jsonb_object_keys(p_payload) key where not(key=any(allowed_keys)) limit 1;if unknown is not null then raise exception 'UNKNOWN_CONFIGURATION_FIELD';end if;
 if jsonb_typeof(p_payload->'restaurantInfo')<>'object' or char_length(btrim(p_payload#>>'{restaurantInfo,restaurantName}')) not between 1 and 150 then raise exception 'INVALID_RESTAURANT_INFORMATION';end if;
 if (p_payload->>'taxRate')::numeric not between 0 and 100 or (p_payload->>'serviceChargeRate')::numeric not between 0 and 100 then raise exception 'INVALID_RATE';end if;
 if upper(p_payload->>'taxMode') not in('INCLUSIVE','EXCLUSIVE') then raise exception 'INVALID_TAX_MODE';end if;
 if upper(p_payload->>'currencyCode')!~'^[A-Z]{3}$' then raise exception 'INVALID_CURRENCY';end if;
 if p_payload->>'timezone'!~'^[A-Za-z_]+/[A-Za-z_+-]+$' then raise exception 'INVALID_TIMEZONE';end if;
 if not exists(select 1 from pg_timezone_names where name=p_payload->>'timezone') then raise exception 'INVALID_TIMEZONE';end if;
 if jsonb_typeof(p_payload->'receiptConfig')<>'object' or jsonb_typeof(p_payload->'backupConfig')<>'object' then raise exception 'INVALID_CONFIGURATION';end if;
 if not((p_payload->>'defaultLanguage')=any(array(select jsonb_array_elements_text(p_payload->'enabledLanguages')))) then raise exception 'DEFAULT_LANGUAGE_MUST_BE_ENABLED';end if;
 if coalesce(p_payload->>'logoPath','')<>'' and p_payload->>'logoPath'!~'^branding/logo-[0-9a-f-]{36}\.(png|jpg|webp)$' then raise exception 'INVALID_LOGO_PATH';end if;
 update public.restaurant_system_settings set restaurant_info=p_payload->'restaurantInfo',logo_path=nullif(left(p_payload->>'logoPath',500),''),tax_enabled=(p_payload->>'taxEnabled')::boolean,tax_name=left(btrim(p_payload->>'taxName'),40),tax_rate=(p_payload->>'taxRate')::numeric,tax_mode=upper(p_payload->>'taxMode'),service_charge_enabled=(p_payload->>'serviceChargeEnabled')::boolean,service_charge_name=left(btrim(p_payload->>'serviceChargeName'),40),service_charge_rate=(p_payload->>'serviceChargeRate')::numeric,service_charge_order_types=array(select upper(jsonb_array_elements_text(p_payload->'serviceChargeOrderTypes'))),receipt_config=p_payload->'receiptConfig',timezone=p_payload->>'timezone',currency_code=upper(p_payload->>'currencyCode'),currency_symbol=left(p_payload->>'currencySymbol',8),decimal_places=(p_payload->>'decimalPlaces')::smallint,rounding_rule=p_payload->>'roundingRule',default_language=p_payload->>'defaultLanguage',enabled_languages=array(select jsonb_array_elements_text(p_payload->'enabledLanguages')),backup_config=p_payload->'backupConfig',revision=revision+1,updated_at=now(),updated_by=auth.uid() where id;
 delete from public.kitchen_station_categories;delete from public.kitchen_stations;delete from public.printer_configs;
 for entry in select * from jsonb_array_elements(coalesce(p_payload->'printers','[]')) loop insert into public.printer_configs(id,name,type,connection_type,ip_address,port,paper_width,auto_cut,copies,enabled,updated_by) values(coalesce(nullif(entry->>'id','')::uuid,gen_random_uuid()),left(btrim(entry->>'name'),100),upper(entry->>'type'),upper(entry->>'connectionType'),nullif(entry->>'ipAddress','')::inet,nullif(entry->>'port','')::integer,(entry->>'paperWidth')::smallint,coalesce((entry->>'autoCut')::boolean,false),(entry->>'copies')::smallint,(entry->>'enabled')::boolean,auth.uid());end loop;
 for entry in select * from jsonb_array_elements(coalesce(p_payload->'stations','[]')) loop station_id:=coalesce(nullif(entry->>'id','')::uuid,gen_random_uuid());insert into public.kitchen_stations(id,name,code,station_type,printer_id,kds_device_key,enabled,updated_by) values(station_id,left(btrim(entry->>'name'),100),upper(btrim(entry->>'code')),upper(entry->>'stationType'),nullif(entry->>'printerId','')::uuid,nullif(left(btrim(entry->>'kdsDeviceKey'),100),''),(entry->>'enabled')::boolean,auth.uid());insert into public.kitchen_station_categories(station_id,category_id) select station_id,value::uuid from jsonb_array_elements_text(coalesce(entry->'categoryIds','[]'));end loop;
 for entry in select * from jsonb_array_elements(coalesce(p_payload->'numbering','[]')) loop update public.numbering_settings set prefix=upper(entry->>'prefix'),sequence_padding=(entry->>'sequencePadding')::smallint,date_format=entry->>'dateFormat',reset_frequency=upper(entry->>'resetFrequency'),updated_at=now(),updated_by=auth.uid() where entity_code=upper(entry->>'entityCode');end loop;
 for entry in select * from jsonb_array_elements(coalesce(p_payload->'integrations','[]')) loop if coalesce(entry->'publicConfig','{}') ?| array['secret','apiKey','token','password','privateKey','accessToken','refreshToken'] then raise exception 'SECRET_FIELD_NOT_ALLOWED';end if;update public.integration_configs set provider=nullif(left(btrim(entry->>'provider'),80),''),enabled=(entry->>'enabled')::boolean,status=case when (entry->>'enabled')::boolean and credentials_configured then 'DISCONNECTED' else 'NOT_CONFIGURED'end,public_config=coalesce(entry->'publicConfig','{}'),updated_at=now(),updated_by=auth.uid() where integration_type=upper(entry->>'integrationType');end loop;
 perform public.write_pos_audit('SYSTEM_CONFIGURATION_UPDATED','SETTING',null,null,jsonb_build_object('revisionFrom',current_row.revision,'revisionTo',current_row.revision+1,'environment',current_setting('app.environment',true),'taxChanged',current_row.tax_rate is distinct from (p_payload->>'taxRate')::numeric,'serviceChargeChanged',current_row.service_charge_rate is distinct from (p_payload->>'serviceChargeRate')::numeric,'currencyChanged',current_row.currency_code is distinct from upper(p_payload->>'currencyCode'),'timezoneChanged',current_row.timezone is distinct from p_payload->>'timezone'));
 return public.get_system_administration();
exception when unique_violation then raise exception 'DUPLICATE_CONFIGURATION';when invalid_text_representation then raise exception 'INVALID_CONFIGURATION';end;$$;
revoke all on function public.get_system_administration(),public.save_system_administration(jsonb,bigint) from public,anon;grant execute on function public.get_system_administration(),public.save_system_administration(jsonb,bigint) to authenticated;

create or replace function public.get_pos_display_settings() returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if public.current_pos_role() is null then raise exception 'INSUFFICIENT_PERMISSION';end if;
 return (select jsonb_build_object('restaurantInfo',restaurant_info,'logoPath',logo_path,'receiptConfig',receipt_config,'timezone',timezone,'currencyCode',currency_code,'currencySymbol',currency_symbol,'decimalPlaces',decimal_places,'defaultLanguage',default_language,'enabledLanguages',enabled_languages) from public.restaurant_system_settings where id);
end;$$;
revoke all on function public.get_pos_display_settings() from public,anon;grant execute on function public.get_pos_display_settings() to authenticated;

alter table public.orders add column if not exists tax_name varchar(40) not null default 'SST',add column if not exists tax_rate numeric(7,4) not null default 6,add column if not exists tax_mode varchar(12) not null default 'EXCLUSIVE',add column if not exists service_charge_name varchar(40) not null default 'Service Charge',add column if not exists service_charge_rate numeric(7,4) not null default 10,add column if not exists currency_code char(3) not null default 'MYR',add column if not exists rounding numeric(12,2) not null default 0;
alter table public.payments add column if not exists currency_code char(3) not null default 'MYR';alter table public.receipts add column if not exists currency_code char(3) not null default 'MYR',add column if not exists tax_rate numeric(7,4) not null default 6,add column if not exists service_charge_rate numeric(7,4) not null default 10,add column if not exists rounding numeric(12,2) not null default 0;alter table public.refunds add column if not exists currency_code char(3) not null default 'MYR';

create or replace function public.apply_order_financial_configuration() returns trigger language plpgsql security definer set search_path=public as $$
declare s public.restaurant_system_settings%rowtype;raw_total numeric(12,4);rounded_total numeric(12,2);increment numeric;
begin
 select * into s from public.restaurant_system_settings where id;
 if tg_op='INSERT' then new.tax_name:=s.tax_name;new.tax_rate:=case when s.tax_enabled then s.tax_rate else 0 end;new.tax_mode:=s.tax_mode;new.service_charge_name:=s.service_charge_name;new.service_charge_rate:=case when s.service_charge_enabled and upper(replace(new.dining_mode,'-','_'))=any(s.service_charge_order_types) then s.service_charge_rate else 0 end;new.currency_code:=s.currency_code;end if;
 if tg_op='INSERT' or new.subtotal is distinct from old.subtotal or new.discount is distinct from old.discount or new.dining_mode is distinct from old.dining_mode then
  if new.tax_mode='INCLUSIVE' then new.tax:=round(new.subtotal*new.tax_rate/(100+new.tax_rate),2);else new.tax:=round(new.subtotal*new.tax_rate/100,2);end if;
  new.service_charge:=round(new.subtotal*new.service_charge_rate/100,2);raw_total:=new.subtotal-coalesce(new.discount,0)+case when new.tax_mode='EXCLUSIVE' then new.tax else 0 end+new.service_charge;
  increment:=case s.rounding_rule when '0.05' then .05 when '0.10' then .10 else .01 end;rounded_total:=round(raw_total/increment)*increment;new.rounding:=round(rounded_total-raw_total,2);new.total:=round(rounded_total,2);
 end if;return new;
end;$$;
drop trigger if exists trg_apply_order_financial_configuration on public.orders;create trigger trg_apply_order_financial_configuration before insert or update of subtotal,discount,dining_mode on public.orders for each row execute function public.apply_order_financial_configuration();
create or replace function public.snapshot_transaction_currency() returns trigger language plpgsql security definer set search_path=public as $$ begin select currency_code into new.currency_code from public.orders where id=new.order_id;if tg_table_name='receipts' then select tax_rate,service_charge_rate,rounding into new.tax_rate,new.service_charge_rate,new.rounding from public.orders where id=new.order_id;end if;return new;end;$$;
drop trigger if exists trg_payment_currency on public.payments;create trigger trg_payment_currency before insert on public.payments for each row execute function public.snapshot_transaction_currency();drop trigger if exists trg_receipt_currency on public.receipts;create trigger trg_receipt_currency before insert on public.receipts for each row execute function public.snapshot_transaction_currency();drop trigger if exists trg_refund_currency on public.refunds;create trigger trg_refund_currency before insert on public.refunds for each row execute function public.snapshot_transaction_currency();

create or replace function public.next_pos_business_number(p_prefix text) returns text language plpgsql security definer set search_path=public as $$
declare code text:=upper(btrim(p_prefix));n public.numbering_settings%rowtype;s public.restaurant_system_settings%rowtype;business_date date;period text;next_value bigint;date_part text;branch text;
begin
 if code='KB' then select * into s from public.restaurant_system_settings where id;business_date:=(clock_timestamp() at time zone s.timezone)::date;insert into public.pos_business_number_counters(prefix,business_date,last_value) values('KB',business_date,1) on conflict(prefix,business_date) do update set last_value=public.pos_business_number_counters.last_value+1 returning last_value into next_value;return 'KB-'||to_char(business_date,'YYYYMMDD')||'-'||lpad(next_value::text,6,'0');end if;
 select * into n from public.numbering_settings where entity_code=code;if not found then raise exception 'INVALID_BUSINESS_NUMBER_PREFIX';end if;select * into s from public.restaurant_system_settings where id;business_date:=(clock_timestamp() at time zone s.timezone)::date;branch:=upper(regexp_replace(coalesce(nullif(s.restaurant_info->>'branchCode',''),'MAIN'),'[^A-Z0-9]','','g'));period:=case n.reset_frequency when 'NEVER' then 'ALL' when 'MONTHLY' then to_char(business_date,'YYYYMM') when 'YEARLY' then to_char(business_date,'YYYY') else to_char(business_date,'YYYYMMDD') end;
 insert into public.configurable_number_counters(entity_code,branch_code,period_key,last_value) values(code,branch,period,1) on conflict(entity_code,branch_code,period_key) do update set last_value=public.configurable_number_counters.last_value+1 returning last_value into next_value;if length(next_value::text)>n.sequence_padding then raise exception 'BUSINESS_NUMBER_EXHAUSTED';end if;date_part:=case n.date_format when 'YYMMDD' then to_char(business_date,'YYMMDD') when 'YYYY-MM' then to_char(business_date,'YYYY-MM') else to_char(business_date,'YYYYMMDD') end;return n.prefix||'-'||branch||'-'||date_part||'-'||lpad(next_value::text,n.sequence_padding,'0');
end;$$;
revoke all on function public.next_pos_business_number(text) from public,anon,authenticated;
alter table public.payments alter column payment_number type varchar(64);alter table public.receipts alter column receipt_number type varchar(64);alter table public.refunds alter column refund_number type varchar(64);alter table public.payments drop constraint if exists payments_payment_number_format_check;alter table public.receipts drop constraint if exists receipts_number_format_check;alter table public.refunds drop constraint if exists refunds_number_format_check;

create or replace function public.get_kitchen_item_routes(p_order_id uuid) returns table(order_item_id uuid,station_id uuid,station_code text,station_name text,printer_id uuid,kds_device_key text) language plpgsql stable security definer set search_path=public as $$ begin if not public.can_read_pos_order(p_order_id) then raise exception 'INSUFFICIENT_PERMISSION';end if;return query select oi.id,ks.id,ks.code::text,ks.name::text,ks.printer_id,ks.kds_device_key from public.order_items oi join public.products p on p.id=oi.product_id left join public.kitchen_station_categories ksc on ksc.category_id=p.category_id left join public.kitchen_stations ks on ks.id=ksc.station_id and ks.enabled where oi.order_id=p_order_id;end;$$;revoke all on function public.get_kitchen_item_routes(uuid) from public,anon;grant execute on function public.get_kitchen_item_routes(uuid) to authenticated;

commit;
