-- Preserve financial history: records referenced by an order are retained.
create or replace function public.delete_voucher_admin(p_voucher_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare is_used boolean;
begin
  if not public.has_pos_permission('voucher.manage') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select exists(select 1 from public.voucher_redemptions where voucher_id=p_voucher_id)
      or exists(select 1 from public.order_adjustments where voucher_id=p_voucher_id)
    into is_used;
  if is_used then
    update public.vouchers set status='DISABLED',updated_at=now() where id=p_voucher_id;
    perform public.write_pos_audit_diff('VOUCHER_DISABLED','VOUCHER',p_voucher_id,null,null,jsonb_build_object('reason','referenced_by_order'));
    return jsonb_build_object('action','DISABLED','message','Voucher is used in order history and was disabled.');
  end if;
  delete from public.vouchers where id=p_voucher_id;
  perform public.write_pos_audit_diff('VOUCHER_DELETED','VOUCHER',p_voucher_id,null,null,'{}'::jsonb);
  return jsonb_build_object('action','DELETED','message','Voucher deleted.');
end $$;

create or replace function public.archive_promotion_admin(p_promotion_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare is_used boolean;
begin
  if not public.has_pos_permission('promotion.manage') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select exists(select 1 from public.order_adjustments where promotion_id=p_promotion_id) into is_used;
  if is_used then
    update public.promotions set status='ARCHIVED',updated_at=now(),updated_by=auth.uid() where id=p_promotion_id;
    perform public.write_pos_audit_diff('PROMOTION_ARCHIVED','PROMOTION',p_promotion_id,null,null,jsonb_build_object('reason','referenced_by_order'));
    return jsonb_build_object('action','ARCHIVED','message','Promotion is used in order history and was archived.');
  end if;
  delete from public.promotion_targets where promotion_id=p_promotion_id;
  delete from public.promotions where id=p_promotion_id;
  perform public.write_pos_audit_diff('PROMOTION_DELETED','PROMOTION',p_promotion_id,null,null,'{}'::jsonb);
  return jsonb_build_object('action','DELETED','message','Promotion deleted.');
end $$;
revoke all on function public.delete_voucher_admin(uuid), public.archive_promotion_admin(uuid) from public, anon;
grant execute on function public.delete_voucher_admin(uuid), public.archive_promotion_admin(uuid) to authenticated;
