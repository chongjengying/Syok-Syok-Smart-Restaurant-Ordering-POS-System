create or replace function public.apply_voucher_to_order(p_order_id uuid, p_code text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; message text;
begin
  begin
    result := public.evaluate_order_discounts(p_order_id,p_code);
    return result || jsonb_build_object('ok',true);
  exception when others then
    message := sqlerrm;
    if message in ('VOUCHER_NOT_FOUND','VOUCHER_INACTIVE','VOUCHER_NOT_ACTIVE_YET','VOUCHER_EXPIRED','VOUCHER_MINIMUM_SPEND','VOUCHER_ORDER_TYPE','VOUCHER_USAGE_LIMIT','VOUCHER_STACKING_CONFLICT','VOUCHER_NO_ELIGIBLE_ITEMS','ORDER_NOT_EDITABLE','INSUFFICIENT_PERMISSION') then
      return jsonb_build_object('ok',false,'code',message);
    end if;
    raise;
  end;
end $$;
