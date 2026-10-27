begin;

alter table public.terminal_device_assignments
  add column if not exists device_name text;

alter table public.terminal_device_assignments
  drop constraint if exists terminal_device_assignments_device_name_check;
alter table public.terminal_device_assignments
  add constraint terminal_device_assignments_device_name_check
  check (device_name is null or length(device_name) between 1 and 120);

create or replace function public.activate_terminal_with_code(
  p_code text,
  p_device_identifier text,
  p_device_name text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  result jsonb;
  terminal_id uuid;
  safe_name text;
begin
  result := public.activate_terminal_with_code(p_code, p_device_identifier);
  if coalesce((result->>'ok')::boolean, false) then
    terminal_id := nullif(result->>'terminalId','')::uuid;
    safe_name := nullif(left(btrim(regexp_replace(coalesce(p_device_name,''), '[[:cntrl:]]', '', 'g')),120),'');
    update public.terminal_device_assignments
    set device_name=safe_name
    where terminal_device_assignments.terminal_id=terminal_id
      and device_identifier=p_device_identifier
      and status='ACTIVE';
    result := result || jsonb_build_object('deviceName', safe_name);
  end if;
  return result;
end;
$$;

revoke all on function public.activate_terminal_with_code(text,text,text) from public;
grant execute on function public.activate_terminal_with_code(text,text,text) to anon,authenticated;

drop function if exists public.get_terminal_device_assignment_history(uuid);
create function public.get_terminal_device_assignment_history(p_terminal_id uuid)
returns table(
  assignment_id uuid,
  device_name text,
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
    select a.assignment_id,a.device_name,
      'Device ending ' || right(a.device_identifier,12),
      a.assigned_at,a.activated_at,a.revoked_at,coalesce(p.name,'System'),a.revoke_reason,a.status
    from public.terminal_device_assignments a
    left join public.profiles p on p.id=a.revoked_by
    where a.terminal_id=p_terminal_id
    order by a.assigned_at desc;
end;
$$;

revoke all on function public.get_terminal_device_assignment_history(uuid) from public,anon;
grant execute on function public.get_terminal_device_assignment_history(uuid) to authenticated;

commit;
