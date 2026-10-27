# Controlled implementation and QA plan

**PARTIALLY VERIFIED** — based on the existing source review and local audit evidence. The subsequent 2026 Enterprise Restaurant POS UI/UX Modernization brief explicitly requests implementation module by module. Frontend batches below are authorized by that brief; financial and authorization behavior remain outside this design change.

## Scope classification

| Class | Proposed changes | Boundary |
|---|---|---|
| Cosmetic | Typography, spacing, radii, colors, icon consistency, business identity and environment text | Preserve data sources, handlers, validation and available actions |
| Frontend interaction | Responsive modifier dialog, associated field labels, keyboard containment, focus return, mobile navigation dismissal, reachable cart/payment actions | Preserve workflow stages, security confirmations and request semantics; test changed interactions |
| Workflow | Combining review screens, changing navigation history, new bulk actions, new metrics, new table-transfer behavior | Separate proposal and acceptance criteria; not included in the first batch |
| Functional investigation | Kitchen-role landing, simultaneous devices, cross-terminal shift/payment behavior | Trace independently; backend/authentication changes require separate authorization and are outside cosmetic work |

## Ranked implementation batches

P0 has not been established by the audit. Priority describes operational impact; regression risk describes the sensitivity of affected behavior. This table supplies the batch numbering used for approval and delivery.

| Batch | Priority / findings | Concrete scope | Reuse | Risk | Acceptance gate |
|---|---|---|---|---|---|
| 1 | P1: UX-01–03 | Responsive product-options dialog, named icon actions, keyboard containment/focus return, payment label associations | Existing CustomizationModal, PaymentScreen, CSS tokens; assess AccessibleDialog before extending it | High sensitivity; medium implementation size | All modifiers and quantity/action controls reachable at five sizes; unchanged input values, calculations and request payloads; keyboard and checkout/payment regression |
| 2 | P1/P2: UX-04, 07–09, 13–14 | Compact operational shell, consistent branding/environment, control sizes and theme adoption | IpadShell, existing Button and tokens, configured business context | High: shared across roles | Correct staff/terminal/branch/shift context; all existing permitted actions reachable; auth/activation/handoff tests |
| 3 | P2: UX-06, 10–12, 16, 18 | Admin drawer accessibility, dashboard hierarchy, form labels and table/detail consistency | AdminShell, PageHeader, SearchFilterBar, StatusBadge, hardened AccessibleDialog | Medium–high | All 24 sections and deep links; filter/pagination/dirty-form behavior; company/branch/staff and financial detail checks |
| 4 | P1/P2: UX-05, 15 | Product density, persistent order access, cart and payment layout | MenuHomeScreen, CartReviewScreen, ReviewOrderScreen, PaymentScreen and existing money utilities | High: checkout surfaces | Draft edits, server-confirmed totals, partial/split/QR settlement, retry/double-click, approvals and receipt checks |
| 5 | P2/P3: role-specific presentation and UX-20 | Kitchen/serving hierarchy, shift/receipt presentation, remaining polish | KitchenScreen, ReadyToServeScreen, ShiftSummary, ReceiptPreview | High for operational actions | Populated queues on isolated terminals, fulfillment attribution, reconciliation and receipt output |

UX-17 (Back-navigation behavior) remains an investigation before any workflow change. UX-19 (kitchen-role landing) requires functional diagnosis before kitchen UI acceptance; it is not resolved by Batch 5 styling.

## Batch 1 implementation boundary

1. Reinspect the current diff and modifier/payment components before editing; preserve unrelated changes.
2. Inspect the shared dialog's initial Shift+Tab, unique title IDs, rerenders and focus restoration before choosing whether to extend it. Avoid broad replacement of working dialogs.
3. Adapt the modifier layout to available width, with a bounded options area and reachable quantity/Add to Cart footer. Preserve required-group validation, add/update semantics, existing cancellation behavior and price calculation.
4. Add accessible names and label/input associations to existing controls. Keep parsing, input modes, limits, disabled states, error handling and payment submission behavior intact.
5. Add focused browser coverage for the reproduced clipping/focus defects and changed interactions. Test optional/required modifiers, editing an existing item, quantity limits, long names and validation errors.
6. Run the smallest relevant existing checks first: `npm run test:checkout-drafts` and `npm run test:split-money`; run the affected authenticated local payment-screen journey after inspecting its fixture setup. Use `npm run build:local` and `npm run lint` for shared changes. A money unit test alone does not prove payment integration.
7. Capture matching before/after states at 1920×1080, 1366×768, 1024×768, 768×1024 and 390×844. Test virtual keyboard reachability on suitable hardware or record NOT VERIFIED.
8. Update the issue register and regression report with commands, environment, results and limitations. Keep the batch open if an acceptance criterion remains unmet.

## Phase 9 coverage matrix

The baseline column describes the audit evidence only. Listed tests are candidates for the affected implementation, not claims that they ran during this documentation update. Inspect each tool's target and fixture lifecycle before execution.

| Required area | Audit baseline | Required implementation verification |
|---|---|---|
| Authentication | PARTIALLY VERIFIED — local admin sign-in and terminal flow | Existing `test:login-flow` plus browser success/failure/session recovery |
| Authorization | PARTIALLY VERIFIED — authorized screens rendered; exhaustive denials absent | `test:company-role-local`, `test:company-role-ui-local`, direct denied operations and unchanged state |
| Company selection | NOT VERIFIED — one company fixture scope | Switch authorized company where supported; inspect retained filters/context and cross-company denials |
| Branch selection | PARTIALLY VERIFIED — scoped fixture branch used | `test:branch-terminal-staff-local`; branch changes preserve permitted terminal/staff/product context |
| Terminal activation | PARTIALLY VERIFIED — one supported activation path exercised | `test:terminal-setup-ui-local`; expired/reused/invalid code and recovery |
| Device binding | PARTIALLY VERIFIED — local fixture binding/revocation | `test:terminal-device-proof`, `test:terminal-device-local`; refresh and revoked proof denial |
| Staff login | PARTIALLY VERIFIED — three sequential role sign-ins | Correct staff/session context after login/switch/lock; isolated simultaneous contexts separately |
| PIN entry | PARTIALLY VERIFIED — first-use replacement exercised | Keypad and keyboard entry, invalid PIN, lockout, masked values and focus behavior |
| Shift opening/closing | PARTIALLY VERIFIED — zero-float opening and controlled cleanup closure | `test:shift-ui-local`, `test:shift-management-local`; ordinary closing UI, variance and attribution |
| Product selection | PARTIALLY VERIFIED — one fixture product | Search/category/availability, modifiers, quantity, edits and missing images; `test:branch-menu-pricing-contracts` |
| Order calculations | PARTIALLY VERIFIED — displayed preview/server totals observed | `test:checkout-drafts`, `test:split-money`; backend totals, tax/discount and rounding examples |
| Payment processing | NOT VERIFIED — stopped at payment entry | `test:payment-screen-local`, `test:qr-payment-local`, `test:split-payment-local`; error/retry/idempotency and persistence |
| Refund approvals | NOT VERIFIED | Authorized and denied approvals through actual UI; reason/approver attribution; financial and stock reversal checks |
| Receipt generation | NOT VERIFIED | Persisted payment → receipt; totals/identity; actual print/PDF output and reprint behavior |
| Reporting | PARTIALLY VERIFIED — report page rendered | Known local financial fixtures reconcile to filters, totals and exports |
| Database writes | PARTIALLY VERIFIED — fixture activation, staff session, order and shift writes | Verify affected records and audit relationships; UI success only after confirmed API response |
| Supabase integration | PARTIALLY VERIFIED — local authenticated requests | Error/reconnect handling, tenant scope, subscription recovery and no duplicate submissions |

No staging credentials were supplied for this work. Local evidence must not be reported as a staging or production release. Use existing release/version rules only when a release is separately in scope.

## Phase 10 deliverable acceptance

The [audit index](README.md) links all ten required deliverables and the issue register. The report package exists; its evidence is incomplete in the areas explicitly marked above. Before screenshots exist. After screenshots and post-change regression results remain NOT VERIFIED until approved code is implemented and exercised.

For each completed batch, record changed components, existing module integrations, bugs fixed, any database/security effect, commands and environment, matched screenshot pairs, and remaining limitations. Use only VERIFIED PASS, VERIFIED FAIL, PARTIALLY VERIFIED or NOT VERIFIED for verification conclusions.

## Execution result — 13 October

Frontend implementation and its verification are recorded in the [implementation report](implementation-report-2026-10-13.md). The original acceptance gates remain applicable; incomplete physical-device, full financial browser and role-landing coverage is explicitly retained as remaining work.
