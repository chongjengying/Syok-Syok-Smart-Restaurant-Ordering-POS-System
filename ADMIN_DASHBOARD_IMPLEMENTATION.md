# Production Admin Dashboard

Release version: `0.1.0`

## Architecture

```text
AdminDashboard / dashboard widgets
  -> useAdminDashboard (shared filters, refresh lifecycle, realtime debounce)
  -> admin-dashboard.service (Malaysia date presets)
  -> admin.repository (one filtered RPC + scoped realtime channel)
  -> get_admin_dashboard(...) PostgreSQL aggregation
```

The dashboard is monitoring and navigation only. Refunds, cancellations, catalog changes, table transitions, and identity changes remain in their secured operational modules.

## Reporting rules

- Business timezone: `Asia/Kuala_Lumpur`.
- A sale is recognised when the order becomes fully settled (`MAX(payment.paid_at)`).
- Split payments therefore count the order once, not once per payment row.
- Gross sales use settled order subtotal.
- Net sales = gross - discount - refunds + tax + service charge.
- Refunds are deducted in the period in which the refund occurs.
- Failed, pending, cancelled, and unpaid payments never enter successful sales.
- Product rankings use settled orders and exclude cancelled orders and voided items.
- Order counts use order creation time, while financial totals use settlement time; this difference is intentional.

## Database changes

Migration `20260826143000_production_admin_dashboard.sql` adds:

- Parameterised `get_admin_dashboard(date, date, dining_mode, payment_method, staff_id, branch_id, granularity)` RPC.
- `pos_settings` for the business name and configurable kitchen delay threshold.
- `staff.performance.view`, granted to `ADMIN` by default.
- Targeted partial indexes for paid/failed payments, payment-state order reporting, audit recency, and branch staff filtering.
- Database-side permission gates for reports, payments, orders, tables, audit activity, and staff performance.

## UI and navigation

- Shared presets: Today, Yesterday, Last 7 Days, This Month, and Custom.
- Shared scope: branch, order type, payment method, and authorised staff filter.
- KPI comparison against the immediately preceding equivalent period.
- Sales performance with daily/weekly/monthly and revenue/order/AOV controls.
- Order, payment, live table/kitchen, product, alert, staff, recent order, and audit widgets.
- Widget links use `#admin/<module>?<filter>` and initialise module filters.
- Admin navigation becomes a drawer on tablet/smaller layouts.
- Reusable Malaysia currency/date/time formatting.

## Realtime strategy

The dashboard listens only to `orders`, `payments`, `restaurant_tables`, and `order_item_batches`. Events are debounced into one aggregate refresh. Analytics also refresh every 60 seconds while the tab is visible. No widget creates its own realtime subscription.

## Loading and failure behaviour

- Initial load uses a skeleton.
- Empty widgets distinguish no data from failure.
- A failed refresh preserves the last successful snapshot and displays a stale-data warning with retry.
- Racing filter requests cannot replace newer results.

## Verification

- `npm run lint`
- `npm run build`
- `npm run test:integration-contracts`
- `npm run test:security-contracts`
- `npm run test:split-money`

Contract coverage includes the aggregation boundary, financial formula, settlement rule, failed-payment separation, threshold configuration, permission gates, navigation, and realtime table scope.

## Deployment requirement

The linked staging database currently contains remote migration versions `20260825150000`, `20260825151000`, and `20260825152000` that are absent locally. Reconcile migration history before any `supabase db push`; do not mark those versions reverted without confirming their actual SQL. After reconciliation, deploy migrations through `20260826143000`, deploy the `admin-users` function, then build/deploy the staging frontend.

## Known limitations

- Restaurant tables do not currently carry `branch_id`, so branch filtering applies to order/financial/staff analytics but live table counts remain restaurant-wide.
- Supabase Auth does not expose reliable live-login presence in the current schema. Staff Performance shows account status, not whether a staff member is presently online.
- There is no inventory ledger or system-error event table. Low-stock alerts remain unavailable until those source modules exist; sold-out product alerts are supported.
- Database lint could not run locally because Docker/PostgreSQL is unavailable. The linked-project dry run was also blocked by the pre-existing migration-history divergence described above.

## Recommended next improvements

1. Add branch ownership to tables and operational records if multi-outlet operation becomes active.
2. Add an inventory ledger and reorder thresholds before enabling low-stock KPIs.
3. Add an application health-event sink for actionable system-error alerts.
4. Add browser-level dashboard tests against a seeded local Supabase once Docker is available.
