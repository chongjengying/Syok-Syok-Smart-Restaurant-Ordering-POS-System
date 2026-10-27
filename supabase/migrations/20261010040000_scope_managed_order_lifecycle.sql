begin;

create or replace function public.guard_order_branch_mutation()
returns trigger language plpgsql security definer set search_path=public as $$
declare s public.terminal_staff_sessions; managed_change boolean;
begin
  if auth.uid() is null then return new; end if;
  if new.branch_id is distinct from old.branch_id or new.terminal_id is distinct from old.terminal_id
    or new.staff_session_id is distinct from old.staff_session_id or new.user_id is distinct from old.user_id
  then raise exception 'ORDER_CONTEXT_IMMUTABLE'; end if;
  managed_change := (
    (new.status='CANCELLED' and old.status is distinct from 'CANCELLED'
      and public.has_pos_permission('order.manage'))
    or (old.status='COMPLETED' and new.status='SERVED'
      and public.has_pos_permission('order.reopen'))
  ) and old.company_id is not distinct from public.current_user_company_id()
    and public.can_access_branch(old.branch_id);
  if managed_change then return new; end if;
  s := public.require_terminal_staff_session();
  if old.branch_id is distinct from s.branch_id then raise exception 'ORDER_BRANCH_MISMATCH'; end if;
  return new;
end $$;

do $$
declare signature text; definition text; revised text;
begin
  foreach signature in array array[
    'public.cancel_pos_order(uuid,text,jsonb)',
    'public.reopen_pos_order(uuid,text,jsonb)'
  ] loop
    select pg_get_functiondef(signature::regprocedure) into definition;
    revised := replace(definition,
      'if not found then raise exception ''ORDER_NOT_FOUND'';end if;',
      'if not found or o.company_id is distinct from public.current_user_company_id() or not public.can_access_branch(o.branch_id) then raise exception ''ORDER_NOT_FOUND'';end if;');
    if revised = definition then raise exception 'ORDER_LIFECYCLE_TENANT_GUARD_NOT_FOUND: %',signature; end if;
    execute revised;
  end loop;
end $$;

commit;
