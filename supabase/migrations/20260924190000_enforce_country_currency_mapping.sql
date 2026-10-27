begin;

do $$
declare
  definition text;
begin
  select pg_get_functiondef('public.save_company(jsonb)'::regprocedure)
    into definition;
  definition := replace(
    definition,
    'or coalesce(p_payload->>''business_type'',previous.business_type) not in (''RESTAURANT'',''CAFE'',''QUICK_SERVICE'') then',
    'or coalesce(p_payload->>''business_type'',previous.business_type) not in (''RESTAURANT'',''CAFE'',''QUICK_SERVICE'') or coalesce(p_payload->>''country'',previous.country) not in (''Malaysia'',''Singapore'',''Thailand'') then'
  );
  definition := replace(
    definition,
    'currency_code=p_payload->>''currency_code'', timezone=p_payload->>''timezone'',',
    'currency_code=case coalesce(p_payload->>''country'',previous.country) when ''Singapore'' then ''SGD'' when ''Thailand'' then ''THB'' else ''MYR'' end, timezone=p_payload->>''timezone'', '
  );
  execute definition;
end $$;

commit;
