begin;

-- The payment screen calls this security-definer summary. Keep its existing
-- calculation while restricting the requested order to the trusted tenant
-- and branch, as the payment mutation RPCs already do.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.get_pos_payment_summary(uuid)'::regprocedure)
    into definition;
  if strpos(definition,
    $target$select * into ord from public.orders where id=p_order_id;if not found then raise exception 'ORDER_NOT_FOUND';end if;$target$) = 0 then
    raise exception 'PAYMENT_SUMMARY_SCOPE_PATCH_TARGET_MISSING';
  end if;
  execute replace(definition,
    $target$select * into ord from public.orders where id=p_order_id;if not found then raise exception 'ORDER_NOT_FOUND';end if;$target$,
    $target$select * into ord from public.orders where id=p_order_id;if not found or ord.company_id is distinct from public.current_user_company_id() or not public.can_access_branch(ord.branch_id) then raise exception 'ORDER_NOT_FOUND';end if;$target$);
end $$;

commit;
