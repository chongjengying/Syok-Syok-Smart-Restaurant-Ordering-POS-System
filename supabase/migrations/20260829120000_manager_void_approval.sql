begin;

create or replace function public.approve_order_void(
  p_order_id uuid,
  p_requested_by uuid,
  p_manager_id uuid,
  p_reason text
)
returns public.orders
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  current_order public.orders%rowtype;
  result public.orders%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then raise exception 'INVALID_VOID_REASON'; end if;
  if not exists (select 1 from public.profiles where id = p_requested_by and status = 'ACTIVE') then raise exception 'REQUESTER_UNAVAILABLE'; end if;
  if not exists (select 1 from public.profiles where id = p_manager_id and status = 'ACTIVE' and role_name in ('ADMIN', 'MANAGER')) then raise exception 'MANAGER_UNAVAILABLE'; end if;

  select * into current_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if current_order.status not in ('DRAFT', 'PLACED', 'CONFIRMED', 'PREPARING', 'READY') then raise exception 'ORDER_CANNOT_BE_VOIDED'; end if;
  perform set_config('app.status_change_notes', left(btrim(p_reason), 500), true);
  update public.orders set status = 'CANCELLED' where id = p_order_id returning * into result;
  update public.order_status_history set changed_by = p_manager_id
   where id = (select id from public.order_status_history where order_id = p_order_id and new_status = 'CANCELLED' order by changed_at desc limit 1);
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, reason, metadata, old_value, new_value)
  values (p_requested_by, 'ORDER_VOIDED', 'ORDER', p_order_id, left(btrim(p_reason), 500),
          jsonb_build_object('approved_by', p_manager_id), to_jsonb(current_order), to_jsonb(result));
  return result;
end;
$$;

revoke all on function public.approve_order_void(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.approve_order_void(uuid, uuid, uuid, text) to service_role;

commit;
