begin;

do $$
declare
  definition text;
begin
  select pg_get_functiondef('public.save_company(jsonb)'::regprocedure)
    into definition;
  definition := replace(
    definition,
    'coalesce(p_payload->>''business_type'',previous.business_type) not in (''RESTAURANT'',''CAFE'',''QUICK_SERVICE'')',
    'coalesce(p_payload->>''business_type'',previous.business_type) not in (''FOOD_BEVERAGE'',''RETAIL'',''SERVICES'')'
  );
  definition := replace(
    definition,
    'or coalesce(p_payload->>''country'',previous.country) not in (''Malaysia'',''Singapore'',''Thailand'') then',
    'or coalesce(p_payload->>''country'',previous.country) not in (''Malaysia'',''Singapore'',''Thailand'')
     or (coalesce(p_payload->>''country'',previous.country) = ''Malaysia'' and coalesce(p_payload->>''tax_type'',previous.tax_type) not in (''SST_SALES_TAX'',''SST_SERVICE_TAX'',''TAX_EXEMPT''))
     or (coalesce(p_payload->>''country'',previous.country) = ''Singapore'' and coalesce(p_payload->>''tax_type'',previous.tax_type) not in (''GST'',''ZERO_RATED_GST'',''GST_EXEMPT''))
     or (coalesce(p_payload->>''country'',previous.country) = ''Thailand'' and coalesce(p_payload->>''tax_type'',previous.tax_type) not in (''VAT'',''ZERO_RATED_VAT'',''VAT_EXEMPT'')) then'
  );
  definition := replace(
    definition,
    'contact_email=nullif(trim(p_payload->>''contact_email''),''''), website=',
    'contact_email=nullif(trim(p_payload->>''contact_email''),''''), logo_storage_path=nullif(trim(p_payload->>''logo_storage_path''),''''), website='
  );
  execute definition;
end $$;

commit;
