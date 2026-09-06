-- RLS policies only run after the authenticated role has table privileges.
grant select, insert, update, delete on public.vouchers to authenticated;
grant select, insert, update, delete on public.promotions to authenticated;
grant select, insert, update, delete on public.promotion_targets to authenticated;
grant select on public.order_adjustments, public.voucher_redemptions to authenticated;
-- Existing e-Invoice RLS remains the authority for these Admin reads.
grant select on public.company_einvoice_profiles, public.einvoice_documents to authenticated;
