# Full POS Integrity, Security and Feature Audit

Date: 2026-10-04. Target: current dirty worktree, local Docker Supabase supabase_db_Pos_Order/API 54321 and local Vite 5173. No shared/staging authorization or credentials supplied. Discovery preceded behavior changes. This report supersedes older audit findings only where new evidence is recorded; it is not a production certification.

## A. Overall Verdict

**NOT SAFE FOR PRODUCTION. PARTIALLY VERIFIED.**

Tenant roles, inventory, terminal/device access and shifts have substantial tested controls. Remaining discount/e-invoice/storage/settings authorization problems, financial reconciliation gaps and incomplete operational/provider/concurrency coverage prevent release acceptance. Successful builds and contract tests do not establish system safety.

## B. Architecture

```text
React/Vite App.jsx
  AdminShell -> pages/components -> hooks/services -> repositories
  POS screens -> order/payment/catalog/terminal/session services
    -> effective Supabase client (account or operator, anon/publishable key)
    -> Supabase Auth JWT + x-pos-device-credential where required
    -> PostgREST table APIs / RPCs / Edge Functions
    -> PostgreSQL RLS + constraints + SECURITY DEFINER business transactions
    -> triggers -> ledger/receipts/audit/reports

Company -> Branch -> Terminal -> active device binding
Company -> Staff -> company Role -> active assignable Permissions
Staff + Branch Access + Terminal Access + PIN -> terminal staff session
Staff session -> cashier shift -> order/items/batches -> payments
Full settlement -> tracked-stock movement + receipt + completion
Refund -> original order/item + cash impact + explicit physical stock return
```

One frontend contains Admin and POS. Edge routes include orders, payments, tables, products, categories, admin-users, staff-pin-session, terminal-account-binding, system-health, e-invoice submission and payment-webhooks. Auth-backed profiles, staff records and two PIN stores coexist. Independent device-only Auth/Auth-free staff architecture is not complete.

Database discovery: 87 public tables, all with RLS; two public views both security_invoker; 307 public functions, 276 SECURITY DEFINER, all definers have configured search_path. Initially 35 definers were executable by anon, many being trigger functions that cannot be called as normal RPCs. Three Storage buckets are public. Eleven tables are in supabase_realtime. These counts classify exposure, not safety.

Migration discovery: 325 migration files and 325 local applied versions; no duplicate versions, missing source versions or unapplied files before new repairs. Version equality does not prove absence of manual schema drift or applied-file edits. The worktree includes a pre-existing edit to an older reset migration; provenance/shared checksum verification is NOT VERIFIED. No applied migration was rewritten in this task.

## C. Critical Issues

Every issue below lists frontend, backend/database/RLS, evidence, reproduction, risk, repair and affected connections. Inspection-only concerns are not labeled verified exploits.

### P0-01 Discount Tenant Isolation

Severity CRITICAL. Frontend PromotionManagement/VoucherManagement and voucher pickers; backend archive_promotion_admin, delete_voucher_admin, validate_voucher, get_available_vouchers/get_order_vouchers; DB promotions/vouchers/promotion_targets.

Problem: nullable branch policies admit branchless rows without company equality; targets only check permission. SECURITY DEFINER delete/archive and discovery functions resolve supplied IDs without company ownership. validate_voucher is anonymously executable and returns voucher metadata without authorization. POS evaluate_order_discounts itself already includes order company; that does not secure the alternate paths.

Evidence: live pg_policies and pg_get_functiondef show missing ownership. Reproduce with Company B branchless promotion/voucher, authenticated Company A read/archive or anonymous validate_voucher(code). Risk: cross-company disclosure, deletion, forged target relationships and discount metadata exposure. Repair: restrictive company/branch RLS, scoped RPC resolution, trusted write ownership and target validation, narrow execute grants. Affects pricing, administration, orders, payments, reporting and audit. Initial verification: PARTIALLY VERIFIED pending explicit failing regression.

### P0-02 Global Operational Settings and Equipment

Severity CRITICAL. Frontend SystemAdministrationPage/systemSettings.repository; backend get/save_system_administration; DB singleton restaurant_system_settings, printer_configs, kitchen_stations, numbering_settings, integration_configs.

Problem: company-admin settings permission gives access to globally shared operational configuration/equipment; table policies lack tenant ownership. Reproduce two company admins reading the same singleton/equipment and inspect save RPC. Risk: cross-company operational interference, tax/branding/routing inconsistency. Repair: inventory consumers and migrate company/branch defaults and equipment ownership forward, retaining IDs/history; separate genuine platform configuration. Affects taxes, printers, kitchen, receipts, numbering, integrations. Verification: PARTIALLY VERIFIED, schema/function evidence; live two-company save not executed.

### P0-03 Storage Mutation Ownership

Severity CRITICAL. Frontend product-image and restaurant-logo uploads; DB storage.objects policies/public buckets.

Problem: product_images_permission_delete allows company ADMIN to delete any product-images object; restaurant_assets delete checks only settings.manage and path pattern, not tenant owner; payment QR uploads are unnamespaced. Reproduce A-admin delete known B object using Storage API. Public GET for public product/logo/QR images is expected architecture, not automatically a private-data leak. Risk: cross-company image deletion/branding or QR substitution if paths become writable. Repair: company-owned object paths/mapping, ownership validated for writes/deletes, migrate legacy references safely. Verification: PARTIALLY VERIFIED; live object attack not performed.

### P0-04 E-Invoice Mutation and Internal Event Exposure

Severity CRITICAL. Frontend EinvoiceOverview; RPC einvoice_profile_set_status; private helper write_kitchen_ticket_event.

Problem: e-invoice status update checks permission but mutates by profile ID without authenticated company; internal kitchen event helper is anon-executable and accepts a client-supplied composite batch. Further execution found the checked permission einvoice.company.enable does not exist, so the e-invoice status path is currently broken/denied, not a verified live cross-company exploit. Reproduce legitimate company.manage caller attempting own status update; inspect missing scope before making that capability reachable. Risk: latent foreign tax configuration changes once permission naming is repaired, or forged operational/audit history via event helper. Repair permission mismatch and scoped profile resolution together; revoke internal helper execute. Initial verification: PARTIALLY VERIFIED; own e-invoice operation VERIFIED FAIL before repair.

## D. High, Medium and Low Issues

### P1-01 Mixed-Tender Refund Allocation

Frontend AdminPayments/refund history; backend refund_pos_order/record_cash_refund_movement; DB refunds link one selected payment. Problem: combined paid balance is refunded against most recent tender and cash impact follows that one method. Evidence live function definitions/previous audit. Reproduce CASH+QR in both collection orders, then full/partial refund and reconcile drawer. Risk incorrect tender refunds/cash variance. Repair explicit tender allocations/payout policy with per-payment limits and idempotent ledger transaction. Affects refunds, cash, shift, receipt, reports. PARTIALLY VERIFIED; mixed-tender runtime fixture absent.

### P1-02 Reporting Accounting Grain

Frontend AdminReports/POS reports; DB get_admin_report products/category include non-cancelled unpaid orders, paid-product report includes whole order after any paid installment. Neither is a complete refund-adjusted settled-sale measure. Evidence current definitions. Reproduce unpaid product order and partial CASH payment; compare reported product quantities to completed sales. Risk sales/tax/stock/cash reconciliation discrepancies. Repair explicit settlement/collection/refund grains and immutable snapshots. PARTIALLY VERIFIED; controlled report-total fixture still required.

### P1-03 Webhook Application Is Incomplete

Edge payment-webhooks/index.ts: HMAC validates raw body, but reference+amount+currency alone marks event APPLIED and no financial transition is executed. Provider/tenant matching and changed replay detection are incomplete. Reproduce matching signed event then compare payments/orders/refunds; status FAILED/REFUNDED is also marked applied. Risk false reconciliation and lost asynchronous transitions. Repair transaction-safe provider-bound event application; keep external providers disabled until sandbox verification. PARTIALLY VERIFIED code evidence; signed provider execution NOT VERIFIED.

### P1-04 Staff Approval and Device Identity Boundary

Edge orders verifies legacy profile PIN store and passes auth user ID as requester; current login/reset uses staff v2 credentials. Device Auth identity and actual operator differ. Reproduce reset current staff PIN then approve discount/void from a separately authenticated terminal. Risk failed approvals/wrong actor or obsolete credentials. Prior role/approval tenant checks were repaired, but credential/identity separation remains incomplete. Repair derive requester from proven live session and use current scoped staff PIN validation. PARTIALLY VERIFIED; independent-device order creation previously VERIFIED FAIL, not claimed fixed.

### P2-01 Business Timezone and Report Dimensions

Several report/receipt/refund RPCs hardcode Asia/Kuala_Lumpur; configuration supports other timezones. Reproduce Thailand midnight boundary. Repair validated branch/company timezone and explicit branch/terminal/staff/shift filters. Affects daily sales/tax/refund/shift/export. PARTIALLY VERIFIED code evidence.

### P2-02 Product Cache Context and In-Flight Requests

Product cache uses a single sessionStorage key. App clears on identity/session transitions, but pendingRefresh is not invalidated by clear, so an older loader can repopulate cleared state. Reproduce delayed A menu response followed by B login/branch change. Backend scope remains authoritative; stale UI product/price exposure remains possible. Repair context/generation-keyed cache and late response rejection. PARTIALLY VERIFIED code evidence; race test absent.

### P2-03 Migration/Test and Historical Maintenance Risks

Two local CHECK constraints are NOT VALID (cancellation metadata and paid method); sampled invalid cancellation count is zero but full historical validation is not performed. Historical child cascade FKs exist; not intrinsically unsafe if parent deletion is denied. Some legacy smoke scripts lack controlled cleanup and assume global role names/Auth-only sessions. Playwright default server command uses staging mode on local port; existing local server was not replaced. Repair fixture isolation/cleanup, explicit environment gates, migration checksum/drift and parent-delete tests. PARTIALLY VERIFIED.

### P3-01 Verification/Operational Completeness

Printer/integration test helpers return UNKNOWN rather than asserting physical success. This is honest but operational adapters are incomplete. Build has existing ExcelJS eval and large bundle warnings. Offline sale recovery, trusted company onboarding, variants/barcode uniqueness and automatic inventory jobs are not established complete merely from screens. NOT VERIFIED where no runtime evidence exists.

## E. Existing Data Integrity

Read-only local diagnostic counts were zero for terminal/branch company mismatch; staff/profile role mismatch; product/category mismatch; inventory product/branch/company mismatch; negative stock; duplicate open shifts; duplicate active terminal bindings; PAID orders lacking paid payments; aggregate refund-over-paid; missing cancelled-order metadata; duplicate receipt numbers; order/table branch mismatch; order/branch company mismatch; payment/order branch mismatch; refund/order branch mismatch.

Important limitation: local database had one company and zero orders/payments/refunds/inventory rows at inspection. Zero financial corruption counts are vacuous, not reconciliation proof. Rollback multi-company fixtures provide separate behavioral evidence. No data was deleted to improve results. After repairs, scripts/audit-pos-integrity-local.sql checked 247 declared foreign-key relationships with zero orphan failures. Undeclared relationships and production data corruption search remain NOT VERIFIED.

## F. Feature Matrix

Columns cover observed implementation, not completion certification. V=VERIFIED PASS targeted tests; P=PARTIALLY VERIFIED; N=NOT VERIFIED. COMPLETE is not assigned where end-to-end coverage is absent.

| Feature | Frontend | Backend / DB / RLS | Tests | Classification |
|---|---|---|---|---|
| Admin auth/company | Exists | Auth/profiles/company config; onboarding partial | P | PARTIAL |
| Branch/staff/access | Exists | Scoped assignments and live access guards | V targeted SQL | PARTIAL |
| Roles/permissions | Exists | Company roles, protected templates, live permission joins | V SQL + prior browser | PARTIAL overall |
| Terminal/staff access | Exists | Branch dependency and selected/all mode | V SQL | PARTIAL UI lifecycle |
| Activation/device/revoke/replace | Exists | Temporary codes, proof hashes, active uniqueness | V 16 SQL scenarios | PARTIAL independent Auth |
| Staff sessions/login/logout | Exists | PIN v2/session invalidation; legacy identities coexist | V targeted | PARTIAL |
| Shifts/cash | Exists | Row locks, unique OPEN terminal shift, ledger/reconciliation | V SQL | PARTIAL mixed refund |
| Products/categories/modifiers/menu | Exists | Company/catalog/branch mappings | V contracts; P runtime | PARTIAL |
| Variants/barcode/SKU | Mixed model | Not independently traced through sale | N | PARTIAL / MISSING evidence |
| Inventory/history/transfer | Exists | Tenant constraints, RLS, shared transactional writer | V SQL | PARTIAL concurrency/export |
| Promotions/vouchers | Exists | Nullable-branch RLS and unsafe alternate RPCs | P initial | INSECURE before repair |
| Discounts/manager approval | Exists | Permission gates; identity/PIN boundary remains | P | PARTIAL |
| Tax/pricing | Exists | Server recomputation/config snapshots | V contracts + covered sales | PARTIAL reporting/settings |
| Order/hold/resume/cancel/void | Exists | State/version/idempotency/trigger guards | P; covered order+void SQL | PARTIAL |
| Payment/split/mixed tender | Exists | Locks/idempotency/receipt completion | V single-tender covered; split math only | PARTIAL |
| Refund/stock return | Exists | Limits/item returns; mixed tender deficient | V single-tender SQL | PARTIAL |
| Receipt/reprint/print | Exists | Snapshot/numbering/print history | P | PARTIAL physical print |
| Reports/dashboard | Exists | RLS reads but accounting/timezone inconsistent | P | PARTIAL / logically incorrect |
| Audit | Exists | Append-only and attribution triggers | V covered diff/history | PARTIAL event helper exposure |
| Storage | Exists | Public media; mutations lack tenant ownership | P | INSECURE writes |
| Realtime | Exists | Publication + table RLS; client catalog/order subscriptions | P catalog schema | PARTIAL runtime isolation |
| External webhook/e-invoice | Exists | Worker/server paths; incomplete scope/application | P | PARTIAL / INSECURE paths |
| Background stock/import/jobs | Not found | No inventory CSV/job/index implementation found | N | MISSING, not invented |
| Settings/printer/integrations | Exists | Globally shared operational tables | P | INSECURE multi-company |

## G. Connection Matrix

| Connection | Verification | Evidence / Gap |
|---|---|---|
| Company -> Branch | PARTIALLY VERIFIED | Ownership constraints; targeted scope fixtures |
| Branch -> Terminal / Staff | VERIFIED PASS | Terminal/staff local SQL tests within covered cases |
| Staff -> Role -> Permission | VERIFIED PASS | Two-company role attack/revocation SQL |
| Terminal -> Device / Staff Access | VERIFIED PASS | Proof, lifecycle, branch dependency tests |
| POS -> Staff Session -> Shift | VERIFIED PASS | PIN/session/shift SQL fixtures |
| Shift -> Order -> Payment | VERIFIED PASS | Connected inventory-sale and shift tests |
| Payment -> Sale -> Inventory | VERIFIED PASS | Settlement/replay/shortage rollback for tracked stock |
| Sale -> Receipt | PARTIALLY VERIFIED | Covered settlement, full printing/reprint not rerun |
| Sale -> Refund | PARTIALLY VERIFIED | Single-tender passes, mixed allocation missing |
| All -> Audit | PARTIALLY VERIFIED | Covered append-only attribution; internal event exposure |
| Discounts -> Order -> Payment | PARTIALLY VERIFIED | Main evaluator scoped, alternate paths unsafe |
| Settings -> Tax/Print/Receipt | PARTIALLY VERIFIED | Global operational settings prevent tenant certification |

## H. Supabase Security

Tables without RLS: none among 87 inspected public tables. Blanket USING(true): none identified; nullable branch predicates are equivalent leakage for branchless discounts. No conclusion that every policy is safe follows from RLS enabled.

Definers: 276 with configured search_path; grants/ownership must be audited by path, not only count. Unsafe paths listed P0-01/P0-04. Trigger functions in the anonymous count are not ordinary callable RPCs; the composite kitchen helper is.

Service-role references occur in Edge Functions and controlled local scripts, not browser client configuration. A string-name scan found only browser environment rejection code and its generated bundle, not a service credential assignment. A complete secret-value scanner, deployment secret review and tracked .env content audit are NOT VERIFIED; no secret values were printed.

Storage: product-images/payment-qr/restaurant-assets are public. Policies lack company namespaces for mutation; P0-03. Realtime publication includes 11 tables. RLS inspection does not prove websocket isolation; A/B subscriptions and revoked-session delivery tests are NOT VERIFIED.

## I. Test Evidence and Gaps

During discovery: VERIFIED PASS npm run test:company-role-local, test:inventory-tenant-local, test:inventory-sale-local, test:staff-detail-local, test:shift-management-local; test:split-money, test:checkout-drafts, test:integration-contracts, test:security-contracts, test:cash-shifts-contracts, test:branch-menu-pricing-contracts, test:system-health, test:system-administration; node scripts/test-environment.mjs and node scripts/test-api-errors.mjs. Contract/unit assertions are not live RLS or full finance proof. Terminal device test completion is recorded below.

NOT VERIFIED: full authenticated browser journey activation -> PIN login -> open shift -> modifier/discount -> split/mixed payment -> refund -> close -> reports; concurrent payment/refund/stock/activation/receipt races; actual printer/device hardware; provider sandbox/webhook callbacks; mixed-tender allocation; business-date report reconciliation; production data; separate device-only Auth; comprehensive storage/realtime attacks; CSV import/export jobs; offline recovery. Existing smoke scripts were inspected rather than blindly run because some commit financial fixtures without clean archival and assume obsolete auth/role architecture.

## J. Dependency-Aware Repair Order

1. P0-01: discount tenant RLS/RPC/write relationships, including anonymous voucher leak. Add failing test, then forward migration and connected sale regression.
2. P0-04: scope e-invoice status and revoke forgeable internal event helper. Add explicit bypass tests; preserve history.
3. P0-03: storage mutation isolation, retaining public-media intent and migrating legacy references.
4. P0-02: tenant operational settings/equipment migration after complete consumer mapping; no blunt global-disable or UI-only remedy.
5. P1: current staff approval credentials and terminal session attribution, then tender refund allocations and accounting/report reconciliation.
6. P1: external webhook transaction application before provider enablement.
7. P2: tenant business timezone, cache generations, migration drift/fixture modernization and broad concurrency coverage.
8. Full browser/API/RLS/reconciliation regression and exact authorized shared-environment verification before release.

## Repair Log

Report and priorities recorded before behavior changes. Repairs below will record original failures, migrations, bypass attempts, regressions and remaining boundaries. Do not interpret an individual repaired path as full-system production acceptance.

### Repairs Performed Locally

- P0-01: original rollback regression VERIFIED FAIL with FOREIGN_PROMOTION_VISIBLE. Forward migration 20261004440000 adds restrictive company/branch policies on promotions/vouchers/targets, tenant/target ownership write guards, scoped archive/delete/validator/picker RPCs, and revokes anonymous voucher access. It also makes the internal kitchen event writer private. VERIFIED PASS: npm run test:discount-tenant-local after repair, covering actual two-company branchless reads, targets, spoofed company, archive/delete/validation IDs, own lifecycle, foreign category target rejection and anonymous access. Picker/order and full discount payment browser coverage remain NOT VERIFIED; overall P0-01 is PARTIALLY VERIFIED, not globally closed.
- P0-04: pre-repair e-invoice execution VERIFIED FAIL with INSUFFICIENT_PERMISSION due to missing permission definition. Forward migration 20261004450000 uses existing einvoice.company.manage and scopes lookup/update to authenticated company with before/after audit. VERIFIED PASS: own-company status update succeeds and foreign profile mutation is rejected in the rollback suite. Anonymous helper privilege is denied. Full e-invoice submission/provider workflow remains NOT VERIFIED.
- P0-03: original authenticated storage deletion regression VERIFIED FAIL with FOREIGN_STORAGE_DELETE_ALLOWED. Controlled SQL uses storage.allow_delete_query=true to simulate Storage API internals without bypassing RLS; fixtures roll back. Forward migration 20261004460000 adds owner-company restrictions to media delete/update and authenticated ownership to insert. Public asset delivery remains unchanged. VERIFIED PASS: foreign product-image metadata deletion affects zero rows; own deletion succeeds. VERIFIED PASS: authenticated real Storage API own-company branding PNG upload/removal in browser fixture tooling. Actual foreign Storage HTTP deletion and ownerless legacy object reconciliation remain NOT VERIFIED. Legacy ownerless assets fail closed for mutation; local Storage had zero existing objects.

Post-repair public catalog: 310 functions, 279 definers, 30 anon-executable definers; none missing configured search_path. Remaining trigger-function grants are not treated as ordinary RPC exploits.

### Final Local Evidence

- VERIFIED PASS: npm run test:discount-tenant-local; repeated company-role, inventory tenant/sale and shift management suites after database repairs.
- VERIFIED PASS: npm run test:terminal-device-local, including 16 scenarios; all SQL fixtures roll back.
- VERIFIED PASS: npm run test:company-role-ui-local with actual Auth/API, role directory desktop/tablet/phone, Promotions/Vouchers navigation, denied anonymous voucher RPC, and real Storage own upload/remove. Voucher loaded rows are compared to authorized API codes/company IDs; existing local seed vouchers are not incorrectly assumed absent. Initial extra empty-state test failed due to that fixture assumption, not a loading defect. Screenshots /tmp/pos-audit-promotions-1440.png and /tmp/pos-audit-vouchers-1440.png inspected. This is not positive discount creation/payment browser certification.
- VERIFIED PASS: docker exec -i supabase_db_Pos_Order psql -U postgres -d postgres -v ON_ERROR_STOP=1 < scripts/audit-pos-integrity-local.sql. Read-only transaction; 87/87 public tables RLS; 247 declared FK checks with zero orphan failures; zero listed local domain violations. Financial tables remain empty outside rollback fixtures.
- VERIFIED PASS: npm run lint, npm run build:local, git diff --check. Existing eval/large-chunk build warnings remain.
- NOT VERIFIED: npm run test:shift-concurrency-local could not execute its race because no eligible live authenticated terminal/no-open-shift fixture exists. Process exit 1 is a missing fixture failure, not proof of a concurrency defect or a successful concurrency test.

No shared environment was reset, migrated or deployed. Three forward migrations were applied/journaled locally. Test Auth users are removed; audit-referenced profiles are retired, not deleted. Storage test object is removed through the actual Storage API; SQL fixtures rollback.

Remaining release blockers: P0-02 global operational settings/equipment; complete storage/picker/action browser and adversarial API verification; P1 mixed-tender refund/cash/report reconciliation; webhook transactional application; current staff approval identity/PIN boundary; comprehensive concurrency and exact shared-environment validation. The verdict remains NOT SAFE FOR PRODUCTION and PARTIALLY VERIFIED. Next dependency-aware implementation is a tenant-owned operational settings/equipment migration after complete consumer mapping, not a UI-only hide or weakened policy.
