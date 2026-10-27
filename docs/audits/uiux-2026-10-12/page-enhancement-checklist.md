# Page-by-page enhancement checklist

**PARTIALLY VERIFIED** — all 24 admin sections rendered at 1366×768; page bodies visually inspected in contact sheets. This does not mean every create/edit/detail dialog, state, permission or mutation was exercised.

## Admin routes

Each route is `/#admin/<section>`. Sources live under `src/components/admin/`, except tables/products/reports under `src/components/` and inventory/system pages under `src/pages/admin/`. Screenshots use `admin-<section>-1366-settled.png`.

| Section / component | Current layout / journey | Finding / proposed enhancement | Difficulty | Regression sensitivity |
|---|---|---|---|---|
| `dashboard` — AdminDashboard | Setup/health cards and metric grid; Review business activity | Oversized setup hierarchy; small filter → Prioritize real operational figures | Medium | Metric periods/data states |
| `company` — OrganizationManagement | Company summary and edit flow; Read/edit company | Header/form style differs → Summary plus grouped configuration | Medium | Company context and validation |
| `branches` — BranchManagement | Branch listing and detail; Find/manage outlet | Dense context and bespoke dark header → Shared header; branch summary/details | Medium | Outlet and terminal/staff relationships |
| `terminals` — TerminalManagement | Terminal table and lifecycle actions; Create/view/activate/revoke | Dense actions on small widths → State-led details and explicit action labels | Medium | Device lifecycle and history |
| `users` — StaffSelectionPage / UserManagement | Staff table and details; Find/create/manage staff | Phone trailing actions; mixed forms → Essential columns and grouped staff details | Medium | PIN and outlet/role access |
| `roles` — RolePermissions | Role/permission configuration; Inspect/edit grants | Dense permission controls → Grouped permissions with clear save feedback | Medium | No grant changes from styling |
| `orders` — AdminOrders | Filters and order table; Find/order details | Unassociated filter inputs → Labelled filters; scannable status/money | Medium | Scope, query and lifecycle actions |
| `payments` — AdminPayments | Filters/payment table/detail; Review settlement and exceptions | Unassociated filters; phone table overflow → Financial summary with secondary detail | High | Refunds/voids/approvals/totals |
| `receipts` — AdminReceipts | Receipt filters and listing; Find/view receipt | Unassociated filters → Shared filter labels and receipt detail | Medium | Receipt content and printing |
| `cash-shifts` — CashShiftManagement | Shift list and financial details; Find/reconcile shifts | High information density → Context then financial breakdown/history | High | Expected cash and attribution |
| `tables` — TableManagementScreen | Table operations surface; Inspect/manage tables | Different visual language → Labelled status and clear order links | Medium | Occupancy/order associations |
| `products` — ProductManagementScreen | Catalog listing/forms; Find/create/edit product | Custom action/form styling → Shared header/filter/form structure | Medium | Menu availability/pricing |
| `categories` — CategoryManagement | Category listing/editing; Manage category organization | Independent density/controls → Consistent list and editor | Low | Product category relationships |
| `inventory` — InventoryManagementPage | Stock listing and movement actions; Review stock/open movement dialog | Many actions compete → Prioritize context; grouped movement actions | Medium | Movements and tenant scope |
| `promotions` — PromotionManagement | Promotion list/configuration; Review/create promotion | Bespoke forms/actions → Consistent dates, status, scope sections | Medium | Eligibility/discount rules |
| `vouchers` — VoucherManagement | Voucher management table; Review/manage vouchers | Dense financial constraints → Group value, scope and validity | Medium | Redemption rules |
| `reports` — ReportsScreen | Period controls and report content; Review sales/export | Page-specific spacing → Consistent filters and data hierarchy | Medium | Totals, periods and exports |
| `discount-activity` — DiscountActivity | Usage records and filters; Trace voucher/discount usage | Secondary navigation clutter → Clear usage heading and drill-down | Low | Attribution and scope |
| `audit` — AuditLogs | Audit records/technical payloads; Find who changed what | Raw record density; filter labelling → Summary then expandable raw detail | Medium | Append-only evidence completeness |
| `system-administration` — SystemAdministrationPage | Multi-section restaurant configuration; Review/edit settings | Long mobile forms → Section anchors; consistent save context | Medium | Unsaved changes and defaults |
| `system-health` — SystemHealthPage | Health cards/check details; Inspect service health | Competing status blocks → Prioritized actionable health summary | Low | Truthful unavailable/error states |
| `qr-settings` — QrPaymentSettings | QR payment configuration; Review/edit QR setup | Bespoke form layout → Grouped settings and inline feedback | Medium | Provider/reference behavior |
| `payment-providers` — PaymentProviders | Provider configuration inputs; Manage payment options | Many unassociated fields → Labelled per-provider sections | Medium | Tender availability and settings |
| `einvoice` — EinvoiceOverview | Invoice status/action overview; Review submission state | Different primitive adoption → Align status/table hierarchy | Medium | Submission, retry and permissions |

## Operational pages and overlays

The operational app uses state-selected screens in `App.jsx`; URL paths are entry/landing context, not an independent route for every component.

| Component / entry | Current journey and layout | Rendered coverage | Enhancement / difficulty / regression risk |
|---|---|---|---|
| AuthScreen `/admin/login` | Credentials and account tabs in framed shell | Five sizes | Accurate environment/identity, compact layout; low-medium; auth form behavior |
| TerminalSetupScreen `/pos/setup` | Activation code → confirmation | Five sizes; confirmation laptop | Clear steps/context; medium; activation/device binding |
| StaffSelectorScreen `/pos/login` | Select staff → PIN → first-use PIN change | Selector five sizes; first-use flow exercised | Step distinction, keypad reachability; medium; PIN/session behavior |
| WelcomeScreen `/pos/sales` | Staff context and permitted operation links | Cashier five sizes; waiter laptop | Task-led landing, consistent identity; medium; role gates |
| CashShiftScreen | Opening float → active reconciliation form | Laptop opening/active | Group context and amounts; medium; cash calculation/closing |
| DiningModeScreen / table selection flow | Start order → takeaway/dine-in | Takeaway selection laptop | Clear mode/table state; medium; order context |
| MenuHomeScreen | Category/product/cart columns | Five sizes | Compact cards and persistent order access; medium; search/availability |
| CustomizationModal | Product pane/options/footer | Five sizes; keyboard sequence | Responsive sheet and focus containment; medium; modifier/quantity validation |
| CartReviewScreen | Item list + summary | Five sizes | Reduce fixed empty space; keep controls reachable; medium; draft totals/edits |
| ReviewOrderScreen | Review then Continue to Pay | Laptop | Clarify preview/server amount distinction; medium; checkout submission |
| PaymentScreen | Order summary + method/tender form | Five sizes, no settlement | Label fields and action hierarchy; high; payment correctness |
| KitchenScreen `/pos/kitchen` | Ticket queue and preparation actions | NOT VERIFIED: fixture landed on welcome with no queue action | Diagnose access/landing first; medium design difficulty; high workflow risk |
| ReadyToServeScreen | Ready items and serve/collect actions | Empty queue at five sizes | Ticket/status priority; medium; fulfillment state/actor |
| TableManagementScreen | Table status/operations | Admin laptop rendering; waiter operations not exercised | Labelled status and order links; medium; occupancy |
| TableSelectionScreen | Choose table/active order | Source only, NOT VERIFIED visually | Consistent availability context; medium; table/order reuse |
| TerminalLockScreen | PIN unlock / switch staff | Source only, NOT VERIFIED visually | Shared keypad/context; medium; lock/revocation rules |
| StaffAccessStatusScreen / PosStartupScreen | Access/loading/recovery states | Source only, NOT VERIFIED visually | Specific retry/recovery guidance; medium; startup/auth state |
| StaffPinScreen | Additional/legacy staff PIN component | Reachability NOT VERIFIED | Establish active usage before changing; medium; auth duplication risk |
| OrderDetailScreen / OrderStatusScreen | Existing order detail/status and actions | Source only, NOT VERIFIED visually | Status timeline/action hierarchy; high; mutation permissions |
| SplitBillScreen | Amount/equal/item splits and history | Source only, NOT VERIFIED visually | Consistent labelled financial forms/dialogs; high; allocation/rounding |
| PaymentConfirmationScreen / ReceiptPreview | Confirmed payment and receipt | Source only, NOT VERIFIED visually | Clear confirmed state and receipt actions; high; never premature success |
| ProfileModal | Current operator profile | Source only, NOT VERIFIED visually | Shared dialog semantics; low-medium; identity display |
| StaffDetailPage / StaffAssignmentPanel | Staff details, outlets and roles | Parent staff list rendered; detail forms NOT VERIFIED visually | Group assignment/history; medium-high; outlet/role access |
| TerminalStaffAccessEditor | Terminal access configuration | Source only, NOT VERIFIED visually | Clear access mode and scope; medium-high; backend access guards |
| RefundStockReturn / financial approval overlays | Refund/return decisions | Source only, NOT VERIFIED visually | Consistent reasons/approver context; high; financial/inventory reversal |
| ShiftSummary | Shared cash breakdown | Active-shift context rendered; all variants NOT VERIFIED | Consistent amounts/variance; medium; reconciliation |

## State coverage and next checks

Loading states were captured during the initial pass; final renders use the settled pass. Empty serving queue was observed. Inventory dialog keyboard flow was exercised. Error, permission-denied, offline/reconnect, expired-session, populated kitchen, all admin form validation states, translated layouts and every record detail remain PARTIALLY VERIFIED or NOT VERIFIED as indicated; do not infer them from screenshots of parent pages.

No measured click reduction is claimed for pages where only a list was inspected. The scripted POS action count is documented separately. The structural inventory includes the remaining supporting UI, hooks, repositories and styles without implying visual coverage.

## 13 October implementation update

The original sections above preserve the audit baseline. See the [implementation report](implementation-report-2026-10-13.md) and [updated issue register](issue-register.md) for delivered changes, current verification, files and remaining work. Do not interpret historical “pending” or failure entries as post-change results.
