# Terminal and staff identity boundaries (local verification, 2026-10-10)

## Current model

- An anonymous Supabase Auth user identifies the physical terminal account. A registered terminal also requires its active device assignment and secret proof on each request.
- `staff` identifies the person. A PIN creates a `terminal_staff_sessions` row bound to the Auth session, terminal, device assignment, company and branch.
- `staff.legacy_profile_id` points to a shadow `profiles` row. In the local database every staff row has this mapping. It remains required for historical foreign keys, actor attribution, roles, and branch assignments. This is a compatibility bridge, not completed Auth-free staff separation.
- `current_terminal_staff_session()` checks active assignment, device proof, branch access, staff access, and PIN lock state. PIN lockout ends active staff sessions.
- The orders, products, tables and payments Edge Functions require a session **with a non-null `id`**. PostgREST serializes an empty composite row as an object whose fields are all null, so truthiness alone is unsafe.

## Legacy profile dependency decision

The local schema has 65 foreign keys to `profiles`, including orders, payments, receipts, kitchen and table activity, shifts, audit records, staff branch assignments, and staff itself. Those references preserve existing financial and audit history. The operational migrations in this change attribute direct orders, kitchen actions, managed order transitions, payment voids, and receipt reprints to the staff session's legacy profile ID, while retaining the terminal Auth user separately. Payment voids and receipt reprints also check the caller's company and branch. These migrations do not rewrite historical records or drop profile foreign keys.

The remaining separation requires a planned data migration: introduce canonical staff IDs beside profile actor columns, backfill and verify every financial and audit relation, move role and branch access to canonical staff IDs, update RPCs and Edge joins, then retire compatibility columns only after old clients and history readers are covered. In particular, `terminal_staff_access_reason()` still checks the shadow profile's ACTIVE status. The shadow profile must stay synchronized with `staff.active` until that migration is complete.

## Local verification boundary

`scripts/test-complete-branch-journey-local.mjs` runs browser terminal activation and cashier PIN sign-in, then order, kitchen, serve, payment, receipt and shift close. It checks denied roles, a foreign company, session end, branch assignment removal, device revocation and replacement, old credential reuse, PIN lockout, and a locally signed expired Auth token across the route patterns exposed by the orders, products, tables and payments Edge Functions. It also checks direct reads of orders, items, menu, tables, payments, receipts and shifts under the same denied identities. `scripts/test-terminal-device-lifecycle-local.sql` tests 16 transactional device scenarios and rolls back. `scripts/test-financial-exception-actor-local.sql` rolls back a manager PIN session's receipt reprint, payment void, and idempotent retry after checking actor attribution. `scripts/test-financial-tenant-boundary-local.mjs` denies a foreign company administrator at five financial RPCs and confirms that the paid order and receipt did not change. These tests are local; they do not establish staging deployment or external payment processor behavior.

The configured POS idle timeout is currently enforced by the frontend lock flow. Backend requests are bound to the Auth token and explicit staff session status, but there is no server-side idle expiry based on `last_activity_at`. Implementing backend idle expiry also requires refreshing server activity timestamps for legitimate operational requests so an active shift is not locked mid-transaction.
