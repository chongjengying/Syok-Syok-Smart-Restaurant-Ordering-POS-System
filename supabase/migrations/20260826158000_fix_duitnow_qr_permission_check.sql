create or replace function public.update_manual_qr_payment_settings(
  p_enabled boolean, p_image_url text, p_display_name text default 'Restaurant DuitNow QR'
) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  if not public.has_pos_permission('settings.manage') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if p_image_url is null or length(p_image_url) > 2000 then raise exception 'QR_IMAGE_URL_INVALID'; end if;
  insert into public.pos_settings(key,value,description) values
    ('payment.qr.enabled',to_jsonb(coalesce(p_enabled,false)),'Enable manual DuitNow QR'),
    ('payment.qr.image_url',to_jsonb(coalesce(p_image_url,'')),'Static DuitNow QR image URL'),
    ('payment.qr.display_name',to_jsonb(coalesce(nullif(trim(p_display_name),''),'Restaurant DuitNow QR')),'QR display name')
  on conflict (key) do update set value=excluded.value,updated_at=now();
  select public.get_manual_qr_payment_settings() into result; return result;
end; $$;
