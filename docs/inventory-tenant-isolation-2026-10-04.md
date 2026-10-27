# Inventory Tenant Isolation

Overall: PARTIALLY VERIFIED. Local backend and targeted browser checks are VERIFIED PASS; staging and concurrent inventory stress tests are NOT VERIFIED.

## Ownership and Enforcement

Products belong to a company. Stock belongs to a company, branch and product. Branch/product composite foreign keys prevent mixed-company inventory. Movement ownership references the inventory company and ID. Existing branch/product uniqueness is equivalent because branch IDs are globally unique and branch ownership is constrained.

Authenticated tenant and branch scope are resolved server-side. Public inventory RPCs do not accept a company selector. Restrictive RLS also protects direct reads; direct authenticated stock writes are revoked. Unknown/foreign RPC resources return permission errors. PostgREST SELECTs protected by RLS normally return an empty result, not a foreign record.

Immutable movement history, tenant-scoped request keys and request fingerprints protect retries. A private shared writer acquires a request lock and inventory row lock, validates quantities/version, rejects negative stock, and appends movement/audit records in the same transaction. Transfers require both authorized active branches and create paired movement records atomically.

## Connected Flows

- Admin navigation now includes Inventory, gated by inventory.view.
- Branch picker, opening-product picker, list, literal search, low-stock filtering, summary valuation, history and current-page JSON export use authorized data.
- Opening stock cannot be repeated after stock has been established. Company-owned products may be stocked in another authorized branch; the legacy product branch is not treated as company ownership.
- Purchase, waste, manual adjustment and return use the shared writer; unpaired transfer legs and reserved internal request keys are rejected.
- Fully paid orders deduct tracked branch stock once. Unpaid/partially paid orders do not deduct stock. Untracked products retain existing behavior. Insufficient stock rolls back settlement and its financial writes.
- POS menu availability and stock lookup use the authenticated staff session's company/branch and branch product configuration.
- Completed item refunds may be physically returned to the original sale branch with inventory.manage and payment.refund. Returns are capped at refunded item quantities and are retry-safe. Monetary refunds do not automatically restock. The Admin payment history includes a physical-return confirmation form.
- Inventory audit branch/company attribution follows the actual stock record rather than the admin's primary branch. Profile-backed movement actor columns use the current staff profile, not an anonymous terminal Auth UUID.

No existing inventory CSV importer, scheduled reorder/sync worker, Redis cache or external inventory search index was found. None was invented. Export Page exports only the currently loaded authorized page as JSON, not a complete CSV inventory export.

## Bugs Found and Fixed

Missing list/adjust RPC ownership checks; mixed-tenant relationships allowed by independent foreign keys; globally scoped request keys; mutable movement ledger; stale branch/list responses; non-atomic manual transfer legs; missing sale stock deduction; invalid payment retry rejection after completion; missing inventory navigation; opening stock repeat; and terminal Auth identity incorrectly used as an inventory profile foreign key.

## Database

Forward migrations 20261004320000 through 20261004390000 were applied and recorded only in local Supabase (Docker database supabase_db_Pos_Order). Applied migration history was not rewritten. Shared/staging environments were not changed.

## Verification Evidence

All commands below ran against local development on 2026-10-04:

- VERIFIED PASS: npm run test:inventory-tenant-local. Two-company fixtures cover direct RLS reads, IDs, lists/search, histories, reports, foreign branches/products, denied raw writes, request replay/mismatch, stale versions, negative balances, reserved keys, opening validation, atomic transfers, ownership constraints, immutable history and unchanged foreign stock. Fixtures roll back.
- VERIFIED PASS: npm run test:inventory-sale-local. PIN session and stock lookup; separate anonymous terminal Auth inventory actor; real Auth-backed order/payment settlement; no unpaid deduction; payment retry; item refund without auto-restock; explicit return/retry/cap; insufficient-stock payment rollback. Fixtures roll back.
- VERIFIED PASS: node scripts/test-inventory-ui-local.mjs. Real Auth/PostgREST denial checks, inventory navigation/summary and opening-form validation at 1440, 768 and 390 pixels. Screenshots /tmp/pos-inventory-1440.png, /tmp/pos-inventory-768.png, /tmp/pos-inventory-390.png and /tmp/pos-inventory-opening-390.png were captured; phone screenshots inspected. No committed stock mutations. Test Auth accounts are removed and audit-referenced profiles retired, preserving history.
- VERIFIED PASS: npm run test:company-role-local, npm run test:terminal-device-local, npm run test:staff-detail-local, npm run test:shift-management-local.
- VERIFIED PASS: npm run test:integration-contracts, npm run test:security-contracts, npm run lint, npm run build:local, git diff --check. Build retains existing ExcelJS eval and large-chunk warnings. Contract checks are not live authorization tests.

## Remaining Boundaries

- VERIFIED FAIL: a separate anonymous terminal Auth identity cannot create orders through the existing place_order path, which still requires an Auth-backed profile. This is a pre-existing device/person architecture boundary, not a completed separation. The sale test explicitly switches back to the supported Auth-backed identity for order/payment workflows. No claim of fully independent terminal-device authentication is made.
- NOT VERIFIED: concurrent inventory request stress, staging, external payment provider integration, positive authenticated browser transfer/export/history and refund-return submission. Backend positive/negative workflows were exercised by SQL; browser coverage is narrower.
- PARTIALLY VERIFIED: whole-system regression. Targeted adjacent tests passed, but the entire financial/inventory browser suite was not run.
- Physical-return-only restocking is the conservative current behavior pending the product owner's answer to the refund disposition question.

Local app: http://127.0.0.1:5173. Local Supabase Studio: http://127.0.0.1:54323.
