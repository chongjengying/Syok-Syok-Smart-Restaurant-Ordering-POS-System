-- Split-bill reads are performed by the authenticated Edge Function client.
-- RLS still limits the rows to active ADMIN, MANAGER, and CASHIER profiles.
grant select on table public.order_bills to authenticated;
grant select on table public.order_bill_items to authenticated;
