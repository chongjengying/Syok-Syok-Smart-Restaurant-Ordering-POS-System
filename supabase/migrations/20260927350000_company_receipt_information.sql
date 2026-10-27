begin;

create or replace function public.validate_company_receipt_configuration()
returns trigger
language plpgsql
set search_path = public
as $$
declare config jsonb := coalesce(new.receipt_configuration, '{}'::jsonb); key text;
begin
  if jsonb_typeof(config) <> 'object' then raise exception 'INVALID_RECEIPT_CONFIGURATION'; end if;
  foreach key in array array['showCompanyName','showRegistrationNumber','showAddress','showPhoneNumber','showTaxDetails'] loop
    if config ? key and jsonb_typeof(config->key) <> 'boolean' then raise exception 'INVALID_RECEIPT_CONFIGURATION'; end if;
  end loop;
  if config ? 'headerGreeting' and (jsonb_typeof(config->'headerGreeting') <> 'string' or length(config->>'headerGreeting') > 160 or config->>'headerGreeting' ~ '[[:cntrl:]]') then raise exception 'INVALID_RECEIPT_HEADER'; end if;
  if config ? 'footerNote' and (jsonb_typeof(config->'footerNote') <> 'string' or length(config->>'footerNote') > 500 or config->>'footerNote' ~ '[[:cntrl:]]' and config->>'footerNote' !~ E'[\n\r\t]') then raise exception 'INVALID_RECEIPT_FOOTER'; end if;
  return new;
end;
$$;

drop trigger if exists companies_receipt_configuration_validation on public.companies;
create trigger companies_receipt_configuration_validation
before insert or update of receipt_configuration on public.companies
for each row execute function public.validate_company_receipt_configuration();

create or replace function public.get_pos_display_settings()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare s jsonb; branch uuid; company jsonb; config jsonb;
begin
  if not public.is_active_pos_user() then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  branch:=coalesce((public.current_terminal_staff_session()).branch_id,(select branch_id from public.profiles where id=auth.uid()));
  s:=public.effective_branch_settings(branch);
  select jsonb_build_object('name',c.name,'registrationNumber',c.registration_no,'addressLine1',c.address_line_1,'addressLine2',c.address_line_2,'city',c.city,'state',c.state,'postcode',c.postcode,'country',c.country,'phone',coalesce(c.phone,c.contact_phone),'taxRegistrationNumber',coalesce(c.tax_registration_no,c.sst_registration_no),'currencyCode',c.currency_code) into company from public.companies c join public.branches b on b.company_id=c.id where b.id=branch;
  select coalesce((select c.receipt_configuration from public.companies c join public.branches b on b.company_id=c.id where b.id=branch), '{}'::jsonb) into config;
  return jsonb_build_object('restaurantInfo',coalesce(company,'{}'::jsonb),'logoPath',s->'logo_path','receiptConfig',(s->'receipt_config') || config,'timezone',s->'timezone','currencyCode',coalesce(company->'currencyCode',s->'currency_code'),'currencySymbol',s->'currency_symbol','decimalPlaces',s->'decimal_places','defaultLanguage',s->'default_language','enabledLanguages',s->'enabled_languages','pos',s->'pos','payment',s->'payment');
end;
$$;

commit;
