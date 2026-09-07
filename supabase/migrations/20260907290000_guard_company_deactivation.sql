begin;

do $$
declare definition text;
begin
  select pg_get_functiondef('public.save_company(jsonb)'::regprocedure) into definition;
  definition:=replace(definition,
    'declare previous public.companies; result public.companies; requested_rate numeric;',
    'declare previous public.companies; result public.companies; requested_rate numeric; requested_status text;');
  definition:=replace(definition,
    'requested_rate:=coalesce((p_payload->>''default_tax_rate'')::numeric,previous.default_tax_rate);',
    'requested_rate:=coalesce((p_payload->>''default_tax_rate'')::numeric,previous.default_tax_rate); requested_status:=coalesce(nullif(upper(trim(p_payload->>''status'')),''''),previous.status);');
  definition:=replace(definition,
    'if nullif(trim(p_payload->>''name''),'''') is null',
    'if requested_status not in (''ACTIVE'',''INACTIVE'') then raise exception ''INVALID_COMPANY_STATUS''; end if; if requested_status=''INACTIVE'' and (exists(select 1 from public.branches where company_id=previous.id and status=''ACTIVE'') or exists(select 1 from public.pos_terminals where company_id=previous.id and status=''ACTIVE'') or exists(select 1 from public.terminal_staff_sessions where branch_id in (select id from public.branches where company_id=previous.id) and status in (''ACTIVE'',''LOCKED'')) or exists(select 1 from public.orders where branch_id in (select id from public.branches where company_id=previous.id) and status not in (''COMPLETED'',''CANCELLED'',''REFUNDED''))) then raise exception ''COMPANY_HAS_ACTIVE_OPERATIONS''; end if; if nullif(trim(p_payload->>''name''),'''') is null');
  definition:=replace(definition, 'name=trim(p_payload->>''name''), code=', 'name=trim(p_payload->>''name''), status=requested_status, code=');
  execute definition;
end $$;

commit;
