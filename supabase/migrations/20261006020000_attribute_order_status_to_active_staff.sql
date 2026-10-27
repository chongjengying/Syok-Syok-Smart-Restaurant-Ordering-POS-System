begin;

-- The device Auth user can differ from the cashier profile. The history
-- foreign key points to profiles, so use the authenticated staff session when
-- a POS operator changes an order status.
create or replace function public.record_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_session public.terminal_staff_sessions;
  v_changed_by uuid;
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    v_staff_session := public.current_terminal_staff_session();
    v_changed_by := coalesce(v_staff_session.staff_id, auth.uid());
    insert into public.order_status_history (
      order_id, previous_status, new_status, changed_by, notes
    ) values (
      new.id,
      case when tg_op = 'INSERT' then null else old.status end,
      new.status,
      v_changed_by,
      nullif(current_setting('app.status_change_notes', true), '')
    );
  end if;
  return new;
end;
$$;

commit;
