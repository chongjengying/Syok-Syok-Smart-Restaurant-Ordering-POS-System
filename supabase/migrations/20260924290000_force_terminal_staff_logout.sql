begin;

create or replace function public.force_terminal_staff_logout(p_terminal_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  terminal_row public.pos_terminals;
  ended_count integer;
begin
  select * into terminal_row
  from public.pos_terminals
  where id = p_terminal_id
  for update;
  if not found then raise exception 'TERMINAL_NOT_FOUND'; end if;
  if not public.can_access_branch(terminal_row.branch_id)
     or not public.has_pos_permission('terminal.update') then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;

  update public.terminal_staff_sessions
  set status = 'ENDED', ended_at = coalesce(ended_at, now()), updated_at = now()
  where terminal_id = terminal_row.id and status in ('ACTIVE','LOCKED');
  get diagnostics ended_count = row_count;

  update public.pos_terminals
  set authenticated_at = null, last_seen_at = now(), updated_at = now()
  where id = terminal_row.id;

  perform public.write_pos_audit(
    'TERMINAL_FORCE_STAFF_LOGOUT', 'TERMINAL', terminal_row.id, null,
    jsonb_build_object('endedSessionCount', ended_count)
  );
  return ended_count;
end;
$$;

revoke all on function public.force_terminal_staff_logout(uuid) from public, anon;
grant execute on function public.force_terminal_staff_logout(uuid) to authenticated;

commit;
