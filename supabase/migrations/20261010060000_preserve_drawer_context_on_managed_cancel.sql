begin;

create or replace function public.assign_payment_cashier_shift()
returns trigger language plpgsql security definer set search_path=public as $$
declare s public.terminal_staff_sessions; sh public.cashier_shifts;
begin
 if tg_op='UPDATE' and old.status in ('PAID','REFUNDED','VOIDED') then
   new.cashier_shift_id:=old.cashier_shift_id; new.branch_id:=old.branch_id; new.terminal_id:=old.terminal_id; new.staff_session_id:=old.staff_session_id; new.user_id:=old.user_id;
   return new;
 end if;
 if tg_op='UPDATE' and old.status in ('PENDING','PROCESSING') and new.status='CANCELLED'
   and current_setting('app.managed_order_cancel',true)=old.order_id::text
   and public.has_pos_permission('order.cancel') and public.has_pos_permission('order.manage')
   and new.order_id is not distinct from old.order_id
   and new.cashier_shift_id is not distinct from old.cashier_shift_id
   and new.branch_id is not distinct from old.branch_id
   and new.terminal_id is not distinct from old.terminal_id
   and new.staff_session_id is not distinct from old.staff_session_id
   and new.user_id is not distinct from old.user_id
   and exists(select 1 from public.orders o where o.id=old.order_id
     and o.company_id=public.current_user_company_id()
     and o.branch_id=old.branch_id and public.can_access_branch(o.branch_id))
 then return new; end if;
 s:=public.require_shift_operational_context();
 if tg_op='UPDATE' then
   select * into sh from public.cashier_shifts where id=old.cashier_shift_id and status='OPEN' for share;
 else
   select * into sh from public.cashier_shifts where terminal_id=s.terminal_id and branch_id=s.branch_id and company_id=s.company_id and status='OPEN' for share;
 end if;
 if sh.id is null or sh.terminal_id<>s.terminal_id or sh.branch_id<>s.branch_id or sh.company_id<>s.company_id then raise exception 'ACTIVE_CASHIER_SHIFT_REQUIRED'; end if;
 new.cashier_shift_id:=sh.id;
 return new;
end $$;

commit;
