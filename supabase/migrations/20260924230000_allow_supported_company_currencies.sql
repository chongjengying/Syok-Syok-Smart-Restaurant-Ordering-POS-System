begin;

do $$
declare
  definition text;
begin
  select pg_get_functiondef('public.save_company(jsonb)'::regprocedure)
    into definition;
  definition := replace(
    definition,
    'currency_code=case coalesce(p_payload->>''country'',previous.country) when ''Singapore'' then ''SGD'' when ''Thailand'' then ''THB'' else ''MYR'' end, timezone=',
    'currency_code=coalesce(nullif(trim(p_payload->>''currency_code''),''''),previous.currency_code), timezone='
  );
  execute definition;
end $$;

commit;
