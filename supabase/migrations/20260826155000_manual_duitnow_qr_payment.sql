begin;

alter table public.payments
  add column if not exists qr_scheme varchar(30),
  add column if not exists qr_mode varchar(20),
  add column if not exists confirmation_mode varchar(20),
  add column if not exists confirmed_by uuid references public.profiles(id) on delete set null,
  add column if not exists confirmed_at timestamptz,
  add column if not exists initiated_at timestamptz;

insert into public.pos_settings(key,value,description) values
 ('payment.qr.enabled','false'::jsonb,'Enable static DuitNow QR payment'),
 ('payment.qr.scheme','"DUITNOW"'::jsonb,'QR payment scheme'),
 ('payment.qr.mode','"STATIC"'::jsonb,'QR payment mode'),
 ('payment.qr.confirmation_mode','"MANUAL"'::jsonb,'QR payment confirmation mode'),
 ('payment.qr.image_url','""'::jsonb,'Public URL of the restaurant static DuitNow QR image'),
 ('payment.qr.display_name','"Restaurant DuitNow QR"'::jsonb,'Cashier-facing QR display name')
on conflict(key) do nothing;

create or replace function public.get_manual_qr_payment_settings()
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not public.has_pos_permission('payment.view') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  return jsonb_build_object(
    'enabled', coalesce((select (value#>>'{}')::boolean from public.pos_settings where key='payment.qr.enabled'),false),
    'scheme', coalesce((select value#>>'{}' from public.pos_settings where key='payment.qr.scheme'),'DUITNOW'),
    'mode', coalesce((select value#>>'{}' from public.pos_settings where key='payment.qr.mode'),'STATIC'),
    'confirmationMode', coalesce((select value#>>'{}' from public.pos_settings where key='payment.qr.confirmation_mode'),'MANUAL'),
    'imageUrl', coalesce((select value#>>'{}' from public.pos_settings where key='payment.qr.image_url'),''),
    'displayName', coalesce((select value#>>'{}' from public.pos_settings where key='payment.qr.display_name'),'Restaurant DuitNow QR')
  );
end; $$;

create or replace function public.confirm_manual_qr_payment(
  p_order_id uuid,p_final_amount numeric,p_idempotency_key text,p_payment_reference text default null,p_submit_takeaway boolean default false
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; payment_id uuid; normalized_reference text:=left(nullif(btrim(coalesce(p_payment_reference,'')),''),150);
begin
  if public.current_pos_role() not in ('ADMIN','MANAGER','CASHIER') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if p_submit_takeaway then
    result:=public.complete_takeaway_payment_and_submit(p_order_id,'QR',p_final_amount,p_idempotency_key,'DUITNOW_STATIC_MANUAL',normalized_reference,p_final_amount);
  else
    result:=public.complete_payment(p_order_id,'QR',p_final_amount,p_idempotency_key,'DUITNOW_STATIC_MANUAL',normalized_reference,p_final_amount);
  end if;
  payment_id:=(result->'payment'->>'id')::uuid;
  update public.payments set qr_scheme='DUITNOW',qr_mode='STATIC',confirmation_mode='MANUAL',confirmed_by=auth.uid(),confirmed_at=coalesce(confirmed_at,now()),initiated_at=coalesce(initiated_at,created_at) where id=payment_id;
  select jsonb_set(result,'{payment}',to_jsonb(payment),true) into result from public.payments payment where payment.id=payment_id;
  return result;
end; $$;

revoke all on function public.get_manual_qr_payment_settings(),public.confirm_manual_qr_payment(uuid,numeric,text,text,boolean) from public,anon;
grant execute on function public.get_manual_qr_payment_settings(),public.confirm_manual_qr_payment(uuid,numeric,text,text,boolean) to authenticated;
commit;
