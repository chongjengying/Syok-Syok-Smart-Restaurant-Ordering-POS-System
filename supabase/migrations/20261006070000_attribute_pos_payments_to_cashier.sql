begin;

-- Preserve the existing transactional payment and idempotency implementations.
-- Only replace device Auth attribution with the active cashier profile, which
-- is the identity referenced by payment and confirmation records.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.complete_payment(uuid,text,numeric,text,text,text)'::regprocedure)
    into definition;
  if strpos(definition, 'caller_id uuid := auth.uid();') = 0 then
    raise exception 'PAYMENT_ACTOR_PATCH_TARGET_MISSING';
  end if;
  execute replace(definition, 'caller_id uuid := auth.uid();',
    'caller_id uuid := coalesce((public.current_terminal_staff_session()).staff_id, auth.uid());');

  select pg_get_functiondef('public.complete_pos_payment(uuid,text,numeric,text,text,text,numeric)'::regprocedure)
    into definition;
  if strpos(definition, 'confirmed_by=auth.uid()') = 0 then
    raise exception 'PAYMENT_CONFIRMATION_PATCH_TARGET_MISSING';
  end if;
  execute replace(definition, 'confirmed_by=auth.uid()',
    'confirmed_by=coalesce((public.current_terminal_staff_session()).staff_id,auth.uid())');

  select pg_get_functiondef('public.process_pos_split_payment_core(uuid,text,text,numeric,numeric,jsonb,uuid,text,text,text)'::regprocedure)
    into definition;
  if strpos(definition, 'caller_id uuid := auth.uid();') = 0
    or strpos(definition, $role$if coalesce(caller_role, '') not in ('ADMIN', 'MANAGER', 'CASHIER') then$role$) = 0 then
    raise exception 'SPLIT_PAYMENT_ACTOR_PATCH_TARGET_MISSING';
  end if;
  definition := replace(definition, 'caller_id uuid := auth.uid();',
    'caller_id uuid := coalesce((public.current_terminal_staff_session()).staff_id, auth.uid());');
  definition := replace(definition,
    $role$if coalesce(caller_role, '') not in ('ADMIN', 'MANAGER', 'CASHIER') then$role$,
    $role$if coalesce(caller_role, '') not in ('ADMIN', 'MANAGER', 'CASHIER') or not public.has_pos_permission('payment.create') then$role$);
  execute definition;

  select pg_get_functiondef('public.process_pos_split_payment(uuid,text,text,numeric,numeric,jsonb,uuid,text,text,text,text)'::regprocedure)
    into definition;
  if strpos(definition, 'confirmed_by=auth.uid()') = 0 then
    raise exception 'SPLIT_PAYMENT_CONFIRMATION_PATCH_TARGET_MISSING';
  end if;
  execute replace(definition, 'confirmed_by=auth.uid()',
    'confirmed_by=coalesce((public.current_terminal_staff_session()).staff_id,auth.uid())');
end $$;

commit;
