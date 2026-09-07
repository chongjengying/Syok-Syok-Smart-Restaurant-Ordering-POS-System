begin;

alter table public.companies
  add column if not exists tax_enabled boolean not null default true,
  add column if not exists tax_type text not null default 'SST',
  add column if not exists tax_registration_no text,
  add column if not exists sst_registration_no text,
  add column if not exists default_tax_rate numeric(8,4) not null default 0 check(default_tax_rate between 0 and 100),
  add column if not exists address_line_1 text,
  add column if not exists address_line_2 text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists postcode text,
  add column if not exists country text not null default 'Malaysia',
  add column if not exists contact_name text,
  add column if not exists contact_phone text,
  add column if not exists contact_email text,
  add column if not exists logo_url text,
  add column if not exists receipt_configuration jsonb not null default '{}'::jsonb,
  add column if not exists einvoice_configuration jsonb not null default '{}'::jsonb;

alter table public.companies drop constraint if exists companies_tax_type_check;
alter table public.companies add constraint companies_tax_type_check
  check (tax_type in ('NONE','SST','GST','VAT','SALES_TAX','CUSTOM'));
alter table public.companies drop constraint if exists companies_receipt_configuration_object;
alter table public.companies add constraint companies_receipt_configuration_object
  check (jsonb_typeof(receipt_configuration)='object');
alter table public.companies drop constraint if exists companies_einvoice_configuration_object;
alter table public.companies add constraint companies_einvoice_configuration_object
  check (jsonb_typeof(einvoice_configuration)='object');

create or replace function public.save_company(p_payload jsonb)
returns public.companies language plpgsql security definer set search_path=public as $$
declare previous public.companies; result public.companies; requested_rate numeric;
begin
  if not public.has_pos_permission('company.update') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into previous from public.companies where id=(p_payload->>'id')::uuid for update;
  if not found or previous.id<>public.current_user_company_id() then raise exception 'COMPANY_ACCESS_DENIED'; end if;
  requested_rate:=coalesce((p_payload->>'default_tax_rate')::numeric,previous.default_tax_rate);
  if nullif(trim(p_payload->>'name'),'') is null
     or coalesce(p_payload->>'code','') !~ '^[A-Z0-9_-]{2,30}$'
     or coalesce(p_payload->>'currency_code','') !~ '^[A-Z]{3}$'
     or not exists(select 1 from pg_timezone_names where name=p_payload->>'timezone')
     or requested_rate<0 or requested_rate>100
     or coalesce(p_payload->>'tax_type',previous.tax_type) not in ('NONE','SST','GST','VAT','SALES_TAX','CUSTOM') then
    raise exception 'INVALID_COMPANY_INFORMATION';
  end if;
  update public.companies set
    name=trim(p_payload->>'name'), code=p_payload->>'code',
    registration_no=nullif(trim(p_payload->>'registration_no'),''),
    tax_enabled=coalesce((p_payload->>'tax_enabled')::boolean,previous.tax_enabled),
    tax_type=coalesce(nullif(trim(p_payload->>'tax_type'),''),previous.tax_type),
    tax_registration_no=nullif(trim(p_payload->>'tax_registration_no'),''),
    sst_registration_no=nullif(trim(p_payload->>'sst_registration_no'),''),
    default_tax_rate=requested_rate,
    currency_code=p_payload->>'currency_code', timezone=p_payload->>'timezone',
    address_line_1=nullif(trim(p_payload->>'address_line_1'),''),
    address_line_2=nullif(trim(p_payload->>'address_line_2'),''),
    city=nullif(trim(p_payload->>'city'),''), state=nullif(trim(p_payload->>'state'),''),
    postcode=nullif(trim(p_payload->>'postcode'),''), country=coalesce(nullif(trim(p_payload->>'country'),''),previous.country),
    contact_name=nullif(trim(p_payload->>'contact_name'),''), contact_phone=nullif(trim(p_payload->>'contact_phone'),''),
    contact_email=nullif(trim(p_payload->>'contact_email'),''), logo_url=nullif(trim(p_payload->>'logo_url'),''),
    receipt_configuration=case when jsonb_typeof(p_payload->'receipt_configuration')='object' then p_payload->'receipt_configuration' else previous.receipt_configuration end,
    einvoice_configuration=case when jsonb_typeof(p_payload->'einvoice_configuration')='object' then p_payload->'einvoice_configuration' else previous.einvoice_configuration end,
    updated_at=now()
  where id=previous.id returning * into result;
  perform public.write_pos_audit_diff('COMPANY_UPDATED','COMPANY',result.id,null,to_jsonb(previous),to_jsonb(result));
  return result;
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'INVALID_COMPANY_INFORMATION';
end;
$$;

commit;
