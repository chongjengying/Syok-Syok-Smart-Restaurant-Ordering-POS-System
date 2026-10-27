begin;

alter table public.companies
  drop constraint if exists companies_tax_type_check;

update public.companies
set tax_type = case
  when country = 'Singapore' then 'GST'
  when country = 'Thailand' then 'VAT'
  else 'SST_SERVICE_TAX'
end
where tax_type in ('NONE','SST','GST','VAT','SALES_TAX','CUSTOM');

alter table public.companies
  add constraint companies_tax_type_check
  check (tax_type in ('SST_SALES_TAX','SST_SERVICE_TAX','TAX_EXEMPT','VAT','ZERO_RATED_VAT','VAT_EXEMPT','GST','ZERO_RATED_GST','GST_EXEMPT'));

do $$
declare
  definition text;
begin
  select pg_get_functiondef('public.save_company(jsonb)'::regprocedure)
    into definition;
  definition := replace(
    definition,
    'or coalesce(p_payload->>''tax_type'',previous.tax_type) not in (''NONE'',''SST'',''GST'',''VAT'',''SALES_TAX'',''CUSTOM'')',
    'or coalesce(p_payload->>''tax_type'',previous.tax_type) not in (''SST_SALES_TAX'',''SST_SERVICE_TAX'',''TAX_EXEMPT'',''VAT'',''ZERO_RATED_VAT'',''VAT_EXEMPT'',''GST'',''ZERO_RATED_GST'',''GST_EXEMPT'')'
  );
  execute definition;
end $$;

commit;
