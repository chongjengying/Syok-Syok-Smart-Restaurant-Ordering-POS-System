begin;

create or replace function public.save_pos_terminal(
  p_id uuid,
  p_branch_id uuid,
  p_code text,
  p_name text,
  p_status text default 'CREATED',
  p_type text default 'CASHIER',
  p_device_identifier text default null
) returns public.pos_terminals
language plpgsql security definer set search_path=public as $$
declare
  result public.pos_terminals;
  previous public.pos_terminals;
  branch_row public.branches;
  normalized_code text := upper(btrim(coalesce(p_code,'')));
  normalized_name text := btrim(coalesce(p_name,''));
  normalized_status text := upper(btrim(coalesce(p_status,'CREATED')));
  normalized_type text := upper(btrim(coalesce(p_type,'CASHIER')));
begin
  if not public.has_pos_permission(case when p_id is null then 'terminal.create' else 'terminal.update' end) then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;
  if not public.can_access_branch(p_branch_id) then raise exception 'BRANCH_ACCESS_DENIED'; end if;
  select * into branch_row from public.branches where id=p_branch_id for share;
  if not found then raise exception 'BRANCH_NOT_FOUND'; end if;
  if branch_row.company_id is distinct from public.current_user_company_id() then raise exception 'COMPANY_ACCESS_DENIED'; end if;
  if not exists(select 1 from public.companies where id=branch_row.company_id and status='ACTIVE') then raise exception 'COMPANY_INACTIVE'; end if;
  if branch_row.status<>'ACTIVE' then raise exception 'BRANCH_INACTIVE'; end if;
  if normalized_name='' or length(normalized_name)>120 then raise exception 'INVALID_TERMINAL_NAME'; end if;
  if normalized_code !~ '^[A-Z0-9_-]{2,40}$' then raise exception 'INVALID_TERMINAL_CODE'; end if;
  if normalized_type not in ('CASHIER','WAITER','KITCHEN','BAR','SELF_SERVICE','CUSTOMER_DISPLAY') then raise exception 'INVALID_TERMINAL_TYPE'; end if;
  if normalized_status not in ('CREATED','ACTIVE','INACTIVE','ARCHIVED') then raise exception 'INVALID_TERMINAL_STATUS'; end if;

  if p_id is not null then
    select * into previous from public.pos_terminals where id=p_id for update;
    if not found then raise exception 'TERMINAL_NOT_FOUND'; end if;
    if previous.branch_id is distinct from p_branch_id or previous.terminal_code<>normalized_code then
      raise exception 'TERMINAL_IDENTITY_IMMUTABLE';
    end if;
  end if;

  insert into public.pos_terminals(id,company_id,branch_id,terminal_code,name,status,terminal_type,registration_status,device_identifier)
  values(coalesce(p_id,gen_random_uuid()),branch_row.company_id,branch_row.id,normalized_code,normalized_name,normalized_status,normalized_type,'UNREGISTERED',nullif(btrim(p_device_identifier),''))
  on conflict(id) do update set name=excluded.name,status=excluded.status,terminal_type=excluded.terminal_type,updated_at=now()
  returning * into result;
  perform public.write_pos_audit_diff(case when p_id is null then 'TERMINAL_CREATED' else 'TERMINAL_UPDATED' end,'TERMINAL',result.id,null,to_jsonb(previous),to_jsonb(result));
  return result;
exception when unique_violation then
  raise exception 'DUPLICATE_TERMINAL_CODE';
end $$;

revoke all on function public.save_pos_terminal(uuid,uuid,text,text,text,text,text) from public, anon;
grant execute on function public.save_pos_terminal(uuid,uuid,text,text,text,text,text) to authenticated, service_role;

commit;
