begin;

-- Completion is called by the item fulfillment trigger. The device Auth
-- identity is not a profile; profile FKs must use the active serving person.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.finalize_pos_order_completion(uuid)'::regprocedure)
    into definition;
  if strpos(definition, 'event public.order_completion_events%rowtype;') = 0
    or strpos(definition, 'coalesce(auth.uid(),ord.created_by_staff_id)') = 0
    or strpos(definition, 'coalesce(session.terminal_id,ord.terminal_id)') = 0
    or strpos(definition, ',ord.staff_session_id,prior_order,') = 0 then
    raise exception 'FULFILLMENT_ACTOR_PATCH_TARGET_MISSING';
  end if;
  definition := replace(definition, 'event public.order_completion_events%rowtype;',
    'event public.order_completion_events%rowtype; actor_session public.terminal_staff_sessions; actor_staff_id uuid;');
  definition := replace(definition,
    'select * into session from public.terminal_staff_sessions where id=ord.staff_session_id;',
    'select * into session from public.terminal_staff_sessions where id=ord.staff_session_id;
     actor_session := public.current_terminal_staff_session();
     actor_staff_id := coalesce(actor_session.staff_id, auth.uid(), ord.created_by_staff_id);');
  definition := replace(definition, 'coalesce(auth.uid(),ord.created_by_staff_id)', 'actor_staff_id');
  definition := replace(definition, 'coalesce(session.terminal_id,ord.terminal_id)',
    'coalesce(actor_session.terminal_id,session.terminal_id,ord.terminal_id)');
  definition := replace(definition, ',ord.staff_session_id,prior_order,',
    ',coalesce(actor_session.id,ord.staff_session_id),prior_order,');
  execute definition;
end $$;

commit;
