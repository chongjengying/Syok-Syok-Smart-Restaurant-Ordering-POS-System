begin;
create or replace function public.resolve_registered_terminal(p_device_identifier text) returns jsonb
language sql security definer set search_path=public as $$ select public.resolve_authenticated_terminal(p_device_identifier); $$;
create or replace function public.heartbeat_pos_terminal(p_terminal_id uuid,p_device_identifier text) returns boolean
language plpgsql security definer set search_path=public as $$
begin
 if public.terminal_device_access_reason(p_terminal_id) is not null then return false; end if;
 update public.pos_terminals set last_seen_at=now() where id=p_terminal_id and auth_user_id=auth.uid() and device_identifier=p_device_identifier;
 return found;
end $$;
revoke all on function public.can_use_terminal(uuid,uuid),public.list_terminal_branch_staff(text) from public,anon,authenticated;
do $$ declare definition text; begin
 select pg_get_functiondef('public.bind_terminal_auth_account(uuid,uuid)'::regprocedure) into definition;
 definition:=replace(definition,'  prior_auth_user_id:=terminal_row.auth_user_id;','  if exists(select 1 from public.cashier_shifts where terminal_id=terminal_row.id and status=''OPEN'') then raise exception ''ACTIVE_SHIFT_DEVICE_CHANGE_BLOCKED''; end if;
  update public.terminal_staff_sessions set status=''ENDED'',ended_at=coalesce(ended_at,now()),updated_at=now() where terminal_id=terminal_row.id and status in (''ACTIVE'',''LOCKED'');
  prior_auth_user_id:=terminal_row.auth_user_id;');
 execute definition;
 select pg_get_functiondef('public.activate_terminal_with_code(text,text,text)'::regprocedure) into definition;
 definition:=replace(definition,'  return result||','  perform public.write_pos_audit(''TERMINAL_DEVICE_ACTIVATED'',''TERMINAL'',bound_terminal_id,null,jsonb_build_object(''deviceAssignmentId'',(select assignment_id from public.terminal_device_assignments where terminal_id=bound_terminal_id and status=''ACTIVE''),''deviceName'',safe_name));
  return result||');
 execute definition;
end $$;
notify pgrst,'reload schema';
commit;
