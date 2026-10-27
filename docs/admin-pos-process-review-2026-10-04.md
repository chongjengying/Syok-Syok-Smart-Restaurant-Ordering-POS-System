# Admin And POS Process Review

Date: 2026-10-04. Target: local development, Docker database `supabase_db_Pos_Order`, Supabase API `127.0.0.1:54321`. Reviewed the current dirty worktree, not only the last Git commit. No application code or migrations were changed for this review. The added diagnostic script uses a transaction ending in ROLLBACK.

## A. Overall Architecture Verdict

**INCORRECT / HIGH RISK for production multi-company deployment.**

The conceptual company/branch/terminal/staff-session/shift/transaction hierarchy is sound. Terminal branch dependencies, credential proof, device lifecycle, and register-shift controls have substantial backend enforcement. However, confirmed tenant isolation failures and shared authorization/configuration undermine the system as a whole. Working individual screens and passing terminal tests do not establish production safety.

Overall verification: **PARTIALLY VERIFIED**. The specific failures reproduced below are **VERIFIED FAIL**. This is not a complete authenticated browser, payment-provider, or concurrency certification.

The current implementation uses Auth-backed profiles linked to staff records, registered terminals, Staff PIN credentials, and terminal staff sessions. It does not fully implement independent terminal-device Auth and Auth-free staff records. An opaque device credential supplements a Supabase Auth identity; it is not a separate device-only Auth system.

## B. Recommended Complete Flow

Platform-controlled company provisioning / administrator invitation
-> Company configuration
-> Active Branch
-> Company-scoped Roles and Permissions
-> Active Staff + Branch Access + Hashed PIN
-> Terminal under Branch
-> All Branch Staff / Selected Staff policy
-> Temporary single-use Activation Code
-> Device activation and binding + revocable credential
-> Validate Company / Branch / Terminal / Device
-> Staff Employee ID + PIN validation and access checks
-> Staff Session
-> Reuse valid open register Shift or open Shift with opening cash
-> Order + Items + Modifiers
-> Server-calculated Discounts / Tax / Service Charge
-> Idempotent Payment collection
-> Fully settled Sale / immutable financial snapshot
-> Receipt
-> Optional Refund / Void according to transaction stage
-> Cash reconciliation and Close Shift
-> End Staff Session, retaining Device binding

Reports and append-only Audit Logs are parallel outputs throughout this flow, not final steps that run only after sign-out. Inventory movements occur at the defined sale/return stage. Staff authentication sessions and register shifts are different entities; staff handover must not silently change shift ownership.

## C. Issues Found

### CRITICAL C1: Self-profile updates can change tenant context

- **Issue:** An authenticated Company A ADMIN updated their own `profiles.company_id` to Company B and immediately obtained Company B branch access.
- **Why wrong:** `staff_update_own_profile` checks only identity and a non-null POS role. `guard_profile_privilege_fields` does not protect `company_id`; `profile_company_default` fills missing values but does not reject a different company or inconsistent primary branch. The guard also uses `current_setting(..., true) <> 'allowed'`, which evaluates to NULL when the setting is absent, skipping rejection for otherwise protected fields.
- **Risk:** Cross-company access and modification through normal tenant-scoped APIs after changing the identity's tenant source. The diagnostic also changed the protected role fields without an administrative write marker. A cashier-to-admin escalation under a live terminal session was not reproduced; do not treat that specific path as verified.
- **Correct behavior:** Tenant and privilege identity fields must be immutable to self-service requests. Company context must come from trusted provisioning and explicitly scoped administrator actions.
- **Modules affected:** Profiles, RLS, company context, branch access, every tenant-scoped API, staff administration.
- **Recommended fix:** Restrict self-update columns to safe presentation fields; use null-safe privilege guards; protect company/default-branch and all authorization fields; validate company/branch consistency; narrowly scope audited administrative writes. Add direct authenticated API and SQL regression cases.
- **Evidence:** `supabase/migrations/20260826140000_admin_rbac_and_priority_one.sql:122`; live `pg_policies`, `guard_profile_privilege_fields`, and `profile_company_default`. Diagnostic returned company reassignment `true` and other-company `can_access_branch = true`.
- **Verification:** **VERIFIED FAIL**, local rollback diagnostic.

### CRITICAL C2: Inventory reads are not tenant-scoped

- **Issue:** Company A ADMIN read a Company B `inventory_items` row directly as role `authenticated`.
- **Why wrong:** Both inventory SELECT policies require only `inventory.view`. Neither table has a restrictive company/branch policy. Filtering `list_inventory` or the UI cannot protect direct table access.
- **Risk:** Cross-company stock disclosure; inventory movement history has the same policy defect, although a foreign movement fixture was not separately queried.
- **Correct behavior:** Permission AND authorized company/branch scope must apply to every access path.
- **Modules affected:** Inventory, products, movement history, stock reports, Supabase table API.
- **Recommended fix:** Add restrictive branch/company RLS to items and movements, deriving movement scope through the inventory item. Test A/B tenant reads through both SQL authenticated role and PostgREST.
- **Evidence:** `supabase/migrations/20260828100000_production_operations_hardening.sql:56`; local diagnostic foreign inventory count `1`, expected `0`.
- **Verification:** **VERIFIED FAIL** for items; **PARTIALLY VERIFIED** for the matching movement-policy defect.

### CRITICAL C3: Branchless promotions bypass tenant isolation

- **Issue:** Company A ADMIN read a branchless promotion whose `company_id` belongs to Company B.
- **Why wrong:** The restrictive policy permits `branch_id IS NULL` without requiring the owning company. The analogous voucher policy has the same form. `assign_discount_company_context` preserves an explicitly supplied company when no branch is supplied; it is not an authorization check.
- **Risk:** Cross-company promotion disclosure. Broader modification/creation exposure must be tested before release; the diagnostic established read access, not every write path.
- **Correct behavior:** A company-wide promotion is global within its owning company, never global across companies.
- **Modules affected:** Promotions, vouchers, discounts, admin management, POS pricing.
- **Recommended fix:** Require company equality for all rows, plus branch access when branch-specific. Enforce trusted company derivation on writes and tenant-consistent product/category targets.
- **Evidence:** `supabase/migrations/20260907120000_operational_rule_enforcement.sql:16`; diagnostic foreign branchless promotion count `1`, expected `0`.
- **Verification:** **VERIFIED FAIL** for promotion reads; **PARTIALLY VERIFIED** for voucher and write exposure.

### CRITICAL C4: Manager-approved order void is not scoped to the requester

- **Issue:** The Edge approval path validates a manager PIN, then invokes a service-role RPC with an arbitrary supplied order ID. The live `approve_order_void` checks that requester and manager profiles are active, but does not check their company/branch against the order, requester terminal/staff session, or requester permission. It also lacks an explicit payment-state check.
- **Why wrong:** Service-role execution bypasses ordinary RLS. Manager PIN verification does not authorize an unrelated order. Stage checks alone do not establish that an order is unpaid.
- **Risk:** Cross-tenant cancellation if a foreign order ID is obtained, incorrect operator attribution, and unsafe cancellation paths for paid in-progress orders. Other triggers may reject particular financial states; that is not a substitute for scoped approval validation.
- **Correct behavior:** Preserve the authenticated staff requester, validate live device/session context, requester access to this order, active same-company branch-authorized approver, specific permission, permitted order/payment stage, and an idempotent audited transition.
- **Modules affected:** Orders Edge Function, manager PIN approval, voids, payments, order history, audit.
- **Recommended fix:** Introduce a single scoped approval transaction that derives requester from the validated terminal staff session. Use current staff PIN credentials and permission codes instead of legacy profile-role assumptions. Re-test foreign order IDs, active/locked sessions, paid orders and approval replay.
- **Evidence:** `supabase/functions/orders/index.ts:327` and current live `approve_order_void(uuid,uuid,uuid,text)` retrieved with `pg_get_functiondef`. The manual-discount approval has branch checks; do not generalize this void defect to every approval RPC.
- **Verification:** **PARTIALLY VERIFIED**; source and live function definition inspected, authenticated cross-company approval exploit not executed.

### HIGH H1: Role permissions are shared between companies

- **Issue:** `roles` and `role_permissions` have no tenant key. A company administrator can replace permissions for the shared CASHIER role.
- **Why wrong:** The RPC checks `role.edit` but does not distinguish platform templates from company-owned roles. Every staff member referencing that role ID consumes the same permission set.
- **Risk:** One company can grant or revoke operational permissions for other companies. Global role deactivation also requires a tenant ownership review.
- **Correct behavior:** Company-specific role configuration, with optional immutable platform role templates.
- **Modules affected:** Roles, permissions, all staff authorization, admin role editor.
- **Recommended fix:** Add company-owned roles/overrides and migrate references forward without weakening guards. Make platform-wide changes a separate privileged operation. Test two companies using the same role name.
- **Evidence:** `supabase/migrations/20260930000000_fix_admin_system_settings_permission.sql:40`; local diagnostic invoked the RPC as `authenticated` and changed the global CASHIER permission set to `user.edit`, then rolled back.
- **Verification:** **VERIFIED FAIL** for tenant-admin modification of a global role; another-company login consuming that changed role was not separately exercised.

### HIGH H2: Company settings are stored as global operational configuration

- **Issue:** `restaurant_system_settings` is a singleton keyed by boolean `id`; numbering, printers, kitchen stations and integration configuration include shared structures without company ownership. The current system-administration read still returns the global settings and equipment collections.
- **Why wrong:** Company-admin authorization is not platform-admin authorization. Global tax/currency/equipment settings conflict with the company/branch hierarchy. The original save implementation deletes/recreates printer/station collections; later wrappers and all resulting references require careful migration planning.
- **Risk:** Cross-company configuration exposure and interference, inconsistent company versus POS tax/currency/receipt behavior, disrupted kitchen/printer routing.
- **Correct behavior:** Company-scoped defaults, branch/terminal equipment overrides, explicit server precedence, and immutable transaction configuration snapshots.
- **Modules affected:** Company setup, System Administration, tax, receipt branding, numbering, kitchen, devices, integrations.
- **Recommended fix:** Inventory current consumers first; separate platform settings from tenant settings and migrate without deleting equipment/history. Scope all SECURITY DEFINER reads/writes and related foreign keys.
- **Evidence:** `supabase/migrations/20260827110000_system_administration.sql:10`; live table columns and current `get_system_administration()` inspected.
- **Verification:** **PARTIALLY VERIFIED**; structural/read-path defect inspected, two-company save regression not executed.

### HIGH H3: Refunds lack payment-tender allocation

- **Issue:** `refund_pos_order` totals all successful payments but associates the whole refund with the most recent payment. Cash movement creation decides whether the entire refund is cash using that one payment's method.
- **Why wrong:** A mixed CASH/QR sale cannot accurately describe a full or partial refund with a single arbitrarily selected original tender.
- **Risk:** A cash-first/QR-last sale can produce no cash-refund movement; the reverse can classify the entire refund as cash. Expected drawer cash and tender reports can be wrong even while order-level refund limits pass.
- **Correct behavior:** Record an explicit refund payout method and allocation against original payment balances. Only actual cash paid out reduces the operating shift drawer.
- **Modules affected:** Refunds, payments, cash movements, shift reconciliation, refund receipts, reports.
- **Recommended fix:** Define business payout rules, add refund-payment allocation records, validate per-payment cumulative refund limits, and commit allocation/ledger/audit atomically. Test mixed tenders in both payment orders, partial refunds, cross-shift refunds and replay.
- **Evidence:** `supabase/migrations/20260929110000_partial_refund_and_refund_receipts.sql:112`; current live `refund_pos_order` and `record_cash_refund_movement` retain these behaviors.
- **Verification:** **PARTIALLY VERIFIED**; mixed-tender refund reproduced only by tracing current SQL, not a live mixed-tender fixture.

### HIGH H4: Sales reports do not share one settlement/refund definition

- **Issue:** Admin product/category reports include non-cancelled orders without a successful payment requirement. The POS paid-product report selects an entire order once any PAID payment exists, even when the order is partially paid. Its product net calculation subtracts discounts but not refund allocations.
- **Why wrong:** Draft/unpaid order demand, collected payments and completed sales are different measures. These queries present them as sales without one shared accounting definition.
- **Risk:** Unpaid/partially settled orders inflate product sales; partial/full refunds can produce inconsistent totals between sales, products, payments and shifts. Payment-grain daily rows repeat order-level tax/subtotal: exports must not sum those repeated fields as if they were independent sales. Existing frontend daily-summary fallback deduplicates order IDs, so duplicate summaries are not assumed everywhere.
- **Correct behavior:** Explicit order, payment, sale and refund grains; completed-sale recognition versus collections clearly named; refund allocations reconciled to original items/tax/tenders.
- **Modules affected:** Admin Reports, POS Reports, exports, product/category/staff sales, tax and financial reconciliation.
- **Recommended fix:** Build one tenant-scoped reporting contract using immutable financial facts. Validate unpaid orders, multi-day partial payments, split tenders, partial/full refunds, item voids and historical category changes.
- **Evidence:** `supabase/migrations/20260826141000_admin_phase_b_reports_and_audit.sql:70`; `supabase/migrations/20260826151000_accurate_paid_sales_reports.sql:3`; current live report definitions inspected.
- **Verification:** **PARTIALLY VERIFIED**; aggregate mismatches not yet reproduced in live reporting fixtures.

### HIGH H5: Payment webhook marks events applied without applying them

- **Issue:** Matching amount/currency/reference causes `processing_status='APPLIED'`, irrespective of CONFIRMED/FAILED/REFUNDED status. The function only records the event; it never performs a payment/order/refund/ledger transition.
- **Why wrong:** Recording a verified event is not applying the business transition. Reference lookup also lacks an explicit provider/tenant binding.
- **Risk:** Misleading reconciliation state, missed asynchronous confirmations/refunds, unsafe future external-provider activation.
- **Correct behavior:** Validate provider identity and intended transaction; record event idempotently; perform allowed state changes atomically; mark applied only after commit. Changed payloads for reused event IDs must be rejected or investigated.
- **Modules affected:** External gateway integration, payments, orders, refunds, cash/report reconciliation, monitoring.
- **Recommended fix:** Keep external processing disabled until a transaction-safe event handler and provider sandbox tests exist. Preserve manual QR collection as a separate explicitly manual workflow.
- **Evidence:** `supabase/functions/payment-webhooks/index.ts:19`.
- **Verification:** **PARTIALLY VERIFIED**; signed live provider requests and actual configured provider behavior are **NOT VERIFIED**.

### MEDIUM M1: Report hierarchy and business timezone are incomplete

- **Issue:** Main report request APIs expose date/search/sort/page controls but no full branch/terminal/staff/shift filter chain. Several financial/receipt/refund report RPCs hardcode Asia/Kuala_Lumpur despite company timezone configuration supporting other countries.
- **Why wrong:** Multi-branch operational reconciliation needs explicit scoped dimensions and a consistent business-date boundary. Thailand is not on the same UTC offset as Malaysia.
- **Risk:** Incorrect daily boundaries, difficult shift-to-sale reconciliation, mismatched exports around midnight.
- **Correct behavior:** Backend-validated authorized dimension filters and tenant/branch business timezone used consistently across query, grouping and display.
- **Modules affected:** Reports, shifts, receipt/refund history, company configuration.
- **Recommended fix:** Add scoped report dimensions and a dedicated tax summary; centralize business date semantics and test midnight/DST where supported.
- **Evidence:** `src/features/reports/repositories/reportRepository.js:13`; `supabase/migrations/20260929170000_fix_admin_receipt_history_types.sql:35`; live `get_admin_report` and paid product report.
- **Verification:** **PARTIALLY VERIFIED**.

### MEDIUM M2: Legacy approval and report attribution use Auth profile instead of staff identity

- **Issue:** Manager void/discount Edge paths call legacy `verify_staff_pin_exchange` using profile IDs and pass `auth.getUser().id` as requester. Report export actor resolution also loads the Auth profile. PIN-mode authentication uses a terminal Auth identity plus a separate current staff session.
- **Why wrong:** Auth account, physical device, active staff operator and approving manager are distinct identities. New staff PIN resets must not leave approval dependent on a different legacy PIN store.
- **Risk:** Valid staff approvals fail, obsolete approval credentials remain relevant, or terminal identity is shown as the cashier/requester. Discount approval may reject a valid multi-branch operator because it checks the requester's primary profile branch.
- **Correct behavior:** Resolve requester from the live staff session; validate approver against current staff credentials, branch assignments and permissions; preserve distinct audit identities.
- **Modules affected:** Manager approval, staff PIN management, reports, audit, terminal login.
- **Recommended fix:** Unify current staff credential validation for scoped approvals and use server-provided staff attribution for export metadata. Test PIN reset followed by discount and void approval under terminal login.
- **Evidence:** `supabase/functions/orders/index.ts:319`, `supabase/functions/orders/index.ts:400`; `src/features/reports/repositories/reportRepository.js:17`.
- **Verification:** **PARTIALLY VERIFIED**; the full current-PIN approval browser journey is **NOT VERIFIED**.

### MEDIUM M3: Full production journey and adverse concurrency coverage are incomplete

- **Issue:** Focused database tests cover real terminal/shift operations, but they are not a single authenticated activation-to-checkout-to-refund-to-close browser journey. Some prior UI tests used mocked summary/error fixtures. Lock serialization testing is not proof of every committed financial race.
- **Why wrong:** Compilation and isolated test success cannot prove end-to-end tenant isolation, settlement or cash reconciliation.
- **Risk:** Integration failures can remain undetected at module boundaries.
- **Correct behavior:** A controlled local fixture suite exercising actual browser/API/database boundaries and independent concurrent clients, with financial invariants and cleanup.
- **Modules affected:** Entire Admin/POS process and release gating.
- **Recommended fix:** Add full real-flow tests after the critical repairs, including foreign IDs, forged credentials, permission revocation, duplicate payment/refund/close requests, provider callbacks and network retry.
- **Verification:** **NOT VERIFIED** for complete production regression.

## D. Missing Or Incomplete Requirements

- Trusted company provisioning and administrator invitation workflow. Current `save_company` updates the authenticated existing company; company editing must not be described as complete new-tenant onboarding.
- Company-owned roles and operational settings, including tenant-owned kitchen/printer configuration.
- Payment allocation for mixed-tender refunds and an explicit payout policy.
- Unified settled-sale/reporting contract, tenant timezone boundaries, dimensional filters and dedicated tax summary.
- Current-staff PIN manager approval with action-specific permissions and explicit same-company/branch validation.
- Transactional external payment-event application and recovery/reconciliation queue.
- Consistent before/after values and reasons for all sensitive changes. For example, role permission audit currently records the new list but not the previous list.
- Complete real browser/API/RLS financial workflow and adversarial concurrency regression suite.
- Explicit recovery policy for interrupted activation after a credential was issued but before the browser persisted it; offline financial operation policy; auditable administrator reconciliation when a device is revoked with an open shift.
- Truly separate device-only Auth and Auth-free staff architecture, if required as a product capability. Existing bindings/credentials are valuable but do not establish that separation as complete.

## E. Connection Review

| Connection | Verification | Assessment |
|---|---|---|
| Company -> Branch | PARTIALLY VERIFIED | Required company relationship exists, but self-profile tenant reassignment undermines trusted context. |
| Branch -> Staff | PARTIALLY VERIFIED | Primary branch plus multi-branch assignments exist; retain one authoritative access rule and validate legacy mappings. |
| Branch -> Terminal | VERIFIED PASS | Local terminal tests reject invalid selection and exercise branch-move invalidation. |
| Staff -> Branch Access | VERIFIED PASS | Removal immediately invalidates terminal access and current session in local rollback tests. |
| Staff -> Terminal Access | VERIFIED PASS | ALL_BRANCH_STAFF automatically permits eligible additions; SELECTED_STAFF requires valid branch staff; backend rejection tested. |
| Terminal -> Device | VERIFIED PASS | Credential proof, active-binding uniqueness, revoke/replace/reactivate and history preservation exercised. |
| Device -> POS Login | VERIFIED PASS | Local SQL tests validate device proof, active binding and lifecycle status; this is not independent device-only Auth certification. |
| POS Login -> Staff Session | VERIFIED PASS | PIN login and live access/session invalidation tested on local backend. |
| Staff Session -> Shift | VERIFIED PASS | Device/staff context, handover and open-shift behavior exercised in focused backend suite. |
| Shift -> Order | VERIFIED PASS | Local connected shift suite creates real orders and checks immutable shift attribution. |
| Order -> Payment | VERIFIED PASS | Local shift suite processes real cash/QR/e-wallet collections; external gateway callbacks are excluded. |
| Payment -> Sale | PARTIALLY VERIFIED | Server collection/settlement exists; partial, split, reporting and asynchronous-provider edge cases need full reconciliation coverage. |
| Sale -> Receipt | PARTIALLY VERIFIED | Unique order receipt and numbering relationships exist; full print/reprint/historical snapshot browser journey not repeated in this review. |
| Sale -> Refund | PARTIALLY VERIFIED | Real single-tender cash refund tested; mixed-tender allocation is defective by current SQL design. |
| Shift -> Cash Management | VERIFIED PASS | Real local float/sales/refund/cash-in/cash-out/reconciliation assertions pass for covered scenarios. |
| Important Actions -> Audit | PARTIALLY VERIFIED | Device/terminal/shift actions tested and audit relationships exist; global before/after completeness and correct legacy approval attribution remain incomplete. |

These statuses certify only the evidence stated, not every UI, API, company, race or business state for that connection.

### Data Model And Historical Integrity

- Both public views, `staff_branch_access` and `daily_sales_report`, currently have `security_invoker=true` in the local database. The originally reported SECURITY DEFINER view issue is not present locally.
- Every inspected public table has RLS enabled. This does not mean every policy is correctly scoped: C1-C3 demonstrate why that distinction matters.
- Unique active bindings exist for terminal and physical device; unique ACTIVE/LOCKED sessions exist per terminal, staff and Auth session; a partial unique index prevents more than one OPEN cashier shift per terminal.
- Unique terminal codes are branch-scoped. Branch-access and terminal-access uniqueness should remain intact during tenant-role migration.
- Financial entities retain company/branch/terminal/shift relationships with restrictive historical foreign keys; shift attribution is protected by update guards. Some receipt links use SET NULL, so historical snapshots and no-hard-delete terminal/staff policies remain important.
- Order child tables use cascade relationships. They are not inherently defects if parent deletion is reliably forbidden for posted financial records. Direct deletion and service-role maintenance paths require explicit regression tests before claiming universal immutable history.
- Missing company ownership in roles/configuration is a substantive relationship defect. `profiles` versus `staff` identifiers are a legacy duplication boundary, not interchangeable IDs.
- Refund-to-payment is insufficient for split tender; add allocation relationships rather than deleting or rewriting original financial rows.
- Existing indexes cover important active-session, active-binding and open-shift invariants. This review does not certify every foreign-key index or production query plan.

### State-Change And Recovery Review

| State Change | Required Immediate Effect | Current Assessment / Recovery |
|---|---|---|
| Company INACTIVE | Block activation/login/new shift/order/payment; preserve records | Live context helpers enforce active company; full cascade and emergency reconciliation tests remain PARTIALLY VERIFIED. |
| Branch INACTIVE | Block downstream terminal use; preserve records | Terminal access denial exercised. Administrator must retain a controlled reconciliation path for outstanding shifts. |
| Staff INACTIVE | End/reject operator sessions, preserve sales/shift ownership | Immediate session invalidation exercised; never remove historical cashier attribution. |
| Staff branch access removed | Reject all terminals in that branch even with selected access | Exercised; branch permission remains the higher-level gate. |
| Selected terminal access removed | End/reject that operator on the terminal | Backend live-access checks exist; complete UI revocation propagation remains PARTIALLY VERIFIED. |
| Terminal INACTIVE / disabled | Block new use and device-backed operations | Backend status gate exists; no silent settlement or shift deletion. |
| Terminal LOCKED | Reject staff use until authorized unlock | Local current-staff PIN unlock covered; interrupted/polled lock-screen browser flow remains NOT VERIFIED. |
| Terminal RETIRED | Revoke use, retain historical identity | RETIRED status and lifecycle guards exist; never reuse identity by hard deletion. |
| Device UNBOUND | Invalidate proof/binding, retain logical terminal/history | Local lifecycle suite covers unbind and blocks unsafe open-shift unbind. |
| Device REVOKED | Immediately reject old credential and end staff sessions | Covered; an OPEN shift is retained for audited administrator reconciliation. |
| Device REPLACED / REACTIVATED | New single-use activation, old proof unusable | Covered; replacement cannot bypass outstanding shift safeguards. |
| Terminal branch changed | Revalidate selected staff, revoke old context | Local suite exercises invalidation; historical sales must retain original branch. |

Normal staff sign-out ends only the staff session. It does not unbind/revoke the device. An OPEN shift blocks ordinary sign-out until reconciliation, while explicit staff handover preserves shift ownership. These distinctions are implemented and covered in focused backend tests.

Cash formula should be: opening float + cash collected + cash in - actual cash refunded - cash out = expected drawer cash. It must not subtract QR/card refunds from drawer cash. Expected minus actual sign conventions must be named consistently; the current tested variance is actual minus expected.

## F. Final Recommendation And Repair Order

1. Block production multi-company release. Repair C1 trusted identity/self-update authorization first, including null-safe privilege guards and company/branch consistency.
2. Repair C2-C3 restrictive tenant policies; audit every nullable-branch policy, SECURITY DEFINER read and direct table grant for the same pattern.
3. Repair C4 scoped manager approval, preserving current staff/device context and paid-order protections. Add negative direct API tests before releasing.
4. Migrate global roles and company operational configuration to tenant ownership, using forward-only migrations and preserving current IDs/history where necessary.
5. Define and implement mixed-tender refund payout/allocation, then reconcile cash ledger and financial snapshots.
6. Unify sale/payment/refund reporting semantics, tenant timezone and dimensions. Verify all totals from fixture financial facts, not frontend assumptions.
7. Implement transactional external gateway processing before enabling that capability.
8. Complete current-staff attribution, approval credential unification and audit before/after coverage.
9. Run the full controlled real-browser/API/RLS/concurrency suite and assess remaining company provisioning/offline/recovery product decisions.

Do not rewrite the entire application. Extend the existing RPCs, RLS, migrations and operational modules with focused repairs. Do not weaken constraints or expose service credentials to the browser. Do not deploy shared/staging migrations without explicit target authorization.

## Verification Record

Executed during this review:

| Command / Evidence | Result | Scope |
|---|---|---|
| `docker exec -i supabase_db_Pos_Order psql -U postgres -d postgres < scripts/review-admin-pos-security-local.sql` | VERIFIED FAIL | Security invariants: foreign inventory/promotion visible; self company reassignment and foreign branch access allowed; global role mutation allowed. Diagnostic process exits 0 because it records observations and rolls back, not because security passed. |
| `npm run test:terminal-device-local` | VERIFIED PASS | 16 local terminal/device scenarios, proof, consumed activation code, shift safety, replacement/reactivation, audit/history; all fixtures rolled back. |
| `npm run test:shift-management-local` | VERIFIED PASS | Existing real local order/payment/cash/refund/reconciliation and permission/context assertions; fixtures rolled back. |
| `npm run test:security-contracts` | VERIFIED PASS | Static contract assertions only; these do not detect the reproduced RLS failures. |
| Live PostgreSQL policy/function/constraint/index/view inspection | PARTIALLY VERIFIED | Confirms definitions and schema, not execution of every workflow. |
| Post-diagnostic fixture count for QA_REVIEW_A / QA_REVIEW_B | VERIFIED PASS | Count 0; rollback removed review fixtures and restored shared role data. |
| Full browser activation -> login -> sale -> mixed refund -> close -> reports | NOT VERIFIED | Not performed end-to-end in this review. |
| Shared/staging deployment or live gateway callbacks | NOT VERIFIED | Not run; no supplied staging target/credentials. |

Build/lint were not rerun for this review because no application behavior was changed. Previous successful checks are not substituted for the missing security and end-to-end coverage.
