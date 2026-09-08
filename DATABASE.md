# Database

`supabase/migrations/` is the schema source of truth. Major entities include companies, branches, terminals, profiles, roles, permissions, staff assignments/PIN/session records, orders/items/batches, payments/receipts/refunds, shifts/cash movements, promotions/vouchers, and audit logs.

Operational writes use database RPCs and Edge Functions. RLS, constraints, triggers, and functions are defined by migrations. Many privileged functions declare `SECURITY DEFINER` and `search_path=public`.

`20260908120000_reset_staging_legacy_identities.sql` is an authorized Staging-only destructive reset, not a production procedure.
