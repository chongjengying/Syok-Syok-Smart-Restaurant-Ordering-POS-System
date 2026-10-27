begin;

alter table public.companies
  drop constraint if exists companies_business_type_check;

update public.companies
set business_type = 'FOOD_BEVERAGE'
where business_type in ('RESTAURANT', 'CAFE', 'QUICK_SERVICE');

alter table public.companies
  alter column business_type set default 'FOOD_BEVERAGE';

alter table public.companies
  add constraint companies_business_type_check
  check (business_type in ('FOOD_BEVERAGE', 'RETAIL', 'SERVICES'));

do $$
declare
  definition text;
begin
  select pg_get_functiondef('public.save_company(jsonb)'::regprocedure)
    into definition;
  definition := replace(
    definition,
    'or coalesce(p_payload->>''business_type'',previous.business_type) not in (''RESTAURANT'',''CAFE'',''QUICK_SERVICE'') then',
    'or coalesce(p_payload->>''business_type'',previous.business_type) not in (''FOOD_BEVERAGE'',''RETAIL'',''SERVICES'') then'
  );
  execute definition;
end $$;

commit;
