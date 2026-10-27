begin;

-- Table activity references profiles. Attribute POS actions to the operator
-- from the authenticated staff session, while retaining the admin Auth actor
-- for direct administrative actions without a staff session.
create or replace function public.log_table_activity(
  p_table_id uuid,
  p_order_id uuid,
  p_action text,
  p_from_status text,
  p_to_status text,
  p_operation_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_session public.terminal_staff_sessions;
begin
  v_staff_session := public.current_terminal_staff_session();
  insert into public.table_activity_logs (
    restaurant_table_id, order_id, action, from_status, to_status,
    performed_by, operation_key, metadata
  ) values (
    p_table_id, p_order_id, p_action, p_from_status, p_to_status,
    coalesce(v_staff_session.staff_id, auth.uid()),
    nullif(left(btrim(coalesce(p_operation_key, '')), 128), ''),
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (performed_by, action, operation_key)
    where operation_key is not null
  do nothing;
end;
$$;

commit;
