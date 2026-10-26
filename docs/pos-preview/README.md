# Syok Syok POS design preview

Local entry: **http://127.0.0.1:5180/pos/preview**. Start it from the repository root with:

```powershell
npm run dev:local -- --port 5180
```

Then open `/pos/preview` on the printed local address. The preview does not need `.env.staging`, a login or a database. It loads an independent fictional manager/terminal context; the original application continues to use its existing authentication. Nothing is deployed.

All order, payment, kitchen and table changes are in memory. Refresh resets the fixtures. The preview does not use the real POS's storage keys or service clients. The existing HTML shell still declares its original Google font links and PWA metadata; these were not changed. Browser checks block external resources and still exercise the preview.

Read [AUDIT.md](AUDIT.md) for the existing workflow and source inconsistencies, and [VALIDATION.md](VALIDATION.md) for evidence and limitations.

## Design specification

| Token            | Value     | Use                                                     |
| ---------------- | --------- | ------------------------------------------------------- |
| Primary orange   | `#F97316` | Start order, selected categories, review and submission |
| Success teal     | `#0D9488` | Payment, serving, positive feedback                     |
| Information blue | `#2563EB` | Ready/reserved information and supporting notices       |
| Warning amber    | `#F59E0B` | Occupancy, kitchen work, unpaid states                  |
| Danger red       | `#DC2626` | Error/removal semantics                                 |
| Canvas           | `#F8FAFC` | Light application background                            |

Use softly tinted white cards, a compact rail, orange branding, local vector dish artwork and restrained borders. Primary actions have 48px minimum height. Draft quantity and edit/remove targets are 44px; navigation controls remain accessible by keyboard. Status labels carry text as well as color. Page titles receive focus on navigation; dialogs have a focus trap, Escape dismissal and focus restoration. Reduced motion is respected.

- Desktop / wide tablet: menu and persistent cart in separate columns; three products per row, expanding to four above 1,600px.
- Portrait / narrow tablet (980px and below): compact rail, menu grid, sticky View order action and expandable cart drawer.
- Narrow layouts: single-column bill, payment and cashier screens; kitchen columns stack; tables and products retain two columns where space permits.
- Tablet portrait 834 × 1,194, landscape 1,194 × 834, desktop 1,440 × 1,000 and mobile 390 × 844 are the browser QA sizes.
- All selectors are rooted under `.pos-preview`; original Tailwind/global styles are dynamically loaded only on original routes.

## Implemented screens and walkthrough

1. Overview: service summary and the original Start new order action.
2. New order: dine-in/takeaway selection, areas, table states, occupied-order reopening and existing takeaway drafts.
3. Menu: category/search, six local sample products, product details and required Mild spice selection, note up to 1,000 characters, service mode and quantity.
4. Cart: edit/remove/clear new lines, separate immutable submitted items, voucher validation and totals.
5. Final review: destination and items, takeaway packaging, explicit final confirmation.
6. Dine-in status/detail: order rounds, add-on items, bill and split payment entry. Takeaway goes to payment before kitchen submission.
7. Kitchen: distinct pending/preparing/ready batches; add-ons retain their own round.
8. To serve: ready items served/collected; paid/fulfilled orders complete and dine-in tables become dirty.
9. Payments: cash received/change; manual demo QR provider and explicit receipt confirmation; early-kitchen acknowledgment; partial/full payments and payment history.
10. Split bill: full, amount, equal (2–10, remainder in final part) and item quantities; outstanding-balance and repeat-allocation checks.
11. Mock receipt: payment/tender/change detail and a browser print layout. Printing is only a mock document, never a kitchen printer integration.
12. Orders/history: searchable unpaid and paid orders, order detail and receipt access.
13. Table operations: reserve/release, move unpaid order, out-of-service/restore, DIRTY → CLEANING → AVAILABLE.
14. Cash shift: opening float, reasoned cash movements, closing count and difference. Payments are attributed to their mock shift.
15. Reports: local daily sales, order transactions, product sales and payment transactions, date range, search, mock PDF/Excel exports. Other admin/report categories are outside this operational preview.

Example: Start new order → Table 01 → Continue → Nasi Lemak → Add to order → Review cart → Review order → Confirm & send. Open Kitchen to start/mark ready, then To serve to mark served. Open Orders → Table 01 → View bill & pay, confirm mock cash payment and complete. In Tables, start and complete cleaning.

Takeaway example: New order → Takeaway → Continue → add Coffee → cart → final review → select packaging → Continue to payment → confirm mock payment → Complete order. A kitchen batch appears only after full payment.

## File inventory

Only **`src/main.jsx`** was modified for this task outside new preview/documentation/test files. It now imports the route selector; `src/app/App.jsx` and original components, logic, endpoints, schemas, permissions and styles were not edited. Pre-existing dirty changes are retained.

```text
docs/pos-preview/
  AUDIT.md                    Existing workflow, source map, audit limits
  README.md                   Access, design, screens, files, integration plan
  VALIDATION.md               Commands, results, scope and limitations
src/preview/
  PreviewRoute.jsx            Exact-path loader; original routes keep App.jsx
  PreviewApp.jsx              Preview shell and screen composition
  components/
    ui.jsx                    Scoped primitives and accessible dialog
    DishArt.jsx               Local SVG artwork
    OrderSummary.jsx          Draft lines, immutable history and totals
    ProductDialog.jsx         Product configuration
  data/
    mockTables.js             Table shape and local fixtures
    mockMenu.js               Catalog/category/packaging fixtures
    mockOrders.js             Seed orders, rounds and receipt
    mockPayments.js           Mock methods, empty vouchers, open shift
  services/
    mockPosService.js         Transactional in-memory adapter
    previewMoney.js           Integer-cent totals and splitting
    previewFormat.js          Status labels
    mockShiftService.js       Shift-scoped cash calculation
    mockReportService.js      Local report generation and export
  state/usePreviewPos.js      Adapter subscription, navigation and commands
  screens/
    OrderingScreens.jsx       Welcome/menu/cart/review/status/detail
    TableScreens.jsx          Selection and operations
    PaymentScreen.jsx         Payment/split/receipt
    OperationsScreens.jsx     Orders/history/kitchen/serving/shift
    ReportsScreen.jsx         Local reporting
  styles/preview.css          Entirely scoped preview design system
  tests/mockPosService.test.mjs
tests/preview/
  playwright.config.js        Independent browser config; no staging server
  preview.spec.js             Workflow, network, storage and layout QA
```

No dependency or lockfile changes were needed. Existing React, Lucide, jsPDF and ExcelJS dependencies are reused. Report export libraries load only when exporting.

## Adapter contract and future backend integration

Current flow: `Preview UI → usePreviewPos → mockPosService → in-memory fixtures`.

The adapter exposes stable `getSnapshot()` and `subscribe(listener)` functions and awaitable UI commands. `commit` clones a snapshot and notifies listeners only after a successful command, so validation failures leave state unchanged. Presentation components never call repositories or network clients.

| Preview command                                                         | Existing integration to adapt after approval                                                                                              |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `openOrder`, `discardDraft`, `saveItem`, `changeQuantity`, `clearDraft` | `createOrderDraft`, `getOrder`, `saveOrderDraftItems`, `cancelOrder`; retain server draft version and concurrency handling                |
| `setPackaging`, `submitOrder`                                           | `saveTakeawayPackaging`, `submitOrder` / append kitchen batch; preserve pay-before-submit for takeaway                                    |
| `advanceBatch`, `serveOrder`                                            | Existing kitchen batch and serving services                                                                                               |
| `createEqualSplit`, `recordPayment`                                     | `createEqualOrderSplit`, payment summary and `processSplitPayment`; persist idempotency key per attempt and reconcile uncertain responses |
| `tableAction`, `moveOrder`                                              | Existing table reserve/release, lifecycle and move RPCs                                                                                   |
| `openShift`, `cashMovement`, `closeShift`                               | Existing organization/cashier services and authoritative shift summaries                                                                  |
| Report generation                                                       | Existing report service and backend-filtered records; preserve its full definition/export contract                                        |

A future real adapter must load trusted branch/terminal/staff context from the original authentication boundary, project server responses into the snapshot, and enforce server-authoritative totals, permissions, idempotency, receipts and table lifecycle. Migrate mock IDs to real IDs only inside that adapter; never submit fixture IDs or mock prices. Real failures, stale drafts and price changes must be surfaced using the existing contracts. Verify latest migrations against the older table/frontend model before enabling integration.

Next phase, only after explicit approval: implement the real adapter in an approved environment, run authenticated staging/RLS/payment/concurrency coverage, compare totals and kitchen batches with the existing UI, and review rollout separately. **No real adapter is implemented or activated here.**

## Check commands

```powershell
node --test src/preview/tests/mockPosService.test.mjs
npm run lint
npm run build:local
npx playwright test --config tests/preview/playwright.config.js
```

Browser tests expect the local server on port 5180. Override `POS_PREVIEW_BASE_URL` for a separately started built preview. On Windows the independent config uses the installed Google Chrome; other platforms use Playwright Chromium. No authenticated staging scripts are part of these checks.
