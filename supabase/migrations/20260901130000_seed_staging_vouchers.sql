-- Ten idempotent staging vouchers for POS validation and admin CRUD testing.
-- Codes are intentionally prefixed DEMO to distinguish seed data from live campaigns.
insert into public.vouchers (
  code, name, description, voucher_type, value, max_discount, min_spend,
  status, starts_at, expires_at, usage_limit, usage_limit_per_customer, stackable,
  order_type
)
values
  ('DEMO-RM5', 'RM5 Off', 'RM5 off orders above RM20', 'FIXED', 5, null, 20, 'ACTIVE', '2026-09-01 00:00:00+08', '2026-12-31 23:59:59+08', 500, 1, false, null),
  ('DEMO-RM10', 'RM10 Off', 'RM10 off orders above RM50', 'FIXED', 10, null, 50, 'ACTIVE', '2026-09-01 00:00:00+08', '2026-12-31 23:59:59+08', 250, 1, false, null),
  ('DEMO-10PCT', '10% Off', 'Ten percent order discount', 'PERCENTAGE', 10, 15, 30, 'ACTIVE', '2026-09-01 00:00:00+08', '2026-12-31 23:59:59+08', 500, 1, false, null),
  ('DEMO-20PCT', '20% Off', 'Twenty percent order discount capped at RM25', 'PERCENTAGE', 20, 25, 80, 'ACTIVE', '2026-09-01 00:00:00+08', '2026-11-30 23:59:59+08', 100, 1, false, null),
  ('DEMO-DINE5', 'Dine-in RM5 Off', 'Dine-in orders only', 'FIXED', 5, null, 25, 'ACTIVE', '2026-09-01 00:00:00+08', '2026-12-31 23:59:59+08', 300, 1, false, 'DINE_IN'),
  ('DEMO-TAKE5', 'Takeaway RM5 Off', 'Takeaway orders only', 'FIXED', 5, null, 25, 'ACTIVE', '2026-09-01 00:00:00+08', '2026-12-31 23:59:59+08', 300, 1, false, 'TAKEAWAY'),
  ('DEMO-WELCOME', 'Welcome Promotion', 'Welcome promo code capped at RM10', 'PROMO_CODE', 10, 10, 30, 'ACTIVE', '2026-09-01 00:00:00+08', '2026-12-31 23:59:59+08', 1000, 1, false, null),
  ('DEMO-FREE-DRINK', 'Free Drink', 'Free drink promotion represented by a RM4 item credit', 'FREE_ITEM', 4, 4, 20, 'ACTIVE', '2026-09-01 00:00:00+08', '2026-12-31 23:59:59+08', 200, 1, false, null),
  ('DEMO-DRAFT', 'Draft Campaign', 'Draft voucher for admin workflow testing', 'FIXED', 3, null, 15, 'DRAFT', '2026-10-01 00:00:00+08', '2026-12-31 23:59:59+08', 100, 1, false, null),
  ('DEMO-DISABLED', 'Disabled Campaign', 'Disabled voucher for validation testing', 'PERCENTAGE', 5, 5, 10, 'DISABLED', '2026-09-01 00:00:00+08', '2026-12-31 23:59:59+08', 100, 1, false, null)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  voucher_type = excluded.voucher_type,
  value = excluded.value,
  max_discount = excluded.max_discount,
  min_spend = excluded.min_spend,
  status = excluded.status,
  starts_at = excluded.starts_at,
  expires_at = excluded.expires_at,
  usage_limit = excluded.usage_limit,
  usage_limit_per_customer = excluded.usage_limit_per_customer,
  stackable = excluded.stackable,
  order_type = excluded.order_type,
  updated_at = now();
