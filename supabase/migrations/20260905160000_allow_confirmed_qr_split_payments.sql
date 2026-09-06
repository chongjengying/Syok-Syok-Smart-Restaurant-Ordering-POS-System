-- Capture manual confirmation before constraints and receipt snapshots run.
create or replace function public.assign_manual_payment_confirmation()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_provider text;
begin
  if new.status <> 'PAID' or new.payment_method not in ('QR','EWALLET') then return new; end if;
  if TG_OP = 'UPDATE' then
    if old.status = 'PAID' then return new; end if;
  end if;
  if auth.uid() is null or coalesce(public.current_pos_role(),'') not in ('ADMIN','MANAGER','CASHIER') then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;
  v_provider := coalesce(nullif(new.provider_id,''),
    case when new.provider='DUITNOW_STATIC_MANUAL' then 'DUITNOW_QR' else upper(btrim(new.provider)) end);
  perform 1 from public.payment_providers where provider_id=v_provider and enabled for share;
  if not found then raise exception 'PAYMENT_PROVIDER_UNAVAILABLE'; end if;
  new.provider_id := v_provider;
  new.confirmed_by := auth.uid();
  new.confirmed_at := coalesce(new.paid_at,now());
  new.confirmation_mode := 'MANUAL';
  new.optional_reference_no := left(nullif(btrim(new.transaction_reference),''),150);
  return new;
end; $$;
revoke all on function public.assign_manual_payment_confirmation() from public,anon,authenticated;
create trigger trg_assign_manual_payment_confirmation
before insert or update on public.payments
for each row execute function public.assign_manual_payment_confirmation();

alter table public.payments drop constraint payments_paid_method_supported_check;
alter table public.payments add constraint payments_paid_method_supported_check
check (status <> 'PAID' or payment_method='CASH' or (
  payment_method in ('QR','EWALLET') and provider_id is not null
  and confirmed_by is not null and confirmed_at is not null
  and confirmation_mode is not null and confirmation_mode='MANUAL'
)) not valid;
