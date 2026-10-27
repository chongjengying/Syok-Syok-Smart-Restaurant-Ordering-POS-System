# Minimal admin preview — implementation review

Date: 27 October 2026, Malaysia time.

Open: <http://127.0.0.1:5173/preview/admin/panel/dashboard>

The user explicitly authorized applying the recommended changes. Work is isolated to the mock preview; the previous design-approval pause no longer blocks this authorized implementation.

## Implemented

- Seven primary sidebar modules: Dashboard, Menu, Orders, Tables, Staff, Reports, Settings. Existing secondary pages and legacy setup URLs are preserved through section navigation and module search.
- Light gray sidebar, white/neutral surfaces, blue actions, clearer typography, compact operational summaries, and a simplified header with one branch selector.
- Three Dashboard KPIs, recent orders with separate payment/fulfillment states, and top items sorted by settled quantity. The current sample ledger replaces the earlier raster design's illustrative aggregate totals.
- Detail drawers retain search, filter, and pagination state while editing. Drawer footers remain at the bottom, and frequently used row actions are directly available.
- Menu details, local image selection, pricing, branch availability, and required/optional priced modifier groups. Modifiers are validated and priced again by the shared mock transaction layer.
- Menu deletion removes an item from the active menu while preserving historical order items and inventory references.
- Simple table grid with area selection, capacity, status, and a list alternative.
- Settings overview with restaurant, tax/service, payment, receipt, printer, permission, profile, and ordering sections. Printer testing downloads a marked sample document without contacting hardware.
- Reports place date controls before their totals and provide gross/discount/tax/service/refund/net calculations, tender breakdown, top-selling items, and CSV export.

## Connected mock workflows

Orders, menu options, branch stock, payments, refunds, credit receipts, register cash, reporting, and audit remain connected through the existing preview workspace provider. Dated financial selectors drive both Dashboard and Reports. Refunds are attributed to the date they occur rather than only the date of the original sale.

The Manager simulation reads the saved Branch Manager permission profile for editing and restricted financial views. Owner mode remains the default. These are mock presentation/interaction controls, not a replacement for production backend authorization.

## Related issues corrected

- Mixed fixed/scoped Dashboard totals, average-order calculations using all created orders, and fixed report chart values.
- Date controls that did not implement the displayed ranges and report controls positioned below the relevant totals.
- Lost list context between detail and edit/payment dialogs.
- A Manager selector disconnected from saved permission choices.
- Fixed terminal/shift labels in the order composer and cash attribution to an unrelated register.
- Unpriced/unvalidated modifier choices and missing branch availability in the composer.
- Missing printer configuration UI and unavailable-item status coloring.
- Occupied mock tables with no corresponding active order.

## Verification evidence

| Command or observable evidence | Result |
| --- | --- |
| `node src/preview/admin/__checks__/preview-model.mjs` | VERIFIED PASS — integer-cent option pricing, required/limited groups, branch/date scopes, AOV, refunds across date boundaries, tender reconciliation, report totals |
| `node src/preview/admin/__checks__/preview-ui.mjs` | VERIFIED PASS — 20 workflow groups; all 36 routes at 1440, 1366, 1024, and 390 px; seven primary navigation entries on every route; 0 runtime/console errors; 0 external requests |
| `npm run lint` | VERIFIED PASS |
| `npm run build:staging` | VERIFIED PASS — existing third-party ExcelJS eval/chunk-size warnings remain; no preview code is bundled |
| SHA-256 comparison against the task-start snapshot | VERIFIED PASS — 619 production, backend, migration, and package files unchanged |
| Staging asset search for preview-only classes/features | VERIFIED PASS — preview UI/styles/features excluded |
| Desktop/tablet/mobile, menu, drawer, dark-mode, and Settings screenshots | VERIFIED PASS — generated and visually inspected under `test-results/preview-admin/` |

The browser suite covers payment/refund validation, stock transfers and negative-stock guards, duplicate registers and cash reconciliation, staff/PIN setup, member separation, saved roles, terminal activation/replacement/revocation, settings review, menu CRUD, vouchers, full stock returns, invoice correction, drawer state, image/modifier/branch workflows, printer tests, report CSV/date consistency, permissions, menu archival, loading/empty/error/offline examples, and mobile keyboard navigation.

## Scope and practical limits

No production component, backend API, database schema, migration, payment integration, actual printing connection, or deployment was changed. The app version remains 0.8.0 because this is an excluded local preview rather than a staging release. Mock edits reset on a full browser reload.

Production authentication, RLS, tenant isolation, payment-provider behavior, hardware printing, live staging journeys, and concurrency are NOT VERIFIED by these mock tests. No new claim is made about separating terminal-device Auth from Auth-backed staff profiles.

The scope is the recommended preview UX. It does not add a production integration or replace the existing POS.
