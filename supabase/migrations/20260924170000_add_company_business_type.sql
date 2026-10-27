begin;

alter table public.companies
  add column if not exists business_type text not null default 'RESTAURANT';

alter table public.companies
  drop constraint if exists companies_business_type_check;

alter table public.companies
  add constraint companies_business_type_check
  check (business_type in ('RESTAURANT', 'CAFE', 'QUICK_SERVICE'));

do $$
declare
  definition text;
begin
  select pg_get_functiondef('public.save_company(jsonb)'::regprocedure)
    into definition;

  definition := replace(
    definition,
    'or coalesce(p_payload->>''tax_type'',previous.tax_type) not in (''NONE'',''SST'',''GST'',''VAT'',''SALES_TAX'',''CUSTOM'') then',
    'or coalesce(p_payload->>''tax_type'',previous.tax_type) not in (''NONE'',''SST'',''GST'',''VAT'',''SALES_TAX'',''CUSTOM'')
     or coalesce(p_payload->>''business_type'',previous.business_type) not in (''RESTAURANT'',''CAFE'',''QUICK_SERVICE'') then'
  );
  definition := replace(
    definition,
    'name=trim(p_payload->>''name''), code=p_payload->>''code'',',
    'name=trim(p_payload->>''name''), code=p_payload->>''code'', business_type=coalesce(nullif(trim(p_payload->>''business_type''),''''),previous.business_type),'
  );
  execute definition;
end $$;

commit;
