begin;

alter table public.branches add column if not exists created_by uuid references public.profiles(id) on delete set null;
create unique index if not exists branches_company_code_upper_uidx on public.branches(company_id, upper(code));

create or replace function public.assert_branch_operational(p_branch_id uuid, p_company_id uuid)
returns void language plpgsql stable security definer set search_path=public as $$
begin
  if not exists(select 1 from public.branches where id=p_branch_id and company_id=p_company_id and status='ACTIVE') then raise exception 'BRANCH_INACTIVE'; end if;
  if not exists(select 1 from public.companies where id=p_company_id and status='ACTIVE') then raise exception 'COMPANY_INACTIVE'; end if;
end $$;

create or replace function public.save_branch(p_id uuid,p_payload jsonb,p_expected_revision bigint default null)
returns public.branches language plpgsql security definer set search_path=public as $$
declare previous public.branches; result public.branches; company_key uuid; normalized_code text:=upper(btrim(coalesce(p_payload->>'code',''))); requested_status text:=upper(coalesce(nullif(btrim(p_payload->>'status'),''),'ACTIVE')); requested_timezone text:=coalesce(nullif(btrim(p_payload->>'timezone'),''),'Asia/Kuala_Lumpur');
begin
  if p_id is null then
    if not public.has_pos_permission('branch.create') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
    company_key:=public.current_user_company_id();
  else
    if not public.has_pos_permission('branch.update') or not public.can_access_branch(p_id) then raise exception 'INSUFFICIENT_PERMISSION'; end if;
    select * into previous from public.branches where id=p_id for update;
    if not found then raise exception 'BRANCH_NOT_FOUND'; end if;
    if p_expected_revision is distinct from previous.revision then raise exception 'CONFIGURATION_CHANGED'; end if;
    company_key:=previous.company_id;
    if requested_status is distinct from previous.status and not public.has_pos_permission('branch.deactivate') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  end if;
  if company_key is null or company_key is distinct from public.current_user_company_id() then raise exception 'COMPANY_ACCESS_DENIED'; end if;
  if not exists(select 1 from public.companies where id=company_key and status='ACTIVE') then raise exception 'COMPANY_INACTIVE'; end if;
  if nullif(btrim(p_payload->>'name'),'') is null then raise exception 'BRANCH_NAME_REQUIRED'; end if;
  if normalized_code !~ '^[A-Z0-9_-]{2,30}$' then raise exception 'BRANCH_CODE_INVALID'; end if;
  if nullif(btrim(p_payload->>'address'),'') is null then raise exception 'BRANCH_ADDRESS_REQUIRED'; end if;
  if nullif(btrim(p_payload->>'phone'),'') is null then raise exception 'BRANCH_PHONE_REQUIRED'; end if;
  if requested_timezone not in(select name from pg_timezone_names) then raise exception 'INVALID_TIMEZONE'; end if;
  if requested_status not in('ACTIVE','INACTIVE') then raise exception 'INVALID_BRANCH_STATUS'; end if;
  if exists(select 1 from public.branches b where b.company_id=company_key and upper(b.code)=normalized_code and b.id is distinct from p_id) then raise exception 'DUPLICATE_BRANCH_CODE'; end if;
  insert into public.branches(id,company_id,code,name,status,registration_no,phone,email,address,currency_code,timezone,created_by)
  values(coalesce(p_id,gen_random_uuid()),company_key,normalized_code,btrim(p_payload->>'name'),requested_status,nullif(btrim(p_payload->>'registration_no'),''),btrim(p_payload->>'phone'),nullif(btrim(p_payload->>'email'),''),btrim(p_payload->>'address'),nullif(upper(btrim(p_payload->>'currency_code')),''),requested_timezone,case when p_id is null then auth.uid() else previous.created_by end)
  on conflict(id) do update set code=excluded.code,name=excluded.name,status=excluded.status,registration_no=excluded.registration_no,phone=excluded.phone,email=excluded.email,address=excluded.address,currency_code=excluded.currency_code,timezone=excluded.timezone,updated_at=now(),revision=public.branches.revision+1
  returning * into result;
  update public.branches set configuration=coalesce(configuration,'{}'::jsonb)||jsonb_strip_nulls(jsonb_build_object('operating_model',p_payload->>'operating_model','manager_name',p_payload->>'manager_name','address_line_2',p_payload->>'address_line_2','city',p_payload->>'city','state',p_payload->>'state','postcode',p_payload->>'postcode','country',p_payload->>'country','operating_hours',p_payload->>'operating_hours','tax_type',p_payload->>'tax_type','tax_rate',nullif(p_payload->>'tax_rate','')::numeric,'cash_drawer_float',nullif(p_payload->>'cash_drawer_float','')::numeric,'rounding_rule',p_payload->>'rounding_rule')) where id=result.id returning * into result;
  perform public.write_pos_audit_diff(case when p_id is null then 'BRANCH_CREATED' when previous.status is distinct from result.status then 'BRANCH_'||result.status else 'BRANCH_UPDATED' end,'BRANCH',result.id,null,to_jsonb(previous),to_jsonb(result));
  return result;
exception when unique_violation then raise exception 'DUPLICATE_BRANCH_CODE';
end $$;

create or replace function public.require_terminal_staff_session()
returns public.terminal_staff_sessions language plpgsql stable security definer set search_path=public as $$
declare s public.terminal_staff_sessions; t public.pos_terminals;
begin
  s:=public.current_terminal_staff_session();
  if s.id is null then raise exception 'ACTIVE_STAFF_SESSION_REQUIRED'; end if;
  select * into t from public.pos_terminals where id=s.terminal_id;
  if not found or t.status<>'ACTIVE' or t.registration_status<>'REGISTERED' or t.lock_status='LOCKED' then raise exception 'TERMINAL_INACTIVE'; end if;
  perform public.assert_branch_operational(s.branch_id,s.company_id);
  if t.terminal_type not in('STANDARD_POS','POS','MOBILE','KIOSK') then raise exception 'POS_TERMINAL_REQUIRED'; end if;
  return s;
end $$;

do $$
declare definition text;
begin
  select pg_get_functiondef('public.create_terminal_activation_code(uuid,boolean)'::regprocedure) into definition;
  definition:=replace(definition,
    'if not found then raise exception ''TERMINAL_NOT_FOUND''; end if;',
    'if not found then raise exception ''TERMINAL_NOT_FOUND''; end if; perform public.assert_branch_operational(t.branch_id,t.company_id);');
  execute definition;
end $$;

do $$
declare definition text;
begin
  select pg_get_functiondef('public.save_pos_terminal(uuid,uuid,text,text,text,text,text)'::regprocedure) into definition;
  definition:=replace(definition,
    'if not exists(select 1 from public.branches where id=p_branch_id and status=''ACTIVE'') then raise exception ''INVALID_BRANCH''; end if;',
    'if not exists(select 1 from public.branches where id=p_branch_id and status=''ACTIVE'') then raise exception ''BRANCH_INACTIVE''; end if; if not exists(select 1 from public.branches b join public.companies c on c.id=b.company_id and b.id=p_branch_id and c.status=''ACTIVE'') then raise exception ''COMPANY_INACTIVE''; end if;');
  execute definition;
end $$;

commit;
