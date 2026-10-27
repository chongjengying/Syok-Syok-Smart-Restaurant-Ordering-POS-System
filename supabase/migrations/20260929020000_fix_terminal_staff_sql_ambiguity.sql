begin;

do $$
declare definition text;
begin
  select pg_get_functiondef('public.activate_terminal_with_code(text,text,text)'::regprocedure) into definition;
  definition:=replace(definition,'where terminal_device_assignments.terminal_id=terminal_id','where terminal_device_assignments.terminal_id=(result->>''terminalId'')::uuid');
  execute definition;
end $$;

do $$
declare definition text;
begin
  select pg_get_functiondef('public.admin_update_staff_record(uuid,text,text,uuid,boolean,uuid[])'::regprocedure) into definition;
  definition:=replace(definition,'where staff_id=staff_profile_id and branch_id<>p_branch_id and branch_id not in','where public.staff_branch_assignments.staff_id=staff_profile_id and public.staff_branch_assignments.branch_id<>p_branch_id and public.staff_branch_assignments.branch_id not in');
  execute definition;
end $$;

commit;
