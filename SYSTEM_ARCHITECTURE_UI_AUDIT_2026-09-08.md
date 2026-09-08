# Restaurant POS Architecture, Security, UI/UX, and Quality Audit

Audit baseline: branch `agent/catalog-supabase`, commit `813ff6f61a2e9c882777516682ac35d9c66e1694`, staging Supabase project `tlknhjkbapqshykfrlbs`, 2026-09-08.

## Executive Scores

| Dimension | Score | Evidence-based assessment |
|---|---:|---|
| A. Architecture | 76/100 | Clear UI/hook/service/repository/backend boundaries exist, but two generations of data-layer structure coexist and the application root owns too many workflows. |
| B. UI/UX | 70/100 | Strong POS-oriented touch sizing, responsive layouts, loading states and a nascent token system; visual primitives and accessible modal behavior are inconsistently adopted. |
| C. Security | 88/100 | Tenant/branch boundaries, RLS, permission RPCs, trusted terminal sessions, immutable financial operations and direct security contracts are substantial. Some Edge Functions rely on application-level JWT checks because gateway verification is disabled. |
| D. Maintainability | 64/100 | Feature separation and typed domain models help, but 1,090-line and 978-line coordinators, duplicate repository conventions, dense one-line files, and historical migration layering raise change cost. |
| E. Performance | 73/100 | Virtualized products, pagination, cache/recovery and code-split report exporters are good. ExcelJS is a 1.06 MB chunk and the staging product report is roughly 4.0–4.7 seconds. |
| F. Testability | 78/100 | Contract, integration, browser, performance and live race suites exist. There is no TypeScript project check; local database tests depend on an unavailable container runtime; most authenticated browser tests require external credentials. |
| G. Production readiness | 80/100 | Core staging concurrency and financial reconciliation now pass. Authenticated browser/device/printer UAT and the complete original regression matrix remain prerequisites for release. |
| H. Overall | 76/100 | Transactional design is stronger than presentation-layer consistency and developer feedback loops. |

## Detailed Review

### 1. Frontend architecture — 74/100

- Strengths: `src/app`, feature modules, hooks, services, repositories, infrastructure and shared types form recognizable boundaries. Screens receive workflow state rather than querying Supabase everywhere.
- Weaknesses: `App.jsx` is a 978-line state machine/router; legacy `src/features/*Repository` and newer `src/repositories/*` patterns coexist.
- Critical issues: none confirmed.
- High: route/workflow orchestration is hard to test independently.
- Medium: converge new work on one repository/service convention; extract route configuration and workflow coordinators.
- Low: remove unused Vite starter artifacts.
- Files: `src/app/App.jsx`, `src/features/**`, `src/repositories/**`, `src/services/**`.
- Fix: preserve behavior while extracting cohesive route and session coordinators behind existing props/contracts.

### 2. React component structure — 65/100

- Strengths: domain screens are named clearly; lazy loading is used for heavy/admin screens; product states are split into focused components.
- Weaknesses: `SystemAdministrationPage.tsx` (1,090 lines), `AuthScreen.jsx` (501), `MenuHomeScreen.jsx` (465), and several 300–450-line screens mix state, validation and markup.
- Critical: none.
- High: oversized coordinators increase regression risk.
- Medium: extract sections and form groups with stable props; keep business hooks unchanged.
- Low: normalize component file type and formatting.
- Files: the components above plus `AdminOrders.jsx`, `OrderStatusScreen.jsx`, `TableSelectionScreen.jsx`.
- Fix: incremental component extraction with snapshot-free behavior tests focused on events and state.

### 3. Hooks and services — 75/100

- Strengths: hooks encapsulate asynchronous state and cleanup; `useCheckout` reconciles server truth after retries and stale-version conflicts.
- Weaknesses: `useCheckout.js` is 386 lines and owns restoration, drafts, submission, discounts and payments. Similar mapping occurs at several layers.
- Critical: none.
- High: payment/order state coupling makes changes broad.
- Medium: split internal hooks by restoration, draft writes and payment while retaining the public hook contract.
- Low: standardize result/error types across JS and TS.
- Files: `src/hooks/useCheckout.js`, `useAuthSession.js`, `src/services/order.service.ts`, `payment.service.ts`.
- Fix: extract internal units and test each state transition.

### 4. Repository/data access — 68/100

- Strengths: Supabase access is generally isolated; Edge Function calls have timeout, cancellation, telemetry and normalized errors.
- Weaknesses: repositories exist under both `features/*` and top-level `repositories`; naming and response mapping vary.
- Critical: none.
- High: duplicate conventions can produce divergent retry/error behavior.
- Medium: document top-level repositories as canonical and migrate only when touching a feature.
- Low: consistent verb names and typed results.
- Files: `src/features/**Repository*`, `src/repositories/**`, `src/infrastructure/supabase/functionsClient.js`.
- Fix: add a single repository contract and deprecate, rather than abruptly delete, older adapters.

### 5. Supabase integration — 89/100

- Strengths: separate account/operator clients, Edge Functions, forward migrations, RPC transaction boundaries, Storage and Realtime integration.
- Weaknesses: long migration history contains superseded definitions; generated database types are absent.
- Critical: none after repair migrations through `20260908110000`.
- High: schema drift is detected late without generated types.
- Medium: generate checked-in database types and validate migrations in CI.
- Low: update the pinned beta Supabase CLI.
- Files: `src/infrastructure/supabase/*`, `supabase/functions/**`, `supabase/migrations/**`.
- Fix: add schema type generation/checking without changing runtime contracts.

### 6. Authentication and authorization — 88/100

- Strengths: account and operator sessions are separated; active-status checks, PIN handoff, terminal binding and permission retrieval are server-backed.
- Weaknesses: the auth service is 324 lines and audit failure is warning-only; several auth paths are hard to exercise without credentials.
- Critical: none confirmed.
- High: authenticated browser acceptance is incomplete.
- Medium: add deterministic staging test-user provisioning/cleanup.
- Low: split auth mapping from session transitions.
- Files: `src/features/auth/*`, `useAuthSession.js`, `staff-pin-session`, auth migrations.
- Fix: preserve dual-client behavior and add credential-safe acceptance setup.

### 7. RLS/security — 90/100

- Strengths: RLS is enabled broadly; company/branch/session scope is enforced in functions and restrictive policies; sensitive mutations use audited RPCs; service credentials are absent from frontend code.
- Weaknesses: some Edge Functions report gateway `verify_jwt=false` and perform their own verification, increasing reliance on every handler doing it correctly.
- Critical: none found by linked DB lint or security contracts.
- High: validate every gateway-disabled function with unauthenticated live tests.
- Medium: use gateway JWT verification where compatible; retain handler authorization.
- Low: eliminate harmless lint warnings in security-definer functions.
- Files: `supabase/config.toml`, Edge Functions, RLS migrations.
- Fix: add live negative tests before changing gateway configuration.

### 8. Order workflow — 90/100

- Strengths: trusted branch/session context, atomic numbering/table claim, idempotency, optimistic draft versions, catalog snapshots and server reconciliation.
- Weaknesses: legacy append and modern draft functions had diverged; repaired defaults now protect add-ons.
- Critical: none open in tested staging path.
- High: maintain one authoritative item-pricing implementation.
- Medium: route add-ons through shared snapshot logic.
- Low: simplify status aliases after historical compatibility window.
- Files: `useCheckout.js`, order service/repository, `orders` Edge Function, order migrations.
- Fix: extract a database helper for item snapshots and call it from both draft and append paths.

### 9. Kitchen workflow — 87/100

- Strengths: append-only batches, sequential batch numbers, status transition RPCs, Realtime and race tests.
- Weaknesses: legacy kitchen-station schema and administration expectations diverged; repaired by additive compatibility columns.
- Critical: none open.
- High: add live route/printer acceptance with actual station configuration.
- Medium: cap or paginate growing KDS queues.
- Low: consolidate status labels.
- Files: `KitchenScreen.jsx`, kitchen hooks/services, kitchen migrations.
- Fix: add station-routing fixture and bounded queue API.

### 10. Payment workflow — 92/100

- Strengths: authoritative totals, payment attempts, idempotency, row locks, double-payment protection, receipt snapshots and cash tender/change persistence.
- Weaknesses: live test fixtures previously omitted mandatory cashier shifts; now corrected.
- Critical: none after retest.
- High: expand live split/non-cash/refund coverage.
- Medium: expose attempt status for clearer recovery UX.
- Low: consolidate payment method mapping.
- Files: `PaymentScreen.jsx`, payment services/repositories, `payments` Edge Function, financial migrations.
- Fix: keep database acceptance authoritative and grow scenario coverage.

### 11. Promotions and vouchers — 84/100

- Strengths: server recalculation, eligibility windows, branch/order scope, stacking rules, usage locking and audit.
- Weaknesses: evaluator is large PL/pgSQL; manual/promotion/voucher paths share repeated aggregation logic.
- Critical: none after ambiguity repairs.
- High: live boundary tests for stacking, expiry and last-use races.
- Medium: extract deterministic SQL helpers for eligible subtotal and adjustment total.
- Low: remove unused evaluator variables.
- Files: `discount.service.js`, voucher/promotion repositories, migrations `20260901*`, `20260907400000*`, repair migrations.
- Fix: preserve API and factor internal SQL only with golden financial tests.

### 12. Admin panel — 69/100

- Strengths: permission-aware navigation, filters, accessible admin dialog, operational dashboards and broad settings coverage.
- Weaknesses: large shell/settings page; tables/forms/cards are mostly assembled from inline utility classes; some configuration code is compressed and difficult to review.
- Critical: none open.
- High: settings page change risk and inconsistent primitives.
- Medium: extract settings sections and adopt shared form/table/card components.
- Low: standardize empty-state copy.
- Files: `AdminShell.jsx`, `SystemAdministrationPage.tsx`, `src/components/admin/**`.
- Fix: migrate one admin area at a time to the proposed primitives.

### 13. Reporting — 73/100

- Strengths: paginated reports, source-backed summaries, dynamic PDF/Excel imports and export error states.
- Weaknesses: product report staging latency is ~4.0–4.7 seconds; ExcelJS chunk is 1.06 MB.
- Critical: none.
- High: report query latency affects operations.
- Medium: profile product-report SQL and reduce scanned/joined rows; keep exporters lazy.
- Low: show export progress/count consistently.
- Files: report feature, `ReportsScreen.jsx`, report RPC migrations.
- Fix: EXPLAIN the product report against representative data and add a performance threshold.

### 14. Error handling — 82/100

- Strengths: normalized API errors, correlation IDs, timeout/retry semantics, global error boundary and explicit UI errors.
- Weaknesses: some cache/telemetry catches intentionally suppress storage failures; console messages are inconsistent.
- Critical: none.
- High: no centralized user-visible error event history.
- Medium: route operational errors through a shared alert/toast surface with correlation ID.
- Low: structured logging helper for frontend diagnostics.
- Files: `functionsClient.js`, `errorMessages.js`, `AppErrorBoundary.jsx`, cache/telemetry services.
- Fix: preserve local resilience while making business-operation failures consistently visible.

### 15. Realtime/concurrency — 91/100

- Strengths: subscriptions clean up, server truth is refetched, stale drafts reject, table/payment/status races pass, reconnect recovery passes.
- Weaknesses: test configuration called the legacy anon key a publishable key, masking an authentication mismatch.
- Critical: none after corrected retest.
- High: ensure CI uses the same key mode as the frontend.
- Medium: deduplicate simultaneous invalidations and record subscription health centrally.
- Low: consistent channel naming.
- Files: repositories with `.channel`, recovery service, staging scripts.
- Fix: explicit `STAGING_ANON_KEY` configuration and coalesced refresh scheduling.

### 16. Performance — 73/100

- Strengths: product virtualization, caching, pagination, parallel page loads and dynamic exporters.
- Weaknesses: large export chunk, 459 KB main JS, product report p95 ~4.75 seconds, some KDS tests exceed one second.
- Critical: none.
- High: product-report query.
- Medium: reduce main bundle and bound KDS payloads.
- Low: tune chunk warning thresholds only after actual optimization.
- Files: report SQL/services, `VirtualizedProductGrid.jsx`, build configuration.
- Fix: query profiling first; avoid cosmetic bundler configuration changes.

### 17. Accessibility — 72/100

- Strengths: global focus-visible style, 44px controls, reduced-motion support, semantic status icons, live result counts and `AccessibleDialog` focus trap/restore.
- Weaknesses: accessible dialog behavior is admin-specific; many raw buttons/forms make labeling and focus behavior inconsistent; authenticated acceptance is mostly skipped.
- Critical: none confirmed.
- High: non-admin modal keyboard/focus behavior.
- Medium: reuse a shared dialog and form-field primitive; run automated axe plus keyboard tests.
- Low: improve icon-only button descriptions consistently.
- Files: `CustomizationModal.jsx`, `ProfileModal.jsx`, payment dialogs, `AccessibleDialog.jsx`.
- Fix: promote dialog primitive to shared UI and migrate modal-by-modal.

### 18. Responsive UI — 76/100

- Strengths: explicit tablet/mobile POS layouts, horizontal category rail, sticky admin table columns and touch target sizing.
- Weaknesses: wide admin tables force 720px minimum width; information can require two-axis navigation; device frame classes are fixed-size.
- Critical: none.
- High: verify high-density admin workflows at phone width.
- Medium: responsive column priority/card fallback for key tables.
- Low: remove unused fixed iPad-frame utilities.
- Files: `index.css`, admin tables, POS layout screens.
- Fix: retain tablet-first POS layout and define explicit compact admin table behavior.

### 19. Design consistency — 66/100

- Strengths: gold/charcoal identity, semantic status colors, radius/shadow tokens and initial Button/Header/Badge primitives.
- Weaknesses: tokens mix with hard-coded Tailwind colors; raw buttons, cards, filters, tables and forms remain common; legacy glass/elevation helpers overlap with new tokens.
- Critical: none.
- High: duplicated interactive styles create inconsistent states.
- Medium: expand primitives and migrate high-use admin screens.
- Low: remove stale visual utilities after usage verification.
- Files: `index.css`, `src/components/ui/**`, most screens.
- Fix: adopt the design system below incrementally.

### 20. Dead, duplicated, obsolete, complex code — 61/100

- Strengths: files are domain-named and most operational logic has tests.
- Weaknesses: Vite starter assets/CSS remain; two repository/service layouts coexist; several migrations and functions are historical supersessions; dense one-line source impairs review.
- Critical: none.
- High: duplicated item/order implementations can drift.
- Medium: dependency-map unused code, format dense files, document canonical layers.
- Low: remove starter assets and unused CSS.
- Files: `src/App.css`, `src/assets/react.svg`, `src/assets/vite.svg`, feature/top-level data layers, large components.
- Fix: delete only proven-unused artifacts; migrate duplication opportunistically with regression tests.

## Proposed Design System

| Element | Standard |
|---|---|
| Colors | Brand gold `#C59A2A`, gold hover `#A77E18`, ink `#18181B`, canvas `#F5F6F8`, surface `#FFFFFF`, border `#E4E7EC`, muted text `#667085`; semantic success `#16794B`, warning `#A15C07`, danger `#B42318`, info `#175CD3`. All component colors reference tokens. |
| Typography | Inter/system stack; 12px metadata, 14px body/control, 16px emphasized body, 22px page title, 28–32px key POS totals. Weights 500/600/700/800 only. |
| Spacing | 4px base scale: 4, 8, 12, 16, 24, 32, 48. Standard screen gutter 24 desktop/tablet and 16 compact. |
| Buttons | Shared `Button`; 44px default, 36px compact, 52px primary POS action. Variants primary, accent, secondary, danger, ghost. Required focus, disabled and pending states. |
| Inputs/selects | Shared field wrapper with visible label, hint/error IDs, 44px control, 10px radius, token border/focus ring. Never use placeholder as the only label. |
| Cards | Surface, 1px token border, 14px radius, subtle card shadow; padding 16 compact or 24 standard. |
| Tables | 44–56px rows, 11px uppercase header, numeric values right-aligned/tabular, sticky header where scrolling, explicit empty/loading/error row. |
| Badges | Shared `StatusBadge`; semantic token map, text plus icon, never color alone. |
| Dialogs | Shared accessible dialog with label, focus trap/restore, Escape/backdrop policy, scroll containment and destructive confirmation. |
| Alerts | Info/success/warning/error variants with icon, title, action and optional correlation ID; `aria-live` based on urgency. |
| Sidebar | 248px desktop, drawer compact; one active style; icon + visible label; grouped by permission. |
| Header | PageHeader with optional eyebrow, one H1, concise description, right-aligned actions that wrap on compact widths. |
| Navigation | Permission-derived destinations, visible current location, browser-history-safe state, 44px targets. |
| Status states | Every data surface defines skeleton/loading, actionable error/retry, useful empty state and stale/reconnecting indicator. |

## Prioritized Remediation Plan

### P0 — must fix immediately

No unresolved P0 defect was confirmed in the current staging transaction path. Continue treating duplicate payment, incorrect totals, cross-tenant access and cash mismatch as automatic P0 blockers.

### P1 — must fix before production

1. Add an actual TypeScript project check and make it part of the standard verification command.
2. Add live unauthenticated tests for every gateway-JWT-disabled Edge Function and authenticated browser acceptance using controlled credentials.
3. Profile and reduce product-report latency, with a representative staging threshold.
4. Complete physical-device UAT for tablet, reconnect, printing and payment recovery.
5. Consolidate item snapshot logic so legacy add-ons and drafts cannot drift again.

### P2 — important improvement

1. Promote the accessible dialog and form/table/card patterns into shared UI primitives; migrate high-use screens incrementally.
2. Split `App.jsx`, System Administration and `useCheckout` into cohesive internal coordinators without changing public behavior.
3. Declare the canonical repository/service structure and stop adding parallel adapters.
4. Generate Supabase database types and check them in CI.
5. Coalesce Realtime invalidations and cap KDS/report payload growth.

### P3 — optional polish

1. Remove proven-unused starter assets and legacy visual helpers.
2. Normalize formatting and naming across JS/TS modules.
3. Add responsive column priorities to secondary admin tables.
4. Refine empty-state and operational error copy.

## Implementation Order

The first increment will establish TypeScript checking and a repeatable aggregate verification command. The second will clean proven-unused starter code and promote the accessible dialog into shared UI without changing behavior. Later increments should address report SQL only after query-plan evidence and decompose large coordinators one workflow at a time.
