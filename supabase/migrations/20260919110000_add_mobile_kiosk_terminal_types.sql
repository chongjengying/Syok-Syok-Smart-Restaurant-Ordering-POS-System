begin;

do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid='public.pos_terminals'::regclass
      and pg_get_constraintdef(oid) like '%terminal_type%'
  loop
    execute format('alter table public.pos_terminals drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.pos_terminals
  add constraint pos_terminals_terminal_type_check
  check (terminal_type in ('POS','KDS','CASHIER','WAITER','SELF_ORDER','KITCHEN','ADMIN','MOBILE','KIOSK'));

create or replace function public.save_pos_terminal(
  p_id uuid, p_branch_id uuid, p_code text, p_name text,
  p_status text default 'ACTIVE', p_type text default 'POS', p_device_identifier text default null
) returns public.pos_terminals
language plpgsql security definer set search_path=public as $$
declare result public.pos_terminals; previous public.pos_terminals;
begin
  if not public.has_pos_permission('settings.manage') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if nullif(trim(p_name),'') is null or upper(trim(p_code)) !~ '^[A-Z0-9_-]{2,40}$'
     or upper(trim(p_type)) not in ('POS','KDS','CASHIER','WAITER','SELF_ORDER','KITCHEN','ADMIN','MOBILE','KIOSK') then
    raise exception 'INVALID_TERMINAL';
  end if;
  if not exists(select 1 from public.branches where id=p_branch_id and status='ACTIVE') then raise exception 'INVALID_BRANCH'; end if;
  if p_id is not null then select * into previous from public.pos_terminals where id=p_id for update; end if;
  insert into public.pos_terminals(id,company_id,branch_id,terminal_code,name,status,terminal_type,registration_status)
  select coalesce(p_id,gen_random_uuid()),b.company_id,b.id,upper(trim(p_code)),trim(p_name),upper(coalesce(p_status,'ACTIVE')),upper(trim(p_type)),'UNREGISTERED'
  from public.branches b where b.id=p_branch_id
  on conflict(id) do update set branch_id=excluded.branch_id,terminal_code=excluded.terminal_code,name=excluded.name,status=excluded.status,terminal_type=excluded.terminal_type,updated_at=now()
  returning * into result;
  perform public.write_pos_audit_diff(case when previous.id is null then 'TERMINAL_CREATED' else 'TERMINAL_UPDATED' end,'TERMINAL',result.id,null,to_jsonb(previous),to_jsonb(result));
  return result;
end $$;

create or replace function public.require_terminal_staff_session()
returns public.terminal_staff_sessions language plpgsql stable security definer set search_path=public as $$
declare s public.terminal_staff_sessions;
begin
  s:=public.current_terminal_staff_session();
  if s.id is null then raise exception 'ACTIVE_STAFF_SESSION_REQUIRED'; end if;
  if (select terminal_type from public.pos_terminals where id=s.terminal_id) not in ('POS','MOBILE','KIOSK') then raise exception 'POS_TERMINAL_REQUIRED'; end if;
  return s;
end $$;

commit;
