begin;
do $$ declare definition text; begin
 select pg_get_functiondef('public.attribute_pos_audit()'::regprocedure) into definition;
 definition:=replace(definition,'  return new;', '  if new.entity_type=''STAFF_SESSION'' then
    select ss.id,ss.staff_id,ss.company_id,ss.branch_id,ss.terminal_id into new.staff_session_id,new.actor_staff_id,new.company_id,new.branch_id,new.terminal_id from public.terminal_staff_sessions ss where ss.id=new.entity_id;
    new.metadata:=new.metadata||jsonb_build_object(''deviceAssignmentId'',(select device_assignment_id from public.terminal_staff_sessions where id=new.entity_id));
  elsif new.entity_type=''TERMINAL'' then
    select pt.id,pt.company_id,pt.branch_id into new.terminal_id,new.company_id,new.branch_id from public.pos_terminals pt where pt.id=new.entity_id;
  end if;
  return new;');
 execute definition;
end $$;
notify pgrst,'reload schema';
commit;
