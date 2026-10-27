begin;

-- Preserve explicit configuration. Only repair the old generic default.
update public.pos_terminals
set allowed_roles=case terminal_type
  when 'CASHIER' then array['ADMIN','MANAGER','CASHIER']::text[]
  when 'WAITER' then array['ADMIN','MANAGER','WAITER']::text[]
  when 'KITCHEN' then array['ADMIN','MANAGER','KITCHEN']::text[]
  else allowed_roles
end
where access_mode='ROLE_RESTRICTED'
  and allowed_roles=array['ADMIN','MANAGER','WAITER']::text[];

do $$
declare definition text;
begin
  select pg_get_functiondef('public.save_pos_terminal(uuid,uuid,text,text,text,text,text)'::regprocedure)
    into definition;
  definition := replace(
    definition,
    'insert into public.pos_terminals(id,company_id,branch_id,terminal_code,name,status,terminal_type,registration_status,device_identifier)
  values(coalesce(p_id,gen_random_uuid()),branch_row.company_id,branch_row.id,normalized_code,normalized_name,normalized_status,normalized_type,''UNREGISTERED'',nullif(btrim(p_device_identifier),''''))',
    'insert into public.pos_terminals(id,company_id,branch_id,terminal_code,name,status,terminal_type,registration_status,device_identifier,access_mode,allowed_roles)
  values(coalesce(p_id,gen_random_uuid()),branch_row.company_id,branch_row.id,normalized_code,normalized_name,normalized_status,normalized_type,''UNREGISTERED'',nullif(btrim(p_device_identifier),''''),''ROLE_RESTRICTED'',case normalized_type when ''CASHIER'' then array[''ADMIN'',''MANAGER'',''CASHIER'']::text[] when ''WAITER'' then array[''ADMIN'',''MANAGER'',''WAITER'']::text[] when ''KITCHEN'' then array[''ADMIN'',''MANAGER'',''KITCHEN'']::text[] else array[''ADMIN'',''MANAGER'']::text[] end)'
  );
  execute definition;
end $$;

commit;
