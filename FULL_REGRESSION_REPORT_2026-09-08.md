# POS Full Regression Report

## Remediation Update — 2026-09-08

The four reported staging blockers have been fixed and deployed through migration `20260908110000`.

| Original blocker | Current status | Retest evidence |
|---|---|---|
| Draft creation returned `DRAFT_CREATION_FAILED` | 🔧 FIXED + RETESTED | Trusted draft creation, concurrent stale edits, duplicate creation and table claims pass in staging |
| Invalid payment, discount, numbering, kitchen and administration SQL | 🔧 FIXED + RETESTED | Linked `supabase db lint --level error` returns zero findings; dependent live paths pass |
| Realtime order event absent | 🔧 FIXED + RETESTED | Correct staging anon key delivers waiter, kitchen and cashier events; reconnect recovery passes |
| Financial chain blocked upstream | 🔧 FIXED + RETESTED | Payment race, single receipt, idempotent refund, audit, RM300 drawer reconciliation and zero-variance shift close pass |

The remediation run also found and fixed two dependent defects: the legacy add-on RPC did not satisfy the current order-item financial snapshot constraints, and cash refunds were omitted from cashier-shift movements. The live performance suite passes with 500 products, 101 active orders, ten users, Realtime delivery, and daily/product report queries. The original overall UAT decision below remains historical evidence from the pre-fix run; a new full browser regression still requires authenticated E2E credentials and a browser-accessible staging frontend URL.

## 1. Executive Summary

| Field | Result |
|---|---|
| Environment | Staging frontend build against staging Supabase |
| Branch | `agent/catalog-supabase` |
| Commit | `813ff6f61a2e9c882777516682ac35d9c66e1694` |
| Regression date | 2026-09-08 (Asia/Kuala_Lumpur) |
| Supabase project | Eat-Syok-Syok - Staging (`tlknhjkbapqshykfrlbs`) |
| Database | `db.tlknhjkbapqshykfrlbs.supabase.co`, PostgreSQL 17.6.1.155 |
| Frontend | Local Vite staging build; no deployed staging URL verified |
| Build | PASS (`vite build --mode staging`) |
| Migration state | PASS: local and remote match through `20260907500000` |
| Total test areas | 48 |
| Passed | 2 |
| Failed | 7 |
| Partial | 14 |
| Blocked | 25 |
| Fixed during regression | 1 test-harness regression; retested through fixture setup |
| P0 | 2 unresolved defect groups |
| P1 | 2 unresolved defect groups |
| P2 | 2 unresolved |
| P3 | 0 |
| Production ready | NO |

The build and 12 contract/unit suites passed. The live staging regression did not complete. Draft order creation failed, the performance suite did not receive its Realtime event, and linked-database lint found invalid SQL in financial and operational RPCs. Local database flows were unavailable because Docker/Podman is not installed. Five of six browser tests were skipped because staging admin credentials were not supplied.

## 2. Environment and Evidence

- `.env.staging` explicitly selects `VITE_APP_ENV=staging` and `https://tlknhjkbapqshykfrlbs.supabase.co`.
- The linked project is healthy and all nine listed Edge Functions are active. JWT verification is disabled at the gateway for `orders`, `payments`, `admin-users`, and `payment-webhooks`; application-level authentication was not fully exercised in this run.
- Clean `npm ci` succeeded and corrected the pre-existing installed-tree mismatch. `npm audit --omit=dev` reports two moderate findings through `exceljs -> uuid` (GHSA-w5hq-g745-h8pq).
- Staging build and `oxlint src` passed. The build warns about direct `eval` in ExcelJS and a 1.06 MB ExcelJS chunk.
- Contract/unit passes: login, integration, security, cash shifts, split money, checkout draft recovery, trusted start-order, branch menu/pricing snapshots, system health, and system administration (12 executed commands/suites).
- Playwright: 1 passed (login accessibility/localization), 5 skipped due to absent `POS_E2E_ADMIN_EMAIL`/`POS_E2E_ADMIN_PASSWORD`.
- Local Supabase integration: blocked because neither Docker nor Podman is available.

## 3. Regression Matrix

| # | Area | Status | Evidence / limitation |
|---:|---|---|---|
| 01 | Environment | ✅ PASS | Staging URL, project, branch, commit and build mode pinned |
| 02 | Build | ⚠️ PARTIAL | Build/lint/install pass; moderate dependency advisory and bundle warnings |
| 03 | Database | ❌ FAIL | Linked DB lint reports seven invalid operational/financial functions |
| 04 | Company | ⚠️ PARTIAL | Tenant contracts pass; live cross-company scenario not executed |
| 05 | Branch | ⚠️ PARTIAL | Branch scope/numbering contracts pass; live numbering RPC lint fails |
| 06 | Terminal | 🚫 BLOCKED | Local suite unavailable; authenticated browser suite skipped |
| 07 | Staff | ⚠️ PARTIAL | Login/staff contracts pass; complete live role matrix not run |
| 08 | Authentication | ⚠️ PARTIAL | Login contracts and public login UI pass; authenticated browser flows skipped |
| 09 | Permission | ⚠️ PARTIAL | Security/RBAC/RLS contracts pass; live restricted-action matrix not completed |
| 10 | Shift | ⚠️ PARTIAL | Cash-shift contracts pass; live open/close flow not completed |
| 11 | Product | ⚠️ PARTIAL | Branch pricing/sold-out/snapshot contracts pass; live product suite interrupted |
| 12 | Table | 🚫 BLOCKED | Concurrency suite stopped after order draft failure |
| 13 | Dine-In | 🚫 BLOCKED | No complete live transaction |
| 14 | Takeaway | 🚫 BLOCKED | No complete live transaction |
| 15 | Order Modification | ❌ FAIL | Live draft creation returned `DRAFT_CREATION_FAILED` before stale-edit race |
| 16 | Promotion | ❌ FAIL | `evaluate_order_discounts` and manual-discount functions fail DB lint |
| 17 | Voucher | ⚠️ PARTIAL | Static contracts/migrations present; full live redemption path not run |
| 18 | Kitchen | ❌ FAIL | `get_kitchen_item_routes` references missing `kitchen_stations.enabled` |
| 19 | Kitchen Additional Batch | 🚫 BLOCKED | Upstream draft/order failure |
| 20 | Cancel Item | 🚫 BLOCKED | Complete live state matrix not run |
| 21 | Cancel Order | 🚫 BLOCKED | Complete live state matrix not run |
| 22 | Reopen | ⚠️ PARTIAL | Checkout draft recovery contract passes; paid-order live path not run |
| 23 | Cash Payment | ❌ FAIL | `begin_pos_payment_attempt` contains invalid `upper(text, unknown)` call |
| 24 | Non-Cash Payment | 🚫 BLOCKED | Live provider/method flow not completed |
| 25 | Split Payment | ⚠️ PARTIAL | Money/contracts pass; live split transaction not completed |
| 26 | Double Payment | 🚫 BLOCKED | Concurrency suite stopped before payment race |
| 27 | Payment Network Failure | 🚫 BLOCKED | Retry/reconciliation scenario not executed |
| 28 | Receipt | 🚫 BLOCKED | No complete live payment/receipt flow |
| 29 | Refund | 🚫 BLOCKED | No complete live refund flow |
| 30 | Table Completion | 🚫 BLOCKED | No complete live dine-in payment flow |
| 31 | Shift Close | 🚫 BLOCKED | No complete live shift |
| 32 | Cash Reconciliation | ⚠️ PARTIAL | Shift calculation contracts pass; source-data reconciliation not run |
| 33 | Reporting | 🚫 BLOCKED | No controlled live transaction set to reconcile |
| 34 | Audit | ⚠️ PARTIAL | Audit contracts pass; full sensitive-action audit trail not produced |
| 35 | Refresh | 🚫 BLOCKED | Authenticated browser tests skipped |
| 36 | Multi-Tab | 🚫 BLOCKED | Not automated by available suite |
| 37 | Realtime | ❌ FAIL | Performance suite timed out waiting for the order event |
| 38 | Offline | 🚫 BLOCKED | Authenticated offline browser test skipped |
| 39 | Security | ⚠️ PARTIAL | Contracts pass; full direct live role/tenant attack matrix not run |
| 40 | Historical Data | 🚫 BLOCKED | No controlled historical mutation scenario executed |
| 41 | Timezone | 🚫 BLOCKED | Midnight boundary scenario not executed |
| 42 | Money Precision | ✅ PASS | Split-money tests pass |
| 43 | Rapid Click | 🚫 BLOCKED | Server race suite stopped upstream |
| 44 | Error Recovery | 🚫 BLOCKED | Full dependency failure matrix not executed |
| 45 | Real Scenario | 🚫 BLOCKED | Upstream order failure |
| 46 | Complex Scenario | 🚫 BLOCKED | Upstream order/payment failures |
| 47 | Concurrency | ❌ FAIL | Staging suite cannot create the draft needed for races |
| 48 | Final Reconciliation | 🚫 BLOCKED | No completed controlled transaction population |

## 4. Regression Defects

### REG-001 — Staging concurrency fixture lost tenant context

- Priority: P2
- Module: Regression harness
- Expected: Controlled categories/products are created inside the MAIN branch tenant.
- Actual: Category insert failed with `COMPANY_CONTEXT_REQUIRED`.
- Root cause: The scripts created catalog fixtures before loading the branch and omitted `company_id`/`branch_id`.
- Affected files: `scripts/smoke-concurrency-staging.mjs`, `scripts/performance-staging.mjs`
- Fix: Load MAIN branch first and propagate its company/branch IDs to category and product rows.
- Retest: FIXED + RETESTED; both suites passed catalog fixture creation and advanced to later checks.

### REG-002 — Trusted draft creation fails in staging

- Priority: P0
- Module: Order/draft/concurrency
- Scenario: Authenticated, branch-bound waiter creates a takeaway draft.
- Expected: One draft with version zero.
- Actual: Orders Edge Function returns HTTP 400, `DRAFT_CREATION_FAILED`.
- Business impact: New-order and concurrent-edit flows cannot be certified and may be unavailable.
- Fix: Not fixed in this run; requires Edge Function/RPC diagnostic with server error detail.
- Status: OPEN, release blocker.

### REG-003 — Financial and operational RPCs fail linked DB lint

- Priority: P0
- Module: Payment, numbering, promotions, kitchen, administration
- Actual: Invalid references/signatures in `begin_pos_payment_attempt`, `next_branch_order_number`, `evaluate_order_discounts`, `apply_manual_order_discount`, `approve_manual_order_discount`, `get_kitchen_item_routes`, and `save_system_administration`.
- Financial impact: Payment acceptance, discounts and numbering cannot be trusted until executed and repaired.
- Fix: Not changed because each function needs a dedicated migration and dependent-flow retest.
- Status: OPEN, release blocker.

### REG-004 — Realtime order event absent

- Priority: P1
- Module: Realtime/reliability
- Expected: Inserted order event arrives within the suite timeout.
- Actual: `assert.ok(eventAt)` failed after no event was observed.
- Business impact: Other POS/KDS clients may miss order updates.
- Status: OPEN, release blocker.

### REG-005 — Full executable coverage unavailable

- Priority: P1
- Module: Test infrastructure
- Actual: Local DB suites require Docker/Podman; five authenticated browser tests require credentials; no deployed frontend URL was established.
- Impact: Offline, refresh, multi-tab, real-world, reporting and final reconciliation remain unproven.
- Status: OPEN, UAT blocker.

## 5. Release Decision

Blockers in priority order:

1. P0 staging draft creation failure prevents complete order and concurrency flows.
2. P0 invalid payment, discount and numbering RPC bodies reported by the linked database.
3. P1 missing Realtime event blocks POS/KDS synchronization confidence.
4. P1 no complete live payment, receipt, refund, shift, reporting and reconciliation evidence.
5. P1 browser and local database suites are blocked by missing credentials and container runtime.

❌ NOT READY FOR UAT
