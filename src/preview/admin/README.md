# Restaurant admin UI/UX preview

Open <http://127.0.0.1:5173/preview/admin/panel/dashboard> with `npm run dev:local` running.

This workspace now uses the recommended minimal design: a light gray sidebar, white/neutral surfaces, one blue accent, readable tables, and clear status labels. Exactly seven primary modules organize the existing 24 admin pages and 12 onboarding/account routes: Dashboard, Menu, Orders, Tables, Staff, Reports, and Settings. Secondary pages remain reachable through section tabs and module search; existing URLs are preserved.

The user explicitly authorized applying the recommendations on 27 October 2026. This supersedes the earlier design-only approval pause for the isolated mock preview. No production deployment is part of this work.

## Applied improvements

- One branch selector in a simplified header; floor selection is inside Tables.
- Three Dashboard KPIs, recent orders, and sorted top-selling items. Values derive from the same mock order/payment records used by Reports. The earlier design image's illustrative totals are replaced by the actual sample ledger totals.
- Compact operational summaries, direct row actions, and a detail drawer that preserves search, filters, and pagination while editing.
- Menu forms for descriptions, local image selection, RM prices, branch availability, and required/optional priced modifier groups. The order composer validates required choices and calculates their prices using integer cents.
- Menu deletion removes the item from the active menu while retaining historical order snapshots and stock references.
- Simple default table grid with area tabs, statuses, capacity, and list view.
- Grouped Settings for restaurant information, tax/service, payments, receipts, printers, permissions, and profile. Sample printer testing downloads a clearly marked text document without contacting hardware.
- Manager simulation follows the saved Branch Manager permission profile. Production authorization remains separate and unchanged.
- Real date-range filtering and CSV reporting, with refunds attributed to their refund dates. Average order value remains based on settled bills before refunds.

## Scope

All records, identities, codes, approvals, payments, health statuses, and submissions are samples held in React memory. Navigation preserves edits; a browser reload resets the workspace. No Supabase client, backend API, email, payment provider, or Stitch project is used. Preview code is behind the existing development-only entry point and is excluded from the staging bundle. Production deployment protection remains unchanged.

## Module coverage

| Route after `/preview/admin/`                                      | Working local interactions                                                                                                                    |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `panel/dashboard`                                                  | Branch/floor context, live sample metrics, menu and order details, new order, kitchen/shift/health links                                      |
| `panel/products`                                                   | Search/category/status filters, sorting, pagination, CSV, item creation/editing, availability, stock records                                  |
| `panel/orders`                                                     | Order composer, item quantities, vouchers, integer-cent totals, list/kitchen views, preparation states, cancellation reason, payment          |
| `panel/tables`                                                     | List/floor views, capacity and area, table creation/editing, reservation/release, cleaning after payment                                      |
| `panel/company`                                                    | Business/contact fields, regional/tax defaults, receipt preferences, local logo selection, change review                                      |
| `panel/branches`                                                   | Search/status/sort, actual terminal counts, create/edit, branch context, grouped regional/tax fields, duplicate guards                        |
| `panel/terminals`                                                  | Registration, temporary sample code, expiration and single consumption, physical-device assignment, replacement, revocation, disable, history |
| `panel/users`                                                      | Separate staff records, employee IDs, primary/additional branches, role, POS access, sample PIN readiness, lifecycle actions                  |
| `panel/roles`                                                      | Task groups, protected owner, custom roles, saved versus draft permissions, review, discard, navigation guard                                 |
| `panel/payments`                                                   | Payment history, partial/full refund amount and reason checks, cash reconciliation, optional item return on full refund                       |
| `panel/receipts`                                                   | Issued/credit documents, search, sample text download, audited sample reprint, CSV                                                            |
| `panel/cash-shifts`                                                | Active-terminal selection, opening cash, duplicate-open guard, expected cash, counted cash, variance reason, reconciliation                   |
| `panel/categories`                                                 | Create/edit categories, kitchen routing, visibility, live linked product counts                                                               |
| `panel/inventory`                                                  | Branch stock, receiving/increase, transfer, waste, positive-quantity and negative-stock guards, movement history                              |
| `panel/promotions`                                                 | Create/edit schedule and discount values, validation, pause/resume, usage snapshot                                                            |
| `panel/vouchers`                                                   | Unique code, percentage/fixed value, dates, limits, pause/resume, redemption in the order composer                                            |
| `panel/reports`                                                    | Branch report, illustrative chart range/metric, new settled sales and refunds reflected in totals, CSV                                        |
| `panel/discount-activity`                                          | Voucher/promotion/approval sample history, new voucher discounts, detail and CSV                                                              |
| `panel/audit`                                                      | Append-only sample events for mutations and exports, actor/scope/reason details, CSV                                                          |
| `panel/system-administration`                                      | Business, tax/service, receipt, ordering preferences; review/save/discard; saved rates affect new orders                                      |
| `panel/system-health`                                              | Illustrative services, availability bars, simulated refresh and checked time                                                                  |
| `panel/qr-settings`                                                | Merchant identity, confirmation method, checkout availability, non-payable QR, change review                                                  |
| `panel/payment-providers`                                          | Provider configuration, branch scope, lifecycle confirmation, enabled methods available at checkout                                           |
| `panel/einvoice`                                                   | Sample validation states, buyer/tax correction, local submission, CSV                                                                         |
| `register`, `verify-email`, `login`, `reset-password`              | Validation, duplicate-submit UI safeguards, recovery, pending/expired/resend/verified states; no credentials saved                            |
| `company/create`, `company/members`, `company/settings`, `profile` | Company setup review, protected owner, separate member invitation/access management, company versus personal settings                         |
| `branches`, `staff`, `roles`, `devices`                            | Existing setup paths use the same shared module records                                                                                       |

All screens share mobile navigation, module search, notifications, light/dark modes, focus treatment, dialog focus trapping, CSV downloads, and explicit loading/empty/error/offline/permission-denied examples. The read-only preview role prevents mutations. These controls demonstrate presentation behavior; they do not substitute for production authorization.

## Connected sample journeys

- New order → kitchen state → payment → receipt → stock movement → shift expected cash → report → audit.
- Partial/full refund → retained original payment/order → credit receipt → cash drawer reconciliation → optional full item return → audit.
- Staff record → branch assignments → role → simulated PIN readiness. Company membership is managed independently.
- Terminal registration → sample code → physical-device activation → retained assignment history. Open registers must be reconciled before terminal lifecycle changes.

The current production implementation still has Auth-backed profiles, registered terminals, Staff PIN credentials, and terminal staff sessions. This preview does not implement or claim a completed migration to separate device Auth or Auth-free staff.

## Verification

With the local Vite server running:

```sh
node src/preview/admin/__checks__/preview-ui.mjs
node src/preview/admin/__checks__/preview-model.mjs
npm run lint
npm run build:staging
```

Browser checks exercise connected mock workflows, failed validations, real downloads, read-only state, unsaved forms, all 36 routes at 1440/1366/1024/390 px, mobile navigation, and absence of external requests. New checks cover drawer state retention, menu images/modifiers/branch availability, direct order actions, printer configuration, report filtering/reconciliation, Manager permissions, and history-preserving menu deletion. Model checks cover modifier limits, financial arithmetic, scope, and refunds crossing date boundaries. Screenshots are written under the ignored `test-results/preview-admin/` directory.

VERIFIED PASS applies only to the recorded local UI tests and build commands. Production authentication, RLS, payment providers, concurrency, database writes, actual email delivery, and deployment are NOT VERIFIED by this preview suite.
