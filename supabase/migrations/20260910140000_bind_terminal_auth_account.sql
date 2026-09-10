begin;

create or replace function public.bind_terminal_auth_account(p_terminal_id uuid, p_auth_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare terminal_row public.pos_terminals; caller public.profiles; prior_auth_user_id uuid;
begin
  select * into caller from public.profiles where id=auth.uid() and status='ACTIVE';
  if not found or caller.role_name <> 'ADMIN' or not public.has_pos_permission('terminal.update') then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;
  select * into terminal_row from public.pos_terminals where id=p_terminal_id for update;
  if not found then raise exception 'TERMINAL_NOT_FOUND'; end if;
  if terminal_row.company_id is distinct from caller.company_id then raise exception 'TERMINAL_SCOPE_DENIED'; end if;
  if terminal_row.status <> 'ACTIVE' or terminal_row.registration_status <> 'REGISTERED' or terminal_row.lock_status = 'LOCKED' then
    raise exception 'TERMINAL_NOT_READY';
  end if;
  if exists (
    select 1 from public.profiles p
    where p.id=p_auth_user_id and p.status='ACTIVE' and p.role_name='ADMIN'
  ) then raise exception 'ADMIN_ACCOUNT_NOT_ALLOWED'; end if;
  if exists (
    select 1 from public.pos_terminals t
    where t.auth_user_id=p_auth_user_id and t.id<>p_terminal_id
  ) then raise exception 'TERMINAL_AUTH_ALREADY_BOUND'; end if;

  prior_auth_user_id:=terminal_row.auth_user_id;
  update public.pos_terminals
  set auth_user_id=p_auth_user_id, authenticated_at=null, updated_at=now()
  where id=terminal_row.id;
  perform public.write_pos_audit(
    'TERMINAL_AUTH_BOUND', 'TERMINAL', terminal_row.id, null,
    jsonb_build_object('terminalCode',terminal_row.terminal_code,'previousAuthUserId',prior_auth_user_id,'authUserId',p_auth_user_id)
  );
  return jsonb_build_object('terminalId',terminal_row.id,'terminalCode',terminal_row.terminal_code,'authUserId',p_auth_user_id);
end;
$$;

revoke all on function public.bind_terminal_auth_account(uuid,uuid) from public, anon;
grant execute on function public.bind_terminal_auth_account(uuid,uuid) to authenticated;

commit;
