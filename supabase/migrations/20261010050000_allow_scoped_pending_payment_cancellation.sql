begin;

-- The managed order cancellation RPC must retire pending attempts without
-- replacing their original cashier, terminal, or staff-session attribution.
create or replace function public.assign_payment_branch_id()
returns trigger language plpgsql security definer set search_path=public as $$
declare s public.terminal_staff_sessions; order_branch uuid; cfg jsonb;
begin
 if tg_op='UPDATE' and old.status in ('PAID','REFUNDED','VOIDED') then return new; end if;
 if tg_op='UPDATE' and old.status in ('PENDING','PROCESSING') and new.status='CANCELLED'
   and current_setting('app.managed_order_cancel',true)=old.order_id::text
   and public.has_pos_permission('order.cancel')
   and public.has_pos_permission('order.manage')
   and new.order_id is not distinct from old.order_id
   and new.branch_id is not distinct from old.branch_id
   and new.terminal_id is not distinct from old.terminal_id
   and new.staff_session_id is not distinct from old.staff_session_id
   and new.user_id is not distinct from old.user_id
   and exists(select 1 from public.orders o where o.id=old.order_id
     and o.company_id=public.current_user_company_id()
     and o.branch_id=old.branch_id and public.can_access_branch(o.branch_id))
 then return new; end if;
 s:=public.require_terminal_staff_session();
 select branch_id into order_branch from public.orders where id=new.order_id;
 if order_branch is distinct from s.branch_id then raise exception 'ORDER_BRANCH_MISMATCH'; end if;
 new.branch_id:=order_branch;new.terminal_id:=s.terminal_id;new.staff_session_id:=s.id;new.user_id:=s.staff_id;
 cfg:=public.effective_branch_settings(s.branch_id);
 if new.status in ('PAID','SUCCESS') then
  if (not coalesce((cfg#>>'{pos,partialPaymentEnabled}')::boolean,true) or not coalesce((cfg#>>'{payment,partialPaymentAllowed}')::boolean,true)) and new.amount < (select greatest(o.total-coalesce((select sum(p.amount) from public.payments p where p.order_id=o.id and p.status='PAID' and p.id<>new.id),0),0) from public.orders o where o.id=new.order_id) then raise exception 'PARTIAL_PAYMENT_DISABLED'; end if;
  if new.payment_method='CASH' and not coalesce((cfg#>>'{payment,cashEnabled}')::boolean,true) or new.payment_method='CARD' and not coalesce((cfg#>>'{payment,cardEnabled}')::boolean,true) or new.payment_method='QR' and not coalesce((cfg#>>'{payment,qrEnabled}')::boolean,true) then raise exception 'PAYMENT_METHOD_DISABLED'; end if;
  if coalesce((cfg#>>'{payment,referenceRequired}')::boolean,false) and new.payment_method<>'CASH' and nullif(trim(coalesce(new.optional_reference_no,new.transaction_reference,new.reference)), '') is null then raise exception 'PAYMENT_REFERENCE_REQUIRED'; end if;
  if coalesce(new.split_type,'FULL')<>'FULL' and (not coalesce((cfg#>>'{pos,splitPaymentEnabled}')::boolean,true) or not coalesce((cfg#>>'{payment,splitPaymentEnabled}')::boolean,true)) then raise exception 'SPLIT_PAYMENT_DISABLED'; end if;
 end if;
 return new;
end $$;

do $$
declare definition text; revised text;
begin
 select pg_get_functiondef('public.cancel_pos_order(uuid,text,jsonb)'::regprocedure) into definition;
 revised := replace(definition,
   'update public.payments set status=''CANCELLED'',updated_at=now() where order_id=o.id and status in(''PENDING'',''PROCESSING'');',
   'perform set_config(''app.managed_order_cancel'',o.id::text,true); update public.payments set status=''CANCELLED'',updated_at=now() where order_id=o.id and status in(''PENDING'',''PROCESSING'');');
 if revised=definition then raise exception 'ORDER_CANCEL_PENDING_PAYMENT_UPDATE_NOT_FOUND'; end if;
 execute revised;
end $$;

commit;
