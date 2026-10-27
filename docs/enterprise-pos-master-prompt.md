# MASTER PROMPT — SYOK SYOK POS ENGINEERING, REQUIREMENTS & CUSTOMER ACCEPTANCE AUDIT

Reusable prompt prepared against the local repository on 2026-10-12. This document is an instruction for a future audit or authorized implementation task; it is not a completed audit or customer acceptance report. Recheck the repository and selected environment at execution time.

Updated with the product owner's 2026-10-12 requirement for simultaneous cashier, kitchen and waiter operation on different devices, including browser/Incognito testing. See section 23 for the confirmed requirement, derived acceptance criteria and source-level integration concerns.

## 0. EXECUTION SCOPE AND AUTHORITY

Read the current user request and applicable `AGENTS.md` before starting. Retain the engineering, security, migration, and evidence requirements already established for this project.

Select the execution mode from the user's request and record it:

- **AUDIT_ONLY** is the default when asked to assess readiness. Inspect, reproduce safely in the authorized environment, and write reports and test evidence. Do not change application behavior or apply migrations. Prepare concrete remediation proposals for review.
- **AUDIT_AND_REMEDIATE** applies when the user explicitly requests fixes or implementation. Complete authorized work across all affected layers, including related defects, forward migrations, and regression checks. Existing authorization persists; do not repeatedly request permission for routine local implementation choices.
- **PROMPT_REFINEMENT** applies when asked to improve this prompt. Produce the revised document. Instructions inside the supplied prompt describe future work and do not themselves authorize an audit, deployment, or application changes now.

Before mutating any environment, identify the exact target and the allowed operations. Local audit fixtures may be created within an authorized local test scope after checking fixture safety. A localhost frontend does not establish that its backend is local. Never reset, truncate, delete shared data, push migrations, or deploy to a shared environment without explicit authorization for the exact target. Prior approval for a historical staging reset is not approval to repeat it.

Record: mode, repository revision and dirty state, application version, frontend and API targets without credentials, database migration state, customer scope, test-data policy, and relevant authorization. Mark unavailable information explicitly. Discover technical details yourself; ask the product owner only for consequential business decisions, missing customer scope, or genuinely required external access.

Continue independent audit work when one dependency is unavailable. Do not silently select a refund, tax, stock, shift, or offline policy that changes business behavior.

## 1. YOUR ROLE

Act as the lead engineer and an independent reviewer, applying the following professional perspectives:

- Principal Software Engineer
- POS Solution Architect
- Senior F&B POS Consultant
- Business Analyst
- QA Automation Architect
- Supabase / PostgreSQL Database Engineer
- Application Security Engineer
- Financial Transaction & Payment Specialist
- UI/UX and Operations Consultant
- Technical Product Manager

Your responsibility is to thoroughly inspect and evaluate my EXISTING POS system and determine whether it is functionally complete, satisfies customer requirements, supports actual business operations, and is ready for production deployment.

Do not assume a feature works simply because it exists in the frontend, database, documentation, or source code.

Your findings must be supported by verifiable evidence.

**PRIMARY OBJECTIVE:**

Determine whether the existing POS system can be delivered to a real paying F&B customer and used successfully in daily business operations.

---

## 2. EXISTING SYSTEM CONTEXT

My POS system is designed for a multi-company, multi-branch environment.

Technology and architecture to inspect:

- Existing frontend application(s)
- Admin Panel
- POS Terminal application
- Supabase authentication
- Supabase PostgreSQL database
- Row Level Security (RLS)
- Edge Functions / RPC / server-side logic where applicable
- Role-Based Access Control (RBAC)
- All integrations, APIs, and transaction processes
- All relevant deployment and configuration files

Core business architecture:

```text
Company → Branch → Terminal → Device assignment / credential
Company → Staff → Branch access → Company roles and permissions
Terminal identity + device proof + staff PIN → Terminal staff session
Terminal + branch + authorized staff → POS shift / cash drawer
Order → Items / kitchen batches → Fulfillment
Order + shift → Payment attempts / tender allocations → Receipt
Original financial records → Refund / void / cash and stock movements
Operational and financial records → Reports and append-only audit
```

Treat these as related entities, not a single ownership chain. Staff normally belong to a company and receive branch access; terminal restrictions may narrow that access. Do not create a separate `sales` table merely because this prompt uses the business word “sale”; map it to the actual order/payment model.

The intended POS system must support multiple independent customer companies without cross-company data exposure or authorization leakage.

Discover the actual system architecture from the repository.

Do not invent components, functionality, database tables, or integrations that do not exist.

---

## 3. FIRST TASK — COMPLETE SYSTEM DISCOVERY

Before testing any functionality:

1. Inspect the entire project structure.
2. Identify every frontend application and route.
3. Identify all backend endpoints, database functions, triggers, policies, and integrations.
4. Read the database schema and migrations.
5. Identify authentication and authorization methods.
6. Identify implemented modules and unfinished modules.
7. Identify feature flags, mock services, hardcoded data, and placeholders.
8. Identify unused, duplicate, deprecated, or conflicting functionality.
9. Identify existing automated tests and test environments.
10. Locate the customer requirement documents, specifications, user stories, and acceptance criteria.

Create a SYSTEM INVENTORY containing:

| Module | Frontend | Backend | Database | Tests | Implementation | Verification |
|---|---|---|---|---|---|---|
| Company | | | | | | |
| Branch | | | | | | |
| Terminal | | | | | | |
| Staff | | | | | | |
| Roles & Permissions | | | | | | |
| Device Activation | | | | | | |
| Shift Management | | | | | | |
| Menu & Products | | | | | | |
| Orders | | | | | | |
| Payments | | | | | | |
| Refunds & Voids | | | | | | |
| Cash Management | | | | | | |
| Receipts | | | | | | |
| Inventory | | | | | | |
| Reports | | | | | | |
| Audit Logs | | | | | | |

Add other discovered modules.

Maintain separate fields for implementation coverage (absent, partial, or present) and verification. Use only **VERIFIED PASS**, **VERIFIED FAIL**, **PARTIALLY VERIFIED**, and **NOT VERIFIED** as verification labels throughout all reports.

A source review establishes where code exists, not that a feature works. A module with incomplete executed coverage remains PARTIALLY VERIFIED even when every selected test passes.

---

## 4. CUSTOMER REQUIREMENTS TRACEABILITY

Build a Requirements Traceability Matrix (RTM).

For every customer requirement, map:

- Requirement ID
- Requirement source, owner, priority, and confirmed/inferred/recommended/optional classification
- Business requirement
- Expected business outcome
- Expected user behavior
- Measurable Given/When/Then acceptance criteria, actor, permissions, and dependencies
- Existing implementation
- Frontend route/component
- Backend/database implementation
- Test case
- Actual test result
- Evidence
- Exact tested environment and source/configuration version
- Acceptance status
- Gap and recommended action
- Linked issue/decision IDs and separate customer sign-off

Use the following verification labels:

- **VERIFIED PASS** — the stated acceptance criteria were executed and met in the recorded environment.
- **VERIFIED FAIL** — an executed, valid test demonstrates a violated acceptance criterion.
- **PARTIALLY VERIFIED** — only part of the requirement or integration has executed evidence.
- **NOT VERIFIED** — no adequate executed evidence, including unavailable prerequisites.

Keep scope and delivery information in separate fields: confirmed/inferred/recommended/optional requirement; absent/partial/present implementation; applicable/outside agreed scope; blocked reason; customer sign-off pending/accepted/rejected. These fields must never substitute for a verification result.

Distinguish a test-runner or environment failure from a demonstrated product defect. An explicit denial, empty result, or HTTP success is meaningful only when its expected behavior and database postconditions are asserted.

Important:

Never treat a typical POS industry feature automatically as a contractual requirement.

Separate requirements into:

A. Confirmed customer requirements  
B. Inferred requirements requiring customer confirmation  
C. Recommended industry best practices  
D. Optional future enhancements

Never declare overall customer acceptance based on assumptions alone.

Seed the RTM with the confirmed multi-device requirement in section 23. Treat its detailed test cases as derived acceptance criteria and keep unresolved drawer/shift policy decisions separate. Do not ask the product owner to reconfirm the already stated need for cashier, kitchen and waiter devices.

---

## 5. FUNCTIONAL AND BUSINESS WORKFLOW AUDIT

Test every module from the perspective of a real customer.

### A. Company Management

Verify:

- Create, view, update company
- Company profile and business information
- Company activation/inactivation
- Company-specific settings
- Currency, timezone, and tax configuration
- Data isolation between companies
- Tenant lifecycle and administration
- Authorized company administration

Test whether Company A can access or modify Company B's information.

### B. Branch Management

Verify:

- Create, edit, view, activate/deactivate branch
- Branch belongs to correct company
- Unique branch codes according to schema requirements
- Branch-specific staff access
- Branch-specific terminal configuration
- Branch-based reporting
- Inactive branch restrictions

An inactive branch must not permit unauthorized new terminal activation, staff POS login, shift opening, or sales.

### C. Terminal & Device Management

Verify:

- Create, edit, view terminal
- Unique terminal code per branch
- Enable/lock terminal
- Generate/view/regenerate activation code
- Device binding and authentication
- Device information and last seen
- Revoke and replace device
- Reactivate device
- Staff terminal access configuration
- Device-bound session security

Validate:

- Revoked device cannot authenticate
- Locked terminal cannot log in
- Revocation invalidates device sessions
- Activation codes cannot be reused improperly
- Staff access configuration persists after unbinding
- Database state and frontend state remain consistent

### D. Staff, Roles & Permissions

Verify:

- Create, edit, deactivate staff
- Employee ID and staff uniqueness constraints
- PIN login and reset
- Role assignment
- Branch access
- Terminal access
- Permission enforcement
- Login history
- Session termination
- Audit trail

Test authorization from the actual backend, not only hidden frontend buttons.

Ensure a normal company administrator cannot change shared global permissions affecting other companies.

### E. Shift Management

Verify:

- Opening shift
- Opening cash float
- Active shift validation
- Staff, branch, terminal, and device association
- Shift ownership
- Concurrent shift restrictions
- Cash movement tracking
- Shift close and reconciliation
- Expected versus actual cash
- Shortage/overage calculation
- Shift history and summary
- Recovery from interrupted shift closure

Test simultaneous shift opening from multiple devices.

### F. Product, Menu & Pricing

Verify:

- Product/category CRUD
- SKU/barcode
- Product variants
- Modifiers/add-ons
- Pricing and cost
- Tax configuration
- Discounts and promotions
- Product availability
- Branch-based availability
- Menu synchronization
- Historical price preservation on completed sales

Test invalid products, unavailable items, stale prices, and price changes during an active order.

### G. Restaurant Order Management

Evaluate realistic dine-in and takeaway operations.

Verify:

- Create order
- Add/remove item
- Modify quantity
- Select modifiers
- Add customer instructions
- Hold/resume order
- Confirm order
- Order status transitions
- Cancel order
- Void item/order
- Order totals
- Table and waiter assignment where supported
- Kitchen workflow where supported
- Concurrent edits
- Reconnection/recovery

Check for lost updates, duplicate orders, incorrect status changes, and inconsistent totals.

### H. Payments and Sales

Verify:

- Cash payment
- Supported non-cash tenders
- Split/mixed payments where required
- Payment confirmation
- Payment failure handling
- Duplicate submission prevention
- Sale finalization
- Payment-to-sale reconciliation
- Correct change calculation
- Payment references
- Transaction persistence
- Refund linkage to original transaction

Do not assume an integrated payment gateway exists.

Verify only implemented payment providers and separately identify missing customer-required integrations.

Ensure a transaction cannot become paid without valid business and payment authorization.

### I. Refunds, Voids & Discounts

Verify:

- Item void
- Order void
- Transaction void where applicable
- Partial/full refund
- Original sale validation
- Refund reason
- Manager approval
- Role/permission checks
- Duplicate refund prevention
- Refund amount limits
- Multi-tender refund allocation
- Audit history
- Correct sales and tax adjustments

Test concurrent refunds and repeated API requests.

### J. Cash Drawer & Reconciliation

Verify the following:

Expected Cash = Opening Float + Cash Sales + Cash In - Cash Out - Cash Refunds

Adjust this formula to reflect the system's actual accounting rules, including any additional cash movements.

Validate:

- Correct cash movement direction
- No duplicate cash ledger entries
- Shift reconciliation
- Drawer adjustments
- Cash discrepancy reporting
- Audit history

### K. Receipt Management

Verify:

- Unique receipt numbering
- Company/branch/terminal information
- Items, tax, discounts, and payment details
- Receipt generation
- Receipt reprint
- Refund/void representation
- Printer or export behavior where supported
- Correct receipt totals
- Historical receipts remain accurate after configuration or product changes

Identify applicable local statutory receipt requirements separately for legal confirmation.

### L. Reports & Analytics

Verify:

- Daily sales
- Sales by branch
- Sales by terminal
- Sales by staff
- Payment breakdown
- Refund/void reporting
- Shift performance
- Cash variance
- Product performance
- Tax summary
- Date and timezone filters
- Multi-company isolation

Recalculate key report figures independently from transaction records.

Do not trust reports solely because they load without error.

### M. Inventory & Promotions

Verify:

- Company and branch scoping
- Stock adjustment
- Stock movement tracking
- Sale-to-inventory integration where implemented
- Returns/restocking policy
- Product availability
- Promotion eligibility
- Promotion expiry
- Duplicate discount prevention
- Cross-company isolation

Pay special attention to company_id and branch_id enforcement throughout all queries and database policies.

### N. Audit Logs

Verify that sensitive operations record:

- Actor
- Action
- Timestamp
- Company
- Branch/terminal where applicable
- Target record
- Relevant before/after values
- Authorization or approval reference

Check resistance to tampering and unauthorized modification.

Never store plaintext PINs, tokens, passwords, or unnecessary sensitive information in audit events.

---

## 6. REAL CUSTOMER END-TO-END ACCEPTANCE TESTING

Simulate the complete customer lifecycle.

Scenario 1 — New Restaurant Setup

1. Create Company A.
2. Configure tax, currency, and receipt settings.
3. Create an active branch.
4. Create a terminal.
5. Generate terminal activation code.
6. Bind a POS device.
7. Create staff and assign permissions.
8. Configure product menu.
9. Log in using authorized staff.
10. Open a shift.
11. Perform first sale.
12. Accept payment.
13. Generate receipt.
14. Close shift.
15. Reconcile cash.
16. Review sales reports.

Expected: A real customer can complete daily operations without manual database intervention.

Scenario 2 — Busy Restaurant

Simulate multiple staff, terminals, concurrent orders, simultaneous payments, and manager approvals.

Expected: Correct data, consistent order states, and no unauthorized activity.

Scenario 3 — Network Failure

Test application behavior during:

- Internet disconnection
- Request timeout
- Lost API response
- Reconnection
- Browser refresh
- Repeated payment submission

Identify whether offline functionality is supported, required, or missing.

Never falsely claim offline support based on cached pages.

Scenario 4 — Multiple Companies

Create Company A and Company B.

Attempt unauthorized reads and writes between them across every module.

Expected: Strict tenant isolation.

Scenario 5 — Staff Termination

Deactivate a staff member with active sessions.

Expected: Access is revoked consistently across backend and supported devices.

Scenario 6 — Device Replacement

Revoke a registered device and activate its replacement.

Expected: Old device access is invalidated without losing transaction history.

Scenario 7 — Financial Correction

Perform a completed sale followed by an authorized partial/full refund.

Expected: Payments, sales, cash ledger, receipt history, reporting, and audit records reconcile.

Scenario 8 — End-of-Day Closing

Simulate all normal payments, refunds, voids, cash adjustments, and shift closure.

Expected: Financial reporting accurately represents real business activity.

Scenario 9 — Three Devices, One Restaurant Service

Keep separate cashier, kitchen and waiter sessions active at the same time. A waiter creates an order on the waiter device; the kitchen receives and prepares it on its device; the waiter serves it; the cashier collects payment on the cashier device. Repeat with another item round, early payment, a disconnected client and a denied actor. Follow section 23 for session isolation, drawer attribution and evidence requirements.

Expected: Authorized branch staff collaborate on the same order while retaining their own device/session identities, role permissions and audit attribution. This scenario must not be replaced with sequential role switching on a single terminal.

Add more customer scenarios based on actual supported modules and documented requirements.

---

## 7. DEEP SECURITY AUDIT

Check:

- Tenant isolation
- Row Level Security
- Authentication
- Authorization
- Privilege escalation
- Role modification
- Company context manipulation
- Staff PIN protection
- Session revocation
- Activation token security
- Backend authorization
- Database function security
- Privileged service credentials
- Webhook authentication
- Replay attacks
- Idempotency
- Input validation
- Exposure of secrets
- Sensitive information logging

Investigate these high-risk categories using current source and environment evidence. Earlier reports are leads; reproduce current defects and reverify any claimed fixes:

1. Company administrators modifying globally shared role permissions.
2. Inventory leakage between companies.
3. Branchless promotions exposing another company's information.
4. Unauthorized company/branch context changes.
5. Improper manager approval enforcement.
6. Unsafe mixed-tender refunds.
7. Financial/reporting inconsistencies.
8. Unauthenticated or forged payment webhook processing.

Use non-destructive tests and isolated test tenants.

Do not access real customer data outside authorized test scope.

---

## 8. DATABASE & FINANCIAL INTEGRITY AUDIT

Inspect:

- Foreign key relationships
- Unique constraints
- Check constraints
- Nullability
- Transaction boundaries
- Database triggers
- RPC logic
- Referential integrity
- Company scoping
- Shift/sale/payment relationships
- Decimal precision
- Idempotency keys
- Reconciliation consistency
- Concurrency handling

Test:

- Double-click payment
- Simultaneous sale completion
- Concurrent refunds
- Duplicate activation
- Duplicate receipt creation
- Transaction rollback
- Database timeout
- Partial failure
- Retried webhooks
- Interrupted shift closure

Every financial transaction must either complete consistently or recover safely.

Highlight any partial-write condition that can result in missing money, duplicate payment, lost sales, or incorrect reports.

---

## 9. FRONTEND AND USER EXPERIENCE AUDIT

Inspect every route and main user operation.

Evaluate:

- Navigation
- Loading states
- Error messages
- Form validation
- Role-specific access
- Responsive layouts
- POS touchscreen usability
- Order entry speed
- Button reliability
- Confirmation prompts
- Recovery from failed actions
- Browser refresh behavior
- Session expiry
- Empty states
- Accessibility
- Workflow consistency

Identify buttons that appear functional but do nothing.

Identify pages that only show mock or hardcoded data.

A customer must not need developer assistance to complete normal operations.

---

## 10. PERFORMANCE, RELIABILITY & DEPLOYMENT READINESS

Review and test where environment access permits:

- Database query performance
- Indexes and pagination
- Large product catalog
- Large transaction history
- Multiple concurrent terminals
- Race conditions
- Browser memory usage
- API error handling
- Logging and monitoring
- Backup and restore readiness
- Recovery procedures
- Configuration security
- Deployment and rollback
- Data migrations
- Production secrets handling
- Environment separation

Do not invent performance numbers or claim load-test success without executing a measurable test.

Define realistic capacity targets based on customer branch count, terminal count, and transaction volume.

---

## 11. AUDIT EXECUTION RULES

Start with discovery in both audit and remediation modes. Apply the authorization boundaries in section 0.

Phase 1: Discovery  
Phase 2: Requirements Analysis  
Phase 3: Static Code Review  
Phase 4: Backend and Database Verification  
Phase 5: Frontend Workflow Verification  
Phase 6: Integration Testing  
Phase 7: Security Testing  
Phase 8: Financial and Concurrency Testing  
Phase 9: Customer Acceptance Testing  
Phase 10: Final Readiness Assessment

Mandatory rules:

1. In AUDIT_ONLY, do not change application behavior. In AUDIT_AND_REMEDIATE, make the smallest safe authorized change after inspecting the relevant source, migrations, tests, and current diff.
2. Preserve customer data and financial history. Inspect cleanup before running tests; do not disable RLS, triggers, constraints, or append-only audit protections to simplify fixtures.
3. Do not apply migrations to a shared environment without explicit authorization for that target. Prepared local migration files are not a deployed database change.
4. Do not clear or reset real financial transactions.
5. Use isolated test data and authorized test environments.
6. Record all commands, environment names, and tests executed.
7. Keep secrets and customer data out of generated reports.
8. Use the four verification labels in section 4, tied to executed evidence and scope. A green process exit alone is insufficient.
9. Do not claim browser testing unless a browser session was actually executed.
10. Do not claim database security was verified solely from frontend behavior.
11. Clearly identify environment restrictions and blocked tests.
12. Follow the selected mode and existing authorization. In AUDIT_ONLY, obtain authorization before behavior changes. In AUDIT_AND_REMEDIATE, proceed with authorized local fixes and escalate only actions or business decisions outside that scope.
13. Group findings by module and severity.
14. Continue through all modules rather than stopping at the first bug.
15. Recheck existing test coverage and identify missing regression tests.

---

## 12. BUG CLASSIFICATION

Classify findings as:

CRITICAL:
- Cross-company data access
- Unauthorized financial actions
- Lost or duplicated financial transactions
- Privilege escalation
- Severe database integrity violations

HIGH:
- Core POS sales flow broken
- Shift cannot close
- Refund handling incorrect
- Important business operations blocked
- Major security weaknesses

MEDIUM:
- Partial feature failure
- Incorrect validation
- Recoverable operational errors
- Reporting edge cases
- Important usability problems

LOW:
- Cosmetic issues
- Minor workflow inconsistencies
- Non-blocking user experience improvements

Assign a unique ISSUE ID to each finding.

Keep impact severity separate from remediation priority and verification. A suspected critical defect from static review is a critical risk with execution NOT VERIFIED; it is not a reproduced exploit. Record affected requirements, valid reproduction prerequisites, observed and expected results, environment, scope of impact, root cause confidence, owner, remediation dependencies and retest evidence. Preserve issue history through identified, reproduced, fixed locally, verified locally, deployed and verified on the release target; local repair alone does not close a deployment finding.

---

## 13. REQUIRED DELIVERABLES

Produce the following reports.

### Report A — System Architecture & Inventory

Show what exists, where it is implemented, and the status of each module.

### Report B — Customer Requirement Traceability Matrix

Compare every confirmed requirement against implemented behavior and evidence.

### Report C — Functional Gap Analysis

Identify missing, incomplete, disconnected, and incorrectly implemented features.

### Report D — Security & Database Integrity Assessment

Explain risks, affected components, reproduction steps, impact, and proposed remediation.

### Report E — Real-World POS Acceptance Tests

Show each business scenario, expected result, actual result, evidence, and test status.

### Report F — Bug & Technical Debt Register

Use this structure:

| ID | Module | Severity | Issue | Evidence | Root Cause | Recommended Fix | Retest |
|---|---|---|---|---|---|---|---|

### Report G — Implementation Roadmap

Separate the work into:

P0 — Production blockers  
P1 — Customer go-live requirements  
P2 — Important improvements  
P3 — Optional future development

For every item include:

- Business impact
- Technical approach
- Dependencies
- Recommended test coverage
- Acceptance criteria
- Estimated effort range with assumptions

### Report H — Final Customer Delivery Decision

Present the following independent conclusions:

1. Customer Requirement Compliance
2. Functional Completeness
3. Security Readiness
4. Financial Integrity
5. Operational Readiness
6. Deployment Readiness

Use VERIFIED PASS, VERIFIED FAIL, PARTIALLY VERIFIED, or NOT VERIFIED for each, with the tested scope and unresolved criteria.

Then issue the applicable UAT decision and a separate production decision, using section 22. Available decision labels include:

- READY FOR CUSTOMER UAT
- CONDITIONALLY READY FOR CUSTOMER UAT
- NOT READY FOR CUSTOMER UAT
- CUSTOMER UAT PASSED — READY FOR GO-LIVE REVIEW
- NOT READY FOR PRODUCTION

Do not equate internal testing with actual customer sign-off.

If customer acceptance requirements are missing, state that customer contract compliance cannot yet be determined.

---

## 14. PROJECT TRACKING AND OUTPUT

Save audit outputs inside a clearly named project audit folder, for example:

docs/audits/pos-customer-readiness/

Generate:

- system-inventory.md
- requirements-traceability.md
- functional-gap-analysis.md
- security-assessment.md
- financial-integrity-assessment.md
- uat-test-cases.md
- issue-register.md
- remediation-roadmap.md
- final-readiness-report.md
- audit-checklist.md
- evidence-register.md
- environment-and-migration-state.md
- decision-register.md
- fixture-register.md
- discovery-coverage.md
- multi-device-acceptance.md

Create a master audit checklist so progress can be tracked across all modules.

For each module report:

- What was inspected
- What was tested
- What passed
- What failed
- What remains unverified
- Relevant source code locations
- Relevant test evidence
- Missing customer requirements
- Recommended next actions

After each audit phase, update the checklist and continue according to the plan.

Do not erase unresolved findings between phases.

---

## 15. FINAL OBJECTIVE

I do not want a superficial summary claiming that the POS system is mostly complete.

I want an evidence-based assessment answering:

1. What features does my POS system actually have?
2. Which features are fully functional?
3. Which customer requirements are satisfied?
4. Which requirements are missing?
5. Which features exist but are not properly connected?
6. Which workflows will fail in real restaurant operations?
7. Are sales, payments, cash balances, and reports financially consistent?
8. Can one company access another company's information?
9. Is the POS safe to deploy to an actual customer?
10. What must my development team fix before customer acceptance?

Begin with full repository discovery and produce the System Inventory and initial Requirements Traceability Matrix.

Then execute the remaining audit phases systematically.

Apply the execution mode and authorization in section 0. In remediation mode, finish the authorized integration and verification work before reporting completion.

**SUCCESS CRITERION: Every readiness claim is traceable to a requirement, source implementation, executed test, environment, and recorded result. Production readiness also requires the release gates and actual customer sign-off described below.**

---

## 16. PROJECT-SPECIFIC DISCOVERY BASELINE

The following is a source orientation prepared on 2026-10-12 for Syok Syok, whose local package version was `0.6.0`. It is not a statement that these features are deployed or fully working. Refresh this baseline at the start of each execution.

### A. Architecture and current limitations

- One React/Vite application provides admin, POS, kitchen, and serving screens. Admin navigation uses `#admin/...`; POS entry includes `/pos/setup` and `/pos/login`. Inspect the internal screen state as well as URL routes.
- The main dependency chain is components → hooks → services → repositories → Supabase/Edge Functions → PostgreSQL. Some repositories call PostgREST or RPCs directly. Trace all paths; do not assume every operation passes through an Edge Function.
- Supabase Auth, `profiles`, canonical `staff` records, PIN credentials, device assignments, and `terminal_staff_sessions` coexist. `staff.legacy_profile_id` bridges historical actors, roles, assignments, and financial foreign keys. Complete Auth-free staff separation is not established.
- Recent POS entry code uses anonymous Supabase Auth during device activation/resume and supplies device proof for operational requests. Inspect legacy terminal account binding as an additional path. Distinguish an unauthenticated request from a signed-in anonymous Auth user; an Auth token alone does not establish a registered device or an authorized staff session.
- The browser stores a device credential and sends `x-pos-device-credential`. A device identifier is not proof of device possession. Inspect credential lifecycle, browser storage exposure, logout/lock behavior, refresh, and revocation without printing credentials.
- Cash and QR have manual provider implementations. CARD/EWALLET have a configurable external adapter. Capability flags, UI labels, and configuration variables do not demonstrate gateway readiness. Verify endpoint, credentials availability without disclosure, currency, provider contract, settlement, and failure handling in an authorized sandbox.
- E-invoice code includes MyInvois-related integration. Its presence is not evidence of a working integration or statutory compliance.
- A server-authoritative order/payment model exists. Map business terms such as sale, bill, ticket, payment, receipt, and refund to actual entities before adding tables or changing lifecycle rules.
- The repository has substantial existing uncommitted changes and forward migrations. Preserve them and record their provenance. A dirty-worktree result cannot be represented as a result for the Git commit alone.

### B. Implementation entry points

Use this table to begin tracing; extend it with exact functions, migration versions, and line references during discovery.

| Area | Existing entry points | Required connection to trace |
|---|---|---|
| App and authorization state | `src/app/App.jsx`, `src/hooks/useAuthSession.js`, `src/hooks/usePermissions.ts`, `src/infrastructure/supabase/functionsClient.js` | Auth refresh, device proof, effective staff permissions, locked sessions, route restoration |
| Admin navigation | `src/components/admin/AdminShell.jsx` | Every menu entry, permission, direct navigation, and backend operation |
| Company and branch | `src/components/admin/OrganizationManagement.jsx`, `src/repositories/organization.repository.js` | Tenant settings, branch revisions, product provisioning, access and inactive-state restrictions |
| Terminal and device | `src/components/admin/TerminalManagement.jsx`, `src/components/TerminalSetupScreen.jsx`, `src/services/terminal-context.service.js`, `supabase/functions/terminal-account-binding/index.ts` | Creation, activation, proof, access modes, branch reassignment, replacement, historical identity |
| Staff and roles | `src/components/admin/UserManagement.jsx`, `src/components/admin/StaffAssignmentPanel.jsx`, `src/components/admin/RolePermissions.jsx`, `supabase/functions/admin-users/index.ts`, `supabase/functions/staff-pin-session/index.ts` | Staff/profile mapping, branch access, PIN setup/reset, role changes, session revocation |
| Shifts and drawer | `src/components/CashShiftScreen.jsx`, `src/components/admin/CashShiftManagement.jsx` | Terminal ownership, handover, cashier attribution, cash movements, force close and reporting |
| Catalog and menu | `src/components/ProductManagementScreen.jsx`, `src/repositories/product.repository.ts`, `src/services/product-cache.service.ts`, `supabase/functions/products/index.ts` | Company products, branch availability, authoritative pricing, options and cache invalidation |
| Orders and checkout | `src/hooks/useCheckout.js`, `src/repositories/order.repository.ts`, `supabase/functions/orders/index.ts` | Draft recovery, append items, discounts, fulfillment and financial state |
| Tables, kitchen and serving | `src/components/TableManagementScreen.jsx`, `src/components/KitchenScreen.jsx`, `src/components/ReadyToServeScreen.jsx`, `supabase/functions/tables/index.ts` | Claim/move/clean tables, dispatch batches, preparation, serve and takeaway completion |
| Payments and receipts | `src/components/PaymentScreen.jsx`, `src/components/SplitBillScreen.jsx`, `src/components/admin/AdminPayments.jsx`, `src/components/admin/AdminReceipts.jsx`, `supabase/functions/payments/index.ts` | Partial settlement, tender allocation, finalization, immutable receipts and financial corrections |
| Gateway and callbacks | `supabase/functions/_shared/paymentProviders.ts`, `supabase/functions/payment-webhooks/index.ts` | Manual versus online confirmation, unknown outcomes, callback authenticity and accounting effect |
| Inventory | `src/pages/admin/InventoryManagementPage.tsx`, `src/repositories/inventory.repository.ts`, `src/components/admin/RefundStockReturn.jsx` | Settlement deduction, transfer, optimistic revision, refund stock returns and attribution |
| Discounts and vouchers | `src/components/admin/PromotionManagement.jsx`, `src/components/admin/VoucherManagement.jsx`, `src/services/discount.service.js`, `src/features/vouchers` | Branchless tenant scope, eligibility, usage limits, manager PIN and retries |
| Reports and audit | `src/features/reports/config/reportDefinitions.js`, `src/features/reports/repositories/reportRepository.js`, `src/components/admin/AuditLogs.jsx` | Independent totals, tender/refund attribution, exports, business date and append-only events |
| Operational settings and health | `src/pages/admin/SystemAdministrationPage.tsx`, `src/repositories/systemSettings.repository.ts`, `supabase/functions/system-health/index.ts` | Company versus platform settings, printers, kitchen stations, numbering, integration secrets |
| E-invoice | `src/features/einvoice`, `supabase/functions/einvoice-submit/index.ts`, `supabase/functions/_shared/myinvois.ts` | Tenant credentials, snapshots, submission, rejection, retries and provider status |
| Deployment | `supabase/config.toml`, `vite.config.js`, `worker.js`, `wrangler.toml`, `package.json` | Frontend, database, Edge Functions, and secret configuration as separate release components |

Cover additional discovered areas such as QR configuration, payment methods, voucher activity, product images, receipt exports, language settings, and operational health. Classify customer/supplier management, purchasing, reservations, loyalty, recipe costing, delivery integrations, and offline selling by agreed scope; do not assume they exist or automatically make them contractual blockers.

### C. Migration and documentation reconciliation

1. Read `supabase/migrations` in version order. For each critical function, follow subsequent replacements, overloads, dynamic `pg_get_functiondef` rewrites, grants, triggers, and policies to the final effective definition.
2. Compare source migration versions with the selected database ledger, then inspect effective definitions read-only where available. Matching version lists do not prove matching SQL contents or absence of manual drift.
3. Record duplicate versions, missing local files, unapplied migrations, and edits to previously applied files. The existing dirty diff includes an older reset migration; do not silently replay, edit, or treat it as a fresh forward fix.
4. Inspect `AUTH_FLOW.md`, `KNOWN_ISSUES.md`, `PRODUCTION_READINESS.md`, and dated reports under `docs`. Resolve contradictions using current code and executed evidence. A newer report alone does not close an older finding.
5. Revisit earlier findings about global operational settings/equipment, mixed-tender refunds, storage mutation ownership, staff approval attribution, webhooks, and backend idle expiry. Some have later migrations; record current reproduction and scope rather than copying old verdicts.

### D. Existing test coverage and execution hazards

- `npm run test:system-local` is the consolidated local runner. It validates the target, runs contract/deterministic checks, selected authenticated database and browser/API checks, a database integrity audit, shift concurrency, lint, and a local build. It does not execute every script in the repository.
- A local run on 2026-10-12 at 21:32–21:33 Asia/Kuala_Lumpur completed 32 checks with VERIFIED PASS for the selected suite. Overall coverage was PARTIALLY VERIFIED. Its recorded report is `test-results/system-local/2026-10-12T13-32-43-863Z.md`; reports are Git-ignored and may not exist in another checkout. Use the timestamped JSON for diagnostic detail. `latest` is mutable and is not a permanent reference. This prior result does not certify later code changes or a deployment.
- `scripts/test-complete-branch-journey-local.mjs` combines browser device activation/PIN setup with subsequent API/RPC operations. Inspect each step before describing it as browser coverage. It is not proof that the full sale-to-close UI journey was exercised.
- That journey script uses one terminal and switches staff roles sequentially. Its result cannot establish simultaneous cashier, kitchen and waiter device interoperability. Include the separate-browser scenario in section 23 before accepting that requirement.
- `scripts/test-financial-concurrency-local.mjs`, `scripts/test-financial-tenant-boundary-local.mjs`, and `scripts/test-financial-exception-actor-local.sql` are additional targeted checks. Their presence does not mean the consolidated suite executed them.
- Some local scripts commit financial fixtures and retire test branches/actors while retaining history. Others roll back SQL fixtures or remove temporary identities. Read setup and `finally` blocks before execution; document retained records and cleanup failures.
- Some browser checks mock response details or error states. Record real and mocked steps separately. A rendered mock response cannot establish backend integration.
- `playwright.config.js` can launch Vite in staging mode by default. Verify the actual browser backend before credentials or mutations, even when the frontend URL uses localhost.
- Inspect `package.json` for available checks. Do not report TypeScript validation from Vite bundling or invent a passing type-check command when no such gate was executed.

---

## 17. AUTHORIZATION AND TENANT ATTACK MATRIX

For every sensitive resource and action, test the authorized actor, the denied actor, and the persistent outcome. Use an eligible fixture so a denial is not accidentally caused by an unrelated inactive record or malformed request.

### A. Actors and session states

Cover unauthenticated access; a signed-in unbound terminal identity; a registered terminal with missing/wrong/revoked device proof; a valid device with no staff session; cashier, waiter, kitchen, manager, and company admin; another branch in the same company; another company; inactive staff; removed branch access; revoked role permission; locked/ended staff session; and expired Auth credentials. Test platform authority only if implemented and explicitly in scope.

The same device Auth identity and staff identity must remain distinguishable in requests, permissions, history, and audit. Verify `staff`, its legacy profile mapping, and branch/role assignments remain consistent when staff are deactivated or changed.

### B. Access paths and denial assertions

- Test Edge endpoints, direct Data API reads/writes, callable RPCs and overloads, views, exports, Storage operations, and Realtime subscriptions where exposed. Success through one route does not prove that alternate routes are protected.
- Derive company, branch, terminal, staff, approver, shift, and currency context from trusted server state. Attempt foreign IDs, mixed-company parent/child IDs, spoofed body fields, and nullable/branchless records.
- Test tenant reassignment through profile updates, role/permission administration, staff assignment, nested inserts, upserts, bulk operations, and update `WITH CHECK` policies. A tenant ID in a row does not itself enforce isolation.
- Inspect `SECURITY DEFINER` ownership, execute grants including PUBLIC/anon/authenticated, safe schema resolution, helpers accepting composite rows, and bypass behavior. Include `USING`, `WITH CHECK`, restrictive/permissive policy combinations, and invoker/definer views.
- Use real scoped credentials for authorization tests. A controlled service role may create fixtures or inspect postconditions; its successful business operation is not proof of end-user authorization. SQL tests must set the intended role and request context explicitly and report that they are database simulations.
- For a denied mutation, verify no order, payment, ledger, stock, approval, receipt, or business-state change occurred. An intended denial audit may be appended. For denied reads, verify that rows, counts, names, export content, and subscription payloads reveal no unauthorized data.
- Test ordinary allowed operations beside negative cases, preventing a system that denies everyone from appearing secure.
- Treat empty/all-null composite session responses as no session; test that a non-null object with a null session ID cannot authorize a request.
- After revocation or permission changes, retry with previously issued credentials, open browser tabs, cached permissions, and active Realtime subscriptions. Inspect both server rejection and UI recovery.

### C. PIN, approval, session and secret handling

Verify secure PIN hashing, temporary PIN onboarding, reset, attempt throttling, lockout, active-session effects, and supported unlock paths. Do not assume a client idle timer is server-side idle expiry. If expiry is required, establish the activity heartbeat and long-running transaction policy before implementation.

Manager approval must bind the requester, approver, action, target, amount/discount limits, company, branch, expiry where supported, and replay behavior. Test invalid PIN, locked/inactive/out-of-scope approver, changed order amount, approval reuse for another action, concurrent approval requests, and separation of requester/approver where required. Preserve the cashier session and ensure approval cannot grant lasting manager privileges.

Inspect browser storage, HTML injection, content security policy, logs, monitoring, screenshots and build artifacts for credential exposure. Never print or store raw secrets while investigating. Capture Supabase start/status output privately and emit only safe service URLs and readiness fields; those commands can include privileged keys and database credentials. Use test PINs and credentials only through controlled runtime tooling.

### D. Shared configuration and integration boundaries

Inventory which settings are genuinely platform-wide and which belong to a company, branch, terminal or printer. Trace tax, branding, QR destinations, numbering, kitchen routing, integrations, and defaults to their consumers. A company administrator must not gain platform authority through a shared settings endpoint.

For public product/logo/QR assets, distinguish intended public delivery from tenant-restricted mutation. Verify path and ownership enforcement for upload, replacement and deletion, plus legacy assets without ownership. For Realtime, inspect publication and subscription behavior with two real tenant sessions; static RLS review alone is insufficient.

---

## 18. FINANCIAL INVARIANTS AND CONCURRENT RECOVERY

Define the accounting policy before constructing expected values. Distinguish order cancellation, line void, payment void, refund, stock return, and physical cash movement. They are different events and must not be collapsed into one status or deletion.

### A. Independent accounting oracle

- Use integer minor units or exact decimal arithmetic to calculate expected values independently from the functions under test. Establish currency scale, tax-inclusive/exclusive policy, service charge, discount ordering, line/order rounding and cash rounding from configuration and confirmed requirements.
- Reconcile gross item/option quantities, discounts, taxable base, tax, service charge, final order value, completed tenders, outstanding balance, cash tender/change, refunds and payment reversals. Define whether a reversal reopens an outstanding balance and test the actual approved lifecycle.
- Record numeric expected and observed values with a justified rounding rule. Do not merely compare two reports that call the same underlying query.
- Reconcile each tender and the order total. Cumulative refund allocations must not exceed each eligible original tender or total refundable value. Include concurrent partial refunds and repeated item refund requests.
- Reconcile drawer cash using one explicit event model: opening cash plus cash collected minus change, plus cash-in minus cash-out and actual cash refunds/reversals. If cash sales are already net of change, do not deduct change twice. If refunds/voids already produce cash-out ledger events, do not subtract them twice.
- Test corrections after the original shift is closed, in a later shift, and by another authorized terminal. Identify which drawer physically pays the refund and retain the original sale attribution. Ask for policy where this is unspecified.
- Reconcile reports across gross sales, net sales, tax, tenders, refunds, voids, outstanding orders, and cash differences; joining multiple items and payments must not multiply totals.

### B. Required idempotency and race cases

For each operation below, exercise the same request/key repeatedly, the same key with a different payload, different keys competing for the same business action, and replay by another tenant or revoked actor where applicable.

| Operation | Required persistent outcome |
|---|---|
| Terminal activation | At most one consumption and valid binding under the defined device policy; no usable old credential after replacement |
| Shift open | No duplicate open shift within the approved uniqueness scope |
| Order create / append / kitchen dispatch | One intended order or batch; prior kitchen items are not resubmitted |
| Manual discount or voucher redemption | One authorized adjustment/redemption; correct remaining usage and audit attribution |
| Cash/manual QR/online settlement | No excess collection or duplicate acceptance; correct payment, receipt, stock and cash effects |
| Split bill / mixed tenders | Every allocated item/amount settles at most once; total allocations equal the approved bill basis |
| Refund or payment void | One eligible correction and appropriate ledger/stock effect; no over-refund or foreign replay disclosure |
| Receipt and business numbering | Unique numbers in the configured scope; retries return the same logical result; printer failure cannot trigger another charge |
| Inventory adjustment / transfer / return | No duplicate movement, no lost concurrent update, and balanced transfer quantities |
| Shift close | One stable closure and close event; defined outcome when close races with payment, refund or cash movement |

Use independent database connections or real concurrent HTTP calls and record the competing operations. Assert persisted cardinalities and balances after completion. Sequential repeats alone are not concurrency coverage. Inspect transaction boundaries, row/advisory locks, unique constraints, deadlocks and retry handling rather than assuming any lock guarantees correctness.

### C. Failure boundaries and payment providers

Test timeouts and lost responses before commit, after commit, and during provider confirmation. Recovery must query or reconcile the existing attempt before starting another charge. A timeout is not proof that a payment failed.

Verify signed callbacks against the raw body and provider contract, event identity, amount, currency, transaction reference, merchant/tenant ownership, duplicates, modified duplicate payloads, stale/out-of-order events and unknown references. An event saved to `payment_gateway_events` is not proof that the order, payment, receipt and drawer were updated correctly. State exactly whether the implementation records events, applies them, or requires reconciliation.

Do not assume a database transaction can roll back an external charge. Where an external side effect succeeds and local persistence fails, require a recoverable pending/reconciliation state and an idempotent completion procedure. Test this in an authorized provider sandbox or controlled local adapter and label the evidence accordingly.

For manual QR, verify who can confirm, how the amount/reference/provider and confirming staff are recorded, how confirmation is replayed safely, and how mismatches are reconciled. A generated QR code or successful manual confirmation API call does not establish that money arrived in a bank account.

### D. Stock and historical integrity

Determine when tracked inventory is deducted: order submission, fulfillment, or settlement. Test that partial payments, repeat settlement, canceled drafts and failed transactions follow that policy exactly once. Preserve movement history and tenant/branch attribution.

A financial refund does not automatically imply a physical restock. Test explicit stock return quantities, cumulative limits, untracked products, damaged goods, mixed item returns and transfers. Decide negative-stock behavior from customer policy; do not weaken constraints to satisfy a sale test.

Preserve historical item names, prices, options, tax, receipt business details and transaction references after product/settings changes. Corrections must be represented by linked events, not rewritten completed history.

---

## 19. RESTAURANT OPERATIONS AND CUSTOMER DECISIONS

In addition to the original eight scenarios, execute these when applicable to the agreed scope. Express each as Given/When/Then with actor, branch, terminal, initial state, expected UI/API response, database postconditions and evidence IDs.

| Scenario | Acceptance focus |
|---|---|
| New branch provisioned under an existing company | Authorized staff access, company catalog/branch availability, correct tax/defaults and unique numbering without SQL intervention |
| Two waiters open the same table simultaneously | One allowed occupancy outcome, no lost order, meaningful conflict/reload behavior |
| Add another round after kitchen dispatch | New batch contains only additions; existing preparation and amounts are preserved |
| Move an occupied table or select an already occupied destination | Atomic table/order association, source/destination consistency, no branch crossover |
| Pay before food is served | Payment and fulfillment remain distinct; paid food is still visible to kitchen/serving until fulfilled |
| Fulfill takeaway and return a table to service | Correct packing/served actor, completion, cleaning and release without premature reuse |
| Switch staff during an open drawer session | Defined drawer ownership, new operator permissions, and correct per-action cashier attribution |
| Lock terminal, reset PIN, or remove branch access while a cart/payment is open | Backend denial where required, safe recovery, no cached unauthorized submission or loss of committed money |
| Refresh/back navigation/multiple tabs during checkout | Tenant/staff-scoped draft restoration, stable idempotency keys, consistent server state and no duplicated charge |
| Disconnect and reconnect kitchen/POS clients | Refetch authoritative state, recover missed events, prevent duplicated batches/payments and stale cross-tenant cache use |
| Close at midnight or across a business-day cutoff | Branch timezone and business date filters agree across UI, reports, exports and receipts |
| Printer unavailable after payment acceptance | Payment remains settled; reprint uses original receipt identity and creates the required audit event |
| Rename/deactivate a product, branch or staff member with history | Operational restrictions apply while financial and audit history remains readable and attributable |
| Export reports with multiple tenders/refunds | Visible report and export totals agree, filters are scoped, spreadsheet formula injection is handled where relevant |
| Retry e-invoice submission after timeout/rejection | Stable document identity, accurate immutable transaction snapshot, no duplicate external document and actionable status |

Inspect touchscreen targets, on-screen keyboard, focus, long lists, localization, accessibility and error recovery on the actual supported viewport/device. A browser print dialog does not establish physical thermal printing, cash drawer or other hardware support.

For the new-restaurant scenario, distinguish one-time platform provisioning from actions the customer administrator must perform. A test that inserts company, catalog, table or staff rows with a service role verifies fixture setup, not the corresponding onboarding UI. Exercise the supported administration journey for any claim that onboarding needs no developer intervention.

Create a decision register only for unresolved business choices. Each entry needs the affected requirements, observed behavior, alternatives, recommended choice with rationale, decision owner and impact of delay. Typical topics include:

- Terminal versus staff ownership of a shift; simultaneous cashier sessions and handover.
- Refund tender allocation, later-day refunds, cross-terminal cash payout and required approval limits.
- Table release versus payment/fulfillment timing, split-by-item versus split-by-amount and bill merging.
- Receipt/numbering scope, business-day cutoff, tax/service charge and cash rounding.
- Negative stock, restocking damaged goods, shared catalog versus branch-owned products.
- Online-only operations versus explicitly required offline selling and synchronization rules.
- Supported languages, printers/devices, branch/terminal counts and realistic load targets.

Check existing requirements first. Do not ask questions already answered by the repository or user. Treat unconfirmed industry expectations as proposals. For Malaysia-specific tax, SST, receipt, privacy or MyInvois obligations, separate technical observations from legal/accounting confirmation; verify current official requirements when executing that portion of an audit and cite sources with their date.

---

## 20. EVIDENCE, FIXTURE SAFETY AND AUDIT CONTINUITY

### A. Evidence register

Use stable IDs such as `REQ-PAY-001`, `TC-PAY-001`, `EVID-001`, `ISSUE-PAY-001`, and `DEC-001`. Every test record must include:

1. Requirement and exact acceptance criterion, with requirement origin.
2. Source revision plus relevant dirty-file fingerprints; package version, database migration state, and deployed Edge/frontend identity when known.
3. Environment, safe target URLs, actor role and fixture identifiers without credentials or unnecessary personal data.
4. Exact reproducible command or browser steps, prerequisites, time with timezone, expected and actual result, exit code where applicable, and verification label.
5. Evidence links: redacted assertions/output, relevant screenshots, requests/responses, and persistent-state observations.
6. Coverage type: static review, deterministic unit/contract, SQL role simulation, authenticated API/RPC, browser UI, hardware, or external-provider sandbox. State any mocked steps.
7. Cleanup result and retained financial/audit fixtures; remaining limits and linked issue IDs.

Preserve failed observations and subsequent retests. Do not overwrite an issue's history with a final green result. Reusing earlier evidence requires matching code, environment, migration/config state, scope and traceability; otherwise label it historical and rerun the necessary check.

### B. Test-data safeguards

- Use dedicated tenant/branch/test identifiers and a unique run ID. Prefer rollback fixtures for database assertions where feasible.
- Inspect prerequisite assumptions, default credentials/URLs, committed writes, cleanup and external integrations before executing an unfamiliar script. Do not invoke a script merely because its filename says “local”.
- Never reset the active local database just to obtain clean data when it contains the user's work. A fresh disposable database may be used for migration-chain testing, with its target and data ownership recorded.
- Keep service-role access limited to controlled setup/observation/cleanup. Business assertions use the intended actor and device context.
- Run suites sequentially if they share fixture identifiers or state. Parallelize only independent data scopes; do not create false race failures from fixture collisions.
- Do not delete immutable completed transactions or disable audit triggers for cleanup. Retain and retire test entities through approved lifecycle operations where history must remain. Record their IDs and any test impact on reports.
- Cleanup must be bounded to the run's fixtures and must not mask the original failure. Inspect leftover open shifts, active devices/staff sessions, pending orders and retained records after interruptions.
- Never include secrets in commands recorded in reports. Redact before tool/log output, including service keys, database URLs with passwords, PINs, activation codes, device credentials, Auth tokens and provider tokens. Check screenshots and traces before retaining them.

### C. Progress and stopping rules

Keep the master checklist complete across all discovered modules. Record what was inspected and explicitly what was not. Full repository discovery means a complete inventory plus appropriate trace depth; reading filenames or one summary document is not a full code review.

Maintain `discovery-coverage.md` with each route/screen, operation, hook/service/repository, Edge action or direct RPC/Data API path, effective migration-defined object, permission boundary, affected downstream module and test. Mark inspected paths and unresolved dependencies explicitly. Follow dynamic SQL rewrites and legacy compatibility paths instead of stopping at the first matching definition. This ledger is the evidence for any claim to have reviewed the whole system.

Continue useful independent work when a test is blocked. Record a precise prerequisite and the next reproducible step. Do not silently replace authenticated browser tests with mocks or declare production readiness because time or environment access ran out.

In remediation mode, run the smallest test that reproduces the defect first, then verify the fix and affected integration. Run build/lint for cross-cutting changes and available relevant gates. Broaden testing for a concrete remaining risk, required release gate or changed dependency; avoid unrelated repeated checks.

---

## 21. AUTHORIZED REMEDIATION AND RELEASE ENGINEERING

Apply this section only when implementation is authorized by the user's task.

For each finding: reproduce → trace UI/state/request/API/RPC/schema → establish the root cause → make the smallest safe change → add or update meaningful regression coverage → verify permitted and denied flows → inspect adjacent modules → record remaining limits.

Reuse existing domain models, repositories, services, RPCs, audit writers, permissions and idempotency patterns. Do not create a duplicate staff, terminal, payment, inventory or audit subsystem. Do not fix authorization defects by hiding controls or withholding the entire feature from legitimate users.

Use forward-only migrations; never rewrite applied migrations. Preserve historical actor keys and record relationships. A future removal of `legacy_profile_id` requires a separately scoped migration plan with backfill verification, old-client compatibility and audit/financial-history validation. Do not present that separation as complete after changing only the login UI.

Trace related effects explicitly:

- Staff/roles → branch access → PIN/session revocation → shifts → actions → audit.
- Terminal/device → activation → proof → staff access → shift → payment → replacement/history.
- Products/prices → branch menu → cart → authoritative order → kitchen → stock → receipt/report.
- Discounts → approval/eligibility → tax/total → tender allocation → refund → cash/report/audit.
- Settings → company/branch consumers → pricing/tax → numbering → receipt/printing → reports/integrations.

For a staging release, follow `AGENTS.md`: bump the package minor version for significant POS module changes or patch for fixes, synchronize `package.json` and `package-lock.json`, check `VITE_APP_VERSION`, and execute the staging build. A prompt/document-only update does not require an application release bump.

Prepare release evidence before requesting any still-required deployment authorization. Identify the exact project/branch/URL, migration range, Edge Functions, frontend artifact, version, environment variables by name only, verification steps and recovery procedure. Deploy frontend assets, Edge Functions and database migrations as distinct components. Verify compatibility during partial rollout; do not assume a frontend rollback reverses schema changes.

Within authorized release testing, verify deployment identity and critical workflows on the actual target with explicitly supplied staging credentials. Local checks and a prepared build are not a deployed release. Document backup/restore evidence, restore timing, monitoring, support runbooks and customer onboarding where required for go-live; an available backup checkbox is not a tested restore.

After an implementation task, report IMPLEMENTED, CONNECTED, BUGS FOUND & FIXED, DATABASE, SECURITY, TESTED and REMAINING concisely. State the exact tested scope and all known critical related gaps. In audit-only work, use the required audit reports and clearly distinguish recommendations from changes performed.

---

## 22. CUSTOMER ACCEPTANCE AND GO-LIVE GATES

Use separate decisions for internal verification, customer UAT and production release. The readiness decision is a business gate, while its supporting evidence uses the four verification labels. No percentage-complete score can compensate for a critical financial or tenant-isolation failure.

### Gate 1 — Ready for customer UAT

Require an agreed UAT scope, representative configured data, a reproducible build/environment, usable primary customer journeys, safe permissions/tenant boundaries, documented known issues, evidence-linked test cases and a way to report failures. Unresolved critical issues in the proposed UAT scope prevent readiness. Conditional UAT requires explicit bounded exclusions and an identified owner; it is not permission for production use.

### Gate 2 — Customer UAT accepted

Require recorded customer execution/sign-off for the agreed scenarios, deviations, accepted limitations and business decisions. Developer tests cannot supply customer sign-off. If no customer requirement source or sign-off is available, customer acceptance remains NOT VERIFIED even when technical tests pass.

### Gate 3 — Ready for go-live review

Require acceptance evidence plus actual-target verification of company/branch isolation, device/staff revocation, primary sales, supported tenders, refunds/voids, idempotency and concurrency, cash/stock/report reconciliation, and applicable hardware/integrations. Resolve critical/high release blockers or document properly scoped non-critical exceptions with the responsible decision maker.

Include deployment/migration provenance, version alignment, operational monitoring, tested backup/restore and recovery, support responsibilities, staff onboarding, and applicable legal/accounting confirmation. If an unavailable provider/hardware feature is contractually required, it remains an unmet requirement; do not mark it outside scope without agreement.

In `final-readiness-report.md`, give for each dimension: verification label, decisive evidence IDs, scope limits, blocking issues and next action. State separately the UAT decision, production decision, and customer sign-off state. Do not declare any gate satisfied from the 32-check local suite alone.

Begin execution by confirming the selected mode, performing current repository discovery, and producing the inventory, initial RTM, environment record and prioritized checklist. Continue through the authorized phases. The product owner should receive a clear explanation of what can be delivered, what is still unverified, and the exact work needed to close each remaining requirement.

---

## 23. CONFIRMED MULTI-DEVICE CASHIER, KITCHEN AND WAITER REQUIREMENT

### A. Business requirement and current architectural boundaries

**REQ-MD-001 — Confirmed by the product owner on 2026-10-12:** The restaurant must support cashier, kitchen and waiter staff signing in and operating on different devices. These roles must be able to work concurrently within their authorized company and branch. The product owner also needs to test this using isolated browser sessions, including Incognito.

This confirms the required business capability; it does not certify the current implementation. Full simultaneous device operation remains NOT VERIFIED until the acceptance scenario below executes successfully.

Current source defines one active device assignment and one active/locked staff session per terminal. Therefore, use a distinct terminal record for each concurrently simulated device. Do not remove these constraints or copy one device credential into several browsers to make the test work. Supporting several simultaneous device bindings to the same terminal record would be a separate architecture/business decision.

Keep these concepts distinct:

- Terminal type describes the station's configured purpose. It does not authenticate a staff role or confer permission.
- Staff belong to the company and have branch access. Terminal Staff Access can allow all eligible branch staff or selected branch staff.
- Staff PIN login selects the actual operator and their effective permissions. A kitchen operator must not gain cashier permissions simply by using a terminal labeled Cashier.
- A terminal may support different eligible staff through sequential staff switching under its configured access policy. This must not be confused with three devices maintaining independent active sessions.
- Physical hardware, browser profile, terminal record, device proof, Auth session, staff session and cash shift are separate identities/state. Record how they map in the test.

### B. Derived acceptance criteria

These criteria make REQ-MD-001 testable. Record their measured evidence separately and retain any business-policy dependencies.

| Test ID | Acceptance criterion | Required evidence |
|---|---|---|
| TC-MD-001 | Three distinct terminals in the same authorized branch can remain signed in as cashier, kitchen and waiter concurrently | Three isolated browser contexts, distinct terminal/device/session identifiers, correct visible operator/branch |
| TC-MD-002 | Staff see and perform their allowed work, while direct forbidden requests are rejected | Role/permission matrix, visible screens, authenticated denial tests and unchanged financial state |
| TC-MD-003 | A waiter-created order reaches the kitchen device, can be served by the waiter, and can be paid by the cashier device | One traced order through actual UI steps, requests and persistent state; no sequential role switching substituted |
| TC-MD-004 | Creator, preparer, server, collecting cashier and manager approver remain correctly attributable | Order/kitchen/serving/payment/audit actor fields, terminal/session context and distinct approval attribution where applicable |
| TC-MD-005 | Cash collection posts exactly once to the authorized collecting drawer under the approved shift policy | Opening float, payment, receipt, cash movements, closing count and independent reconciliation |
| TC-MD-006 | New item rounds, partial payments and early payment preserve correct kitchen, serving and financial states across devices | No duplicate ticket/payment, authoritative totals and correct queues on all affected screens |
| TC-MD-007 | Refresh, network loss and reconnect recover current authorized state without duplicate submission | Browser interruption/recovery evidence, request identity, final database counts and measured update delay |
| TC-MD-008 | Staff switching, locking and logout on one device do not silently replace another device's active operator | Before/after staff-session identities and allowed operations on the unaffected devices |
| TC-MD-009 | Device/staff revocation and branch/permission removal enforce their intended scope everywhere | Previously issued credentials denied, UI recovery, and unaffected eligible staff/devices continuing appropriately |
| TC-MD-010 | Another company or unauthorized branch cannot read, subscribe to, change or pay this branch's orders | Real negative actors, API/RPC/Realtime evidence and no unauthorized record or financial changes |
| TC-MD-011 | Separate browser profiles/private contexts can activate independently; ordinary shared tabs are handled consistently | Storage isolation observations, distinct bindings and documented same-profile behavior |
| TC-MD-012 | Ending a private session and replacing a lost test device follows the supported recovery lifecycle | Fresh activation/assignment when required, old proof denied, no lost history and open-shift safeguards preserved |

Use the system's actual configured permission codes when building the role matrix. `src/shared/permissions.js` currently has additional role capability gates consumed by `src/app/App.jsx`. Compare those gates with backend role permissions and custom-role behavior. A correct backend grant must not be accidentally unusable because the frontend recognizes only built-in role names; nor may permissive UI behavior bypass backend checks.

### C. Priority integration concerns discovered in source

The following are review leads, not reproduced runtime defects. Carry them into the issue register with execution NOT VERIFIED until valid tests establish their behavior.

1. **Order creation and terminal-local shifts.** `supabase/migrations/20261004150000_connected_shift_management.sql` defines `assign_order_cashier_shift()` to require an open shift for the current terminal. A waiter device without its own cash shift may be blocked even when the branch cashier has an open drawer. Trace the final function, trigger attachment, order/draft entry paths and current permissions before concluding whether the new workflow is supported.
2. **Payment on a different terminal.** The same migration's `assign_payment_cashier_shift()` checks the originating payment's shift against the current terminal on updates. Later changes, including `supabase/migrations/20261010060000_preserve_drawer_context_on_managed_cancel.sql`, also preserve/validate context. Trace whether collecting payment at CASHIER-01 for an order created at WAITER-01 is possible while preserving historical origin and financial attribution.
3. **A one-terminal test can conceal both issues.** `scripts/test-complete-branch-journey-local.mjs` opens a cashier shift, creates the order, then switches kitchen/waiter/cashier identities on that same terminal. Keep its coverage, but do not use it to close TC-MD-003 or TC-MD-005.
4. **Realtime authorization differs from HTTP.** Queue/table subscriptions in `src/repositories/order.repository.ts` and `src/repositories/table.repository.ts` must deliver only authorized events and recover missed changes. Check how their Auth context and RLS interact with device-proof requirements; a header supplied to an HTTP request is not automatically proof supplied to a WebSocket subscription. Do not weaken RLS to restore updates.
5. **Role and session changes need state cleanup.** Check kitchen, ready-to-serve, unpaid-order, table and product caches after switching staff/branch, revocation, a delayed response or reconnection. Reuse the existing recovery mechanism in `src/services/realtime-recovery.service.ts` and verify its actual hook integration. Old responses must not populate a newly selected tenant/staff context.

Identify the drawer policy as a business decision if existing requirements do not settle it. Normal order-taking and food preparation should be evaluated independently from permission to manage cash. Do not grant cash-shift, payment or manager permissions to waiters/kitchen as a workaround. Do not move all staff onto one terminal or attach payments to an arbitrary branch shift to hide the integration gap.

If remediation is authorized, design any needed change around preserved order-origin context and explicit collecting-terminal/shift context. Keep foreign keys, tenant boundaries, idempotency, receipt identity and append-only cash/audit history intact. Verify refunds, voids, later-shift corrections and reports after the change.

### D. Browser and local-network test setup

Use three isolated browser profiles, different browsers, or three fresh Playwright browser contexts. Keep the administrator in a separate context. Do not initialize the contexts with a copied Auth/device storage state.

An example manual setup is:

| Isolated session | Test terminal | Operator |
|---|---|---|
| Chrome Incognito | CASHIER-01 | Cashier staff |
| Firefox regular profile | KITCHEN-01 | Kitchen staff |
| Safari regular profile | WAITER-01 | Waiter staff |

Multiple Chrome Incognito windows within the same profile share a private session. Opening another tab/window alone does not provide a separate device identity. Closing every private window removes that browser's stored credentials; the backend may still retain the assignment or open shift. Use supported replacement/reactivation procedures and respect active-shift protections.

At preparation time, the local frontend uses `http://127.0.0.1:5173`, setup is `/pos/setup`, staff entry is `/pos/login`, and the local Supabase API is `http://127.0.0.1:54321`. Verify current health and the injected frontend backend target before testing. Keep the exact same frontend origin in each isolated context so hostname differences are not being mistaken for real device isolation.

For testing from physical phones/tablets, loopback URLs refer to each device itself. Inspect Vite's host binding and the browser-visible Supabase URL. Both frontend and backend must be reachable through the intended trusted local-network configuration. Check firewall, Auth redirect/origin configuration, Edge CORS and any HTTPS/secure-context requirements. A running frontend on the laptop does not demonstrate this network setup, and changing only the address in a phone browser is insufficient when the bundle still points to a loopback backend.

Use only the publishable/anon key in browser configuration. Do not expose Studio, privileged API keys or database access just to enable device testing. Keep physical-device connectivity and Incognito simulation as separate evidence categories.

### E. Three-context acceptance execution

1. Establish one test company/branch, eligible staff for all three roles, three activated terminal records, catalog/table fixtures and the approved drawer policy. Record activation through the UI and any privileged fixture setup separately.
2. Sign all three staff in and keep the contexts open together. Confirm one staff login has not ended or replaced another terminal's session. Verify allowed staff lists and denied branch/company staff.
3. Open the cashier drawer through the cashier UI. On the waiter device, select a table and submit an order through the UI. If a shift rule blocks this, preserve the error and postconditions as evidence; do not bypass the rule or create an undocumented waiter cash shift.
4. Observe the order on the kitchen device without manually injecting events. Start preparation and mark ready. Observe and serve it on the waiter device. Check the same order/batch identifiers and the action actors.
5. Open the waiter-originated bill on the cashier device and collect payment once. Verify receipt, collecting shift, drawer movement and the original waiter attribution. Repeat the request safely to establish replay behavior.
6. Repeat with an additional round, partial payment and early payment. Confirm preparation/serving visibility is not lost merely because a bill was paid. Concurrently attempt a duplicate kitchen/serving action and competing settlement with a second authorized cashier fixture where required by the race test.
7. Disconnect only the kitchen context while the waiter adds another round, then reconnect. Assert authoritative refetch, no lost ticket, no duplicated batch and no foreign branch events. Measure update/recovery time; compare with a confirmed target or mark the target unresolved.
8. Switch or lock staff on one device, refresh another, then test scoped device revocation and staff/permission removal. Separate expected staff-wide revocation from a device-local logout. Never assume one behavior for both.
9. Verify an authorized correction, close and reconcile the cashier shift, and compare reports with persisted amounts and actors. Confirm the order/table lifecycle reaches the approved final state.
10. Retire fixtures through supported lifecycle operations; preserve financial/audit history. Save per-context evidence and all limits in `multi-device-acceptance.md`, linked to REQ-MD-001 and the TC-MD test IDs.

The complete acceptance result requires browser interaction at each claimed UI step plus authoritative backend observations. API-assisted assertions are valuable, but API calls performing the entire business flow do not establish UI acceptance. If only browser simulation is tested, physical-device compatibility remains NOT VERIFIED.

## 24. Professional UI/UX audit and controlled enhancement

Apply the supplied UI/UX audit requirements alongside this engineering prompt. Start with discovery and an evidence-backed improvement plan before changing application code. The initial local baseline is [the 12 October 2026 UI/UX audit](audits/uiux-2026-10-12/README.md); recheck it against the current worktree before implementing its recommendations.

Inspect routes, page composition, shared components, CSS tokens, navigation, forms, tables, dialogs, feedback, responsive layouts, touch controls and accessibility. Record current journeys, observed problems, proposed changes, difficulty and regression risk per page. Inventory coverage, rendered coverage and functional verification are separate claims.

Render important accessible pages at 1920×1080, 1366×768, 1024×768, 768×1024 and 390×844. Wait for the intended screen state; a loading screen or a staff welcome screen is not evidence that the corresponding business queue rendered. Record inaccessible pages and untested states explicitly. Verify internal scrolling, clipping, keyboard focus and action reachability as well as document dimensions. Physical devices and virtual keyboards require separate testing.

Extend the existing Tailwind/CSS token system, Inter typography, Lucide icons and shared UI components. Specify colors, contrast, spacing, type, radius, elevation, control heights and responsive behavior. Admin pages should support efficient data management; POS screens should prioritize accurate product selection, visible order context, clear tender entry and reachable actions. Use real authorized data for metrics and actual implemented features for navigation.

Preserve business rules, backend services, database schemas, RLS, authentication, financial calculations, transaction safeguards and audit history during cosmetic work. Keep permissions, PIN security, manager approvals and payment confirmations intact. Investigate functional blockers separately; do not disguise an inaccessible feature as a design problem or weaken its authorization.

Produce these ten deliverables: audit report, admin improvement plan, POS improvement plan, design system specification, component checklist, page checklist, responsive report, accessibility review, before/after comparison and regression report. Maintain a P0–P3 issue register using the verification labels defined in this prompt. Before images must be actual renders; after images remain NOT VERIFIED until implemented and captured.

Under Phase 8 of the supplied UI/UX requirements, request approval for a concrete substantial implementation batch after preparing its scope, reusable components, acceptance criteria and regression gates. Implement approved batches incrementally. Record changed files, affected integrations, actual tests and remaining limits; a screenshot or successful build alone does not establish operational correctness.
