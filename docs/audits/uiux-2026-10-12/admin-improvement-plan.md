# Admin improvement plan

**PARTIALLY VERIFIED** — source and rendered proposal; no redesign applied.

## Navigation map using existing sections

| Proposed group | Existing sections |
|---|---|
| Overview | Dashboard |
| Organization | Company, Branches, Terminals |
| People & Access | Staff, Roles & Permissions |
| Restaurant Operations | Tables, Orders, Products, Categories, Inventory, Promotions, Vouchers |
| Financial Operations | Payments, Receipts, Shift Management |
| Analytics | Sales Reports, Voucher Usage |
| System | Audit Logs, Restaurant Settings, System Health, QR Payment Settings, Payment Methods, E-Invoice |

Retain the current permission mapping and deep-link query parameters. Device details remain within the implemented terminal lifecycle; refund/void actions remain with their existing financial records. Do not invent standalone Devices, Staff Performance or Cash Management modules.

## Proposed layout

1. Compact company/branch context and current page title. Keep environment and connectivity legible. Preserve role-sensitive navigation and staff-switch actions.
2. Sidebar groups collapse predictably; active item remains discoverable. Mobile drawer receives dialog semantics, keyboard containment, Escape handling and focus return. Review navigation history separately before changing `replaceState` behavior.
3. Dashboard opens with existing sales/transaction/operational values and their period. Promote existing important alerts. Put large setup/health shortcuts lower. Show unavailable data explicitly; add new metrics only if an existing authorized data source provides them.
4. Standard page header: title, short supporting context, one primary creation action. Filters follow in a consistent row with clear/reset behavior. Preserve query scope and pagination.
5. Tables align amounts right, statuses consistently, and primary identifiers left. Mobile shows key fields and a visible details/action affordance; preserve access to every column through details or an explicitly scrollable table. Do not introduce unsafe financial bulk actions.
6. Forms use sections, associated labels, inline server errors and predictable Save/Cancel placement. Keep existing dirty-form protections. Add no silent defaults or auto-save semantics.
7. Details show identity/status/context first, then editable configuration, related records and audit history. Payment/shift details keep the server-calculated totals and attribution visible.

## Batches and gates

| Batch | Files/components principally affected | Difficulty / risk | Acceptance |
|---|---|---|---|
| Operational shell | IpadShell, AdminShell, CSS tokens | Medium / high shared-surface risk | Preserve terminal/staff/shift context, role controls, all routes and five sizes |
| Navigation and dashboard | AdminShell, AdminDashboard | Medium / medium | All 24 authorized sections reachable; forbidden sections remain unavailable; mobile keyboard test; no fabricated metrics |
| Shared form/table adoption | Existing UI primitives; organization, terminal, staff, catalog components | Medium / medium-high | Existing create/edit validation and payloads identical; filters/pagination preserved; responsive detail access |
| Financial details and audit | AdminPayments, AdminReceipts, CashShiftManagement, AuditLogs | Medium / high | Read-only presentation first; receipt totals unchanged; approval and reversal tests before interactive changes |
| Settings/report polish | Existing settings/report pages | Low-medium / medium | Dirty-form guards, exports, period filters and permission restrictions preserved |

## Regression dependencies

Company/branch forms connect to terminal and staff scope. Staff details connect to outlet access and permissions. Product forms connect to menu availability/pricing and inventory. Payment, receipt and shift detail layouts connect to financial history. Test each relevant relationship before calling a batch complete.

Sorting, new bulk actions and new dashboard metrics can require behavior changes; treat them as separately scoped work if the current implementation lacks support.

## 13 October implementation update

The original sections above preserve the audit baseline. See the [implementation report](implementation-report-2026-10-13.md) and [updated issue register](issue-register.md) for delivered changes, current verification, files and remaining work. Do not interpret historical “pending” or failure entries as post-change results.
