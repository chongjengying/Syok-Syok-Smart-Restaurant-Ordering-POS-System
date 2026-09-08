# Security

## Trust boundaries

- Supabase Auth issues browser sessions; the frontend uses `VITE_SUPABASE_URL` and a publishable/anon key.
- RLS, `SECURITY DEFINER` RPCs with controlled `search_path`, constraints, and Edge Functions enforce trusted transitions.
- Edge Functions (`orders`, `payments`, `products`, `tables`, `staff-pin-session`, `admin-users`, `system-health`, `einvoice-submit`, `payment-webhooks`) validate request authentication and/or permission before privileged work.
- Service-role keys are server/test-tooling only. Never expose them in Vite variables, the bundle, Git, Markdown, or public logs.

## Current protections

- Company and branch fields, terminal/session context, role permissions, and staff assignments are checked by database functions and policies.
- PIN validation is server-side; PIN data is not documented or handled as plaintext application data. PIN migrations include strength and failed-attempt/lock logic.
- Payment and split-payment paths use database idempotency/acceptance functions; receipts and refunds are linked to authoritative records.
- Audit migrations attribute company, branch, terminal, actor, staff session, and approver where the context exists. Audit records are intended to be immutable.

## Review status

**PARTIALLY VERIFIED:** static security contracts pass in the repository. Full live RLS attack matrices, terminal-device/Auth separation, provider callbacks, and all Edge Function unauthenticated checks require environment-specific execution.
