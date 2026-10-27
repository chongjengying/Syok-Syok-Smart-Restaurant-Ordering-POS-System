begin;

create or replace function public.reset_pos_device(p_terminal_id uuid)
returns public.pos_terminals
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.pos_terminals;
  previous jsonb;
begin
  select * into t
  from public.pos_terminals
  where id = p_terminal_id
  for update;
  if not found then raise exception 'TERMINAL_NOT_FOUND'; end if;
  if not public.can_access_branch(t.branch_id)
     or not public.has_pos_permission('terminal.deactivate') then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;
  if t.status in ('RETIRED','ARCHIVED') then raise exception 'TERMINAL_RETIRED'; end if;

  previous := to_jsonb(t) - 'device_identifier';
  update public.terminal_staff_sessions
  set status = 'ENDED', ended_at = coalesce(ended_at, now()), updated_at = now()
  where terminal_id = t.id and status in ('ACTIVE','LOCKED');

  update public.terminal_activation_codes
  set used_at = coalesce(used_at, now()), display_code = null
  where terminal_id = t.id and used_at is null;

  update public.pos_terminals
  set registration_status = 'UNREGISTERED',
      status = 'CREATED',
      device_identifier = null,
      auth_user_id = null,
      authenticated_at = null,
      registered_at = null,
      lock_status = 'UNLOCKED',
      updated_at = now()
  where id = t.id
  returning * into t;

  perform public.write_pos_audit_diff(
    'TERMINAL_DEVICE_RESET', 'TERMINAL', t.id, null,
    previous, to_jsonb(t) - 'device_identifier'
  );
  return t;
end;
$$;

revoke all on function public.reset_pos_device(uuid) from public, anon;
grant execute on function public.reset_pos_device(uuid) to authenticated;

commit;
