-- Separate the implementation from the provider-aware RPC. Default arguments
-- made the former overload ambiguous even with all ten argument types known.
alter function public.process_pos_split_payment(uuid,text,text,numeric,numeric,jsonb,uuid,text,text,text)
  rename to process_pos_split_payment_core;
revoke all on function public.process_pos_split_payment_core(uuid,text,text,numeric,numeric,jsonb,uuid,text,text,text) from public,anon,authenticated;

create or replace function public.process_pos_split_payment(
 p_order_id uuid,p_split_type text,p_payment_method text,p_amount numeric,p_received_amount numeric,p_item_allocations jsonb,p_bill_id uuid,p_idempotency_key text,p_provider text default null,p_transaction_reference text default null,p_provider_id text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare method text:=upper(btrim(coalesce(p_payment_method,'')));provider_key text:=upper(btrim(coalesce(p_provider_id,'')));result jsonb;payment_id uuid;patched public.payments%rowtype;
begin
 if method='E_WALLET' then method:='EWALLET';end if;
 if method in('QR','EWALLET') then
  if provider_key='' then raise exception 'PAYMENT_PROVIDER_REQUIRED';end if;
  perform 1 from public.payment_providers where provider_id=provider_key and enabled=true;
  if not found then raise exception 'PAYMENT_PROVIDER_UNAVAILABLE';end if;
 end if;
 result:=public.process_pos_split_payment_core(p_order_id,p_split_type,method,p_amount,p_received_amount,p_item_allocations,p_bill_id,p_idempotency_key,coalesce(nullif(provider_key,''),p_provider),p_transaction_reference);
 payment_id:=(result->'payment'->>'id')::uuid;
 update public.payments set provider_id=nullif(provider_key,''),confirmed_by=auth.uid(),confirmed_at=coalesce(paid_at,now()),optional_reference_no=left(nullif(btrim(coalesce(p_transaction_reference,'')),''),150) where id=payment_id returning * into patched;
 return jsonb_set(jsonb_set(result,'{payment}',to_jsonb(patched),true),'{summary}',public.get_pos_payment_summary(p_order_id),true);
end;$$;
