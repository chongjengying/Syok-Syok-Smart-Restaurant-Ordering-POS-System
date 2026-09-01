insert into public.permissions(code,module,description) values
('voucher.view','voucher','View vouchers and promotions'),('voucher.apply','voucher','Apply vouchers at POS'),('voucher.manage','voucher','Create, edit, enable and disable vouchers') on conflict(code) do nothing;
alter table public.vouchers enable row level security;
create policy voucher_view on public.vouchers for select to authenticated using(public.has_pos_permission('voucher.view'));
create policy voucher_manage on public.vouchers for all to authenticated using(public.has_pos_permission('voucher.manage')) with check(public.has_pos_permission('voucher.manage'));
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where upper(r.name) in ('ADMIN','OWNER','MANAGER') and p.code in ('voucher.view','voucher.manage') on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where upper(r.name) in ('ADMIN','OWNER','MANAGER','CASHIER') and p.code='voucher.apply' on conflict do nothing;
alter table public.voucher_redemptions enable row level security;
alter table public.order_adjustments enable row level security;
create policy voucher_redemption_view on public.voucher_redemptions for select to authenticated using(public.has_pos_permission('voucher.view'));
create policy order_adjustment_view on public.order_adjustments for select to authenticated using(public.has_pos_permission('voucher.view'));
create or replace function public.redeem_voucher(p_voucher_id uuid,p_order_id uuid,p_amount numeric,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public as $$ declare r voucher_redemptions; begin
 if not public.has_pos_permission('voucher.apply') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 select * into r from voucher_redemptions where idempotency_key=p_idempotency_key;
 if found then return to_jsonb(r); end if;
 update vouchers set usage_count=usage_count+1,status=case when usage_limit is not null and usage_count+1>=usage_limit then 'REDEEMED' else status end,updated_at=now() where id=p_voucher_id and status='ACTIVE' and (usage_limit is null or usage_count<usage_limit);
 if not found then raise exception 'Voucher usage limit reached'; end if;
 insert into voucher_redemptions(voucher_id,order_id,staff_id,amount,idempotency_key) values(p_voucher_id,p_order_id,auth.uid(),round(greatest(p_amount,0),2),p_idempotency_key) returning * into r;
 perform public.write_pos_audit_diff('VOUCHER_REDEEMED','VOUCHER',p_voucher_id,null,null,to_jsonb(r)); return to_jsonb(r); end $$;
