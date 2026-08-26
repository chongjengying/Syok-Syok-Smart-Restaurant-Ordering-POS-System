insert into public.pos_settings(key,value,description) values
 ('payment.qr.merchant_name','"Restaurant"','DuitNow merchant name'),
 ('payment.qr.settlement_bank','""','Settlement bank'),
 ('payment.qr.reference_required','false','Require cashier payment reference')
on conflict(key) do nothing;
create or replace function public.update_manual_qr_payment_settings(p_enabled boolean,p_image_url text,p_display_name text default 'Restaurant DuitNow QR',p_merchant_name text default 'Restaurant',p_settlement_bank text default '',p_reference_required boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$ declare result jsonb; begin
 if not public.has_pos_permission('settings.manage') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 if p_image_url is null or length(p_image_url)>2000 then raise exception 'QR_IMAGE_URL_INVALID'; end if;
 insert into public.pos_settings(key,value) values
 ('payment.qr.enabled',to_jsonb(coalesce(p_enabled,false))),('payment.qr.image_url',to_jsonb(coalesce(p_image_url,''))),('payment.qr.display_name',to_jsonb(coalesce(nullif(trim(p_display_name),''),'Restaurant DuitNow QR'))),('payment.qr.merchant_name',to_jsonb(coalesce(nullif(trim(p_merchant_name),''),'Restaurant'))),('payment.qr.settlement_bank',to_jsonb(coalesce(p_settlement_bank,''))),('payment.qr.reference_required',to_jsonb(coalesce(p_reference_required,false)))
 on conflict(key) do update set value=excluded.value,updated_at=now(),updated_by=auth.uid();
 perform public.write_pos_audit('QR_SETTINGS_UPDATED','SETTING',null,null,jsonb_build_object('enabled',p_enabled,'merchant_name',p_merchant_name,'settlement_bank',p_settlement_bank,'reference_required',p_reference_required));
 select public.get_manual_qr_payment_settings() into result; return result; end; $$;
revoke all on function public.update_manual_qr_payment_settings(boolean,text,text,text,text,boolean) from public,anon;
grant execute on function public.update_manual_qr_payment_settings(boolean,text,text,text,text,boolean) to authenticated;
