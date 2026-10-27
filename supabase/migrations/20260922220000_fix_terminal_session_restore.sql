begin;

do $body$
declare definition text;
begin
  select pg_get_functiondef('public.resolve_authenticated_terminal(text)'::regprocedure) into definition;
  definition := replace(
    definition,
    'where auth_user_id=auth.uid() or (auth_user_id is null and device_identifier=p_device_identifier)',
    'where auth_user_id=auth.uid() or device_identifier=p_device_identifier'
  );
  definition := replace(
    definition,
    'if t.auth_user_id is null then update public.pos_terminals set auth_user_id=auth.uid(),authenticated_at=now(),updated_at=now() where id=t.id returning * into t; end if;',
    'if t.auth_user_id is distinct from auth.uid() then update public.pos_terminals set auth_user_id=auth.uid(),authenticated_at=now(),updated_at=now() where id=t.id returning * into t; end if;'
  );
  execute definition;
end $body$;

commit;
