begin;

alter table public.pos_terminals add column if not exists activated_at timestamptz;
update public.pos_terminals set activated_at=coalesce(activated_at,registered_at) where registration_status='REGISTERED';

do $body$
declare definition text;
begin
  select pg_get_functiondef('public.create_terminal_activation_code(uuid,boolean)'::regprocedure) into definition;
  definition := replace(
    definition,
    $sql$if t.status='ACTIVE' and t.registration_status='REGISTERED' and t.auth_user_id is not null then$sql$,
    $sql$if t.status='ACTIVE' and t.registration_status='REGISTERED' and (t.auth_user_id is not null or t.device_identifier is not null) then$sql$
  );
  execute definition;

  select pg_get_functiondef('public.activate_terminal_with_code(text,text)'::regprocedure) into definition;
  definition := replace(definition, 'registered_at=now(),authenticated_at=null,updated_at=now()', 'registered_at=now(),activated_at=now(),authenticated_at=null,updated_at=now()');
  execute definition;
end $body$;

commit;
