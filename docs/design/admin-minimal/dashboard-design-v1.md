# Restaurant admin — Dashboard design for approval

Status updated 27 October 2026: the user explicitly authorized applying the recommended changes. The visual direction is implemented in the isolated `/preview/admin` mock workspace across the seven primary modules. The original PNG remains a design reference; the running preview now calculates figures from its sample transaction ledger.

Artwork: [Dashboard mockup](./dashboard-v1.png). Generation prompt: [Exact image prompt](./dashboard-image-prompt.txt). The exported raster is 1536 × 1024; the design target is a 1440 px desktop viewport with the same proportions.

## Product analysis

The primary user is an owner or authorized manager checking the current branch's performance and locating orders that need attention. The Dashboard should answer three questions: how much was collected today, how many orders were created, and what the average settled bill was. Recent orders and top items provide the next useful level of detail.

The first design deliberately contains three KPI cards and two compact data panels. Sales trends belong in Reports until a specific Dashboard decision requires a chart. Payment and fulfillment status remain separate because a paid order can still be preparing, and a completed order can later be refunded.

This deliverable is one static high-fidelity Dashboard mockup with clearly marked Mock Data. Its controls communicate proposed interactions; they are not implemented or connected by this design task.

## Information architecture

Exactly seven primary sidebar entries:

| Primary module | Proposed subordinate pages using the existing system |
| --- | --- |
| Dashboard | Today's overview, links to filtered Orders, Menu, and Reports |
| Menu | Items, categories, modifiers/add-ons; contextual inventory and offer management |
| Orders | Order details, payment/refund history, receipts, register history |
| Tables | Areas, table grid, capacity, availability |
| Staff | Staff records, branch access, role assignments |
| Reports | Sales, discounts/refunds, payment mix, top items, export, contextual audit access |
| Settings | Restaurant and branches, tax/service, methods/QR, receipts, printers, permissions, admin profile; advanced terminals and health |

This is a proposed hierarchy rather than a deletion of existing routes. Account registration and onboarding remain separate entry flows. Company membership and operational staff records remain distinct.

## Design system

| Element | Specification |
| --- | --- |
| Canvas | Desktop 1440 × 960; white main surface |
| Sidebar | 224 px; light gray `#F7F8FA`; seven labeled Lucide-style icons |
| Primary accent | Blue `#2563EB`; active navigation and the primary action |
| Text | Charcoal `#17202C`; secondary slate `#64748B` |
| Borders | Subtle gray `#E5E7EB`; 1 px |
| Status | Small written labels with restrained semantic color; color is supplementary |
| Typography | Inter-style sans serif; 14 px body, 12 px secondary, 22–26 px heading, 30 px metrics |
| Spacing | 8 px base; 32 px main gutters; 24 px panel gaps; 20 px card padding |
| Corners | 8–10 px; minimal shadow; no gradients or glass effects |
| Navigation | Page title, branch selector, View reports action, profile |
| Content | Three KPI cards; recent-order table and five top-selling items |

## Financial definitions and mock data

Match the current Dashboard contract rather than deriving average order value from all created orders.

| Metric | Definition | Sample |
| --- | --- | --- |
| Today's sales | Gross − discounts + tax + service charge − refunds | RM 4,820.50 |
| Today's orders | Orders created in the selected day, including unpaid/cancelled orders | 148 = 140 settled + 5 unpaid + 3 cancelled |
| Average order value | Settled bill value before refunds ÷ settled orders | RM 34.80 = RM 4,872.00 ÷ 140 |

Sample reconciliation: RM 4,300.00 gross − RM 100.00 discounts + RM 252.00 tax + RM 420.00 service charge − RM 51.50 refunds = RM 4,820.50. These are demonstration figures, not staging or production records. Cancelled/unpaid orders contribute no settled sales. Refunds reduce net receipts; the existing AOV calculation uses the original settled bill value before refunds.

Top items are sorted by quantity sold, highest first. Sales values remain paired with the correct item. The date, branch, metric cards, and lists must share the same scope when implemented.

## Proposed Dashboard interactions

- Branch selector changes the scope of every metric and panel together.
- View reports opens Reports with the same branch and date context.
- View all orders opens Order Management with the same context; selecting a row opens its detail view.
- View menu opens Menu Management; selecting a top item opens that item.
- Information controls explain the three metric definitions.
- Refresh retains the last successful data while loading; failure displays an inline retry message and the previous update time.
- Restricted roles receive an explicit permission state for unavailable financial information.
- Empty sales and empty order lists use helpful text and the relevant next action.

The static mockup shows the populated state. Loading, empty, error, permission, and keyboard behavior remain implementation acceptance criteria; they are NOT VERIFIED by a raster design.

## Responsive design intent

- 1440/1366 px: persistent sidebar, three KPI columns, recent orders and top items side by side.
- 1024 px: compact navigation rail or drawer with labeled expansion; preserve readable type and touch targets. Stack the two panels if needed rather than compressing table cells.
- Every design must preserve the distinction between payment and fulfillment state, readable RM values, and branch context.

The original artwork covers the desktop Dashboard. The subsequent authorized mock implementation is verified separately at desktop, laptop, tablet, and phone widths; its evidence is in the preview verification suite.

## Existing architecture and integration review

PARTIALLY VERIFIED — read-only source inspection. The project uses Vite, React 19, mixed JSX/TypeScript, Tailwind 4, and Lucide. A Next.js migration is unnecessary for this UI task. shadcn/ui and Recharts are not currently installed; no new dependencies were added.

The existing Dashboard path is `useAdminDashboard` → `admin-dashboard.service` → `admin.repository` → `get_admin_dashboard` RPC. Source inspection shows branch/date filters, backend permission flags, aggregates, top items, recent orders, refresh, and realtime subscription. Reuse this flow after design approval; live integration was NOT VERIFIED during this design task.

Source references:

- `package.json`
- `src/main.jsx`
- `src/hooks/useAdminDashboard.ts`
- `src/services/admin-dashboard.service.ts`
- `src/repositories/admin.repository.ts`
- `supabase/migrations/20260903120000_repair_admin_dashboard_rpc.sql`

Menu modifiers, printer configuration, and role behavior require their own contract review before their screen implementation. This design does not assert that the earlier mock preview's workflow gaps are resolved.

The current production identity implementation still uses Auth-backed profiles, registered terminals, Staff PIN credentials, and terminal staff sessions. This design makes no claim that separate device Auth or Auth-free staff are complete.

## Deliverable and approval boundary

The Dashboard artwork is generated with the built-in image-generation tool. Stitch discovery returned `Authentication required`; no Stitch project or screen was modified. The accompanying prompt is stored separately for reproducibility.

VERIFIED PASS — exported PNG inspected for all seven navigation entries, three KPI cards, the mock-data label, separate payment and fulfillment status, correct displayed KPI values, and descending top-item quantities. This verifies the static artwork only. Application behavior and responsive variants are NOT VERIFIED by this deliverable.

The later explicit instruction to apply the recommendations authorized implementation within the existing isolated preview. Menu, Orders, Tables, Staff, Reports, and Settings now share the same visual language. Production APIs, schemas, migrations, payment processing, actual receipt printing, and deployment remain unchanged. The static artwork's earlier verification is distinct from the executable preview checks documented in `src/preview/admin/README.md`.
