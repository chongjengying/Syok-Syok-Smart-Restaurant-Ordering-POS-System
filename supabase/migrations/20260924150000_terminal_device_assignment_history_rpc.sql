begin;

create or replace function public.get_terminal_device_assignment_history(p_terminal_id uuid)
returns table(
  assignment_id uuid,
  device_suffix text,
  assigned_at timestamptz,
  activated_at timestamptz,
  revoked_at timestamptz,
  revoked_by_name text,
  revoke_reason text,
  status text
)
language plpgsql security definer set search_path=public as $$
declare terminal_row public.pos_terminals;
begin
  if not public.has_pos_permission('terminal.view') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into terminal_row from public.pos_terminals where id=p_terminal_id;
  if not found or not public.can_access_branch(terminal_row.branch_id) then raise exception 'TERMINAL_NOT_FOUND'; end if;
  return query
    select a.assignment_id,
      'Device ending ' || right(a.device_identifier,12),
      a.assigned_at,a.activated_at,a.revoked_at,coalesce(p.name,'System'),a.revoke_reason,a.status
    from public.terminal_device_assignments a
    left join public.profiles p on p.id=a.revoked_by
    where a.terminal_id=p_terminal_id
    order by a.assigned_at desc;
end $$;

revoke all on function public.get_terminal_device_assignment_history(uuid) from public, anon;
grant execute on function public.get_terminal_device_assignment_history(uuid) to authenticated;

commit;
