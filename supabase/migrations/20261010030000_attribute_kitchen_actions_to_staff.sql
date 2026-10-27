begin;

-- Kitchen ticket actor columns reference legacy profiles. The terminal Auth
-- account has no profile, so use the active staff session's historical key.
do $$
declare signature text; definition text; revised text;
begin
  foreach signature in array array[
    'public.acknowledge_kitchen_ticket(uuid,uuid)',
    'public.start_kitchen_batch(uuid,uuid)',
    'public.complete_kitchen_ticket(uuid,uuid)',
    'public.recover_kitchen_ticket(uuid,uuid)',
    'public.reprint_kitchen_ticket(uuid,uuid,text)',
    'public.write_kitchen_ticket_event(public.order_item_batches,text,text,jsonb)'
  ] loop
    select pg_get_functiondef(signature::regprocedure) into definition;
    revised := replace(definition, 'auth.uid()',
      'coalesce((public.current_terminal_staff_session()).staff_id,auth.uid())');
    if revised = definition then raise exception 'KITCHEN_ACTOR_CONTEXT_NOT_FOUND: %',signature; end if;
    execute revised;
  end loop;
end $$;

commit;
