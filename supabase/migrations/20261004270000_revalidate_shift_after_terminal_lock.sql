begin;
-- A queued opener must not use staff/device context captured before a revocation committed.
do $$ declare definition text; begin
 select pg_get_functiondef('public.open_cashier_shift(numeric)'::regprocedure) into definition;
 definition:=replace(definition,' perform 1 from public.pos_terminals where id=s.terminal_id for update;',' perform 1 from public.pos_terminals where id=s.terminal_id for update;
 s:=public.require_shift_operational_context();
 if not public.has_pos_permission(''cash.shift.open'') then raise exception ''INSUFFICIENT_PERMISSION''; end if;');
 execute definition;
end $$;
alter table public.terminal_device_assignments alter column credential_hash set not null;
alter table public.terminal_device_assignments add constraint terminal_device_credential_hash_format check(credential_hash ~ '^[a-f0-9]{64}$');
notify pgrst,'reload schema';
commit;
