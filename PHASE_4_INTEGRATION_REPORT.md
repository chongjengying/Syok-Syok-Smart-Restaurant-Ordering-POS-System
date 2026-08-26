# Phase 4 Frontend ↔ Backend Integration Report

## Audit summary

1. Technology: React 19, Vite 8, JavaScript/JSX, Supabase JS 2, Supabase Auth, Edge Functions (Deno/TypeScript), PostgreSQL migrations/RPC, Realtime, Tailwind CSS.
2. Routing: screen-state composition in `src/app/App.jsx`; no URL router is installed.
3. State: local React state plus domain hooks; cart intentionally remains client state until checkout.
4. Data path: components → hooks → feature services → repositories → authenticated Edge Functions/Supabase → RLS/RPC → PostgreSQL.
5. Direct component database access: none.
6. Hooks: auth session, catalog, cart, checkout recovery, restaurant tables, order details, payment capabilities, and kitchen orders.
7. Services: auth, menu, tables, orders, payments, and kitchen lifecycle use cases.
8. Repositories: auth/profile, catalog, tables, orders, payments, and kitchen data/realtime access.
9. Backend: `products`, `tables`, `orders`, and `payments` Edge Functions; transaction-safe order/payment/table/status RPCs.
10. RLS: enabled for POS tables and restricted to active staff. Own-order and role-specific staff policies remain active; service-role is not exposed to the frontend.
11. Mock dependencies: no production category/product/table/order/payment mock data remains.
12. Simulation dependencies: no kitchen timers/random status progress and no fake-success payment provider remain. The clock interval in `IpadShell` is UI-only.
13. Financial authority: product/option prices, SST, service charge, total, payment state, and idempotency are enforced server-side.
14. Persistence: active or pending checkout is recovered by stored order ID, then reloaded from PostgreSQL. Stored browser data is only a pointer, not authoritative order data.
15. Remaining external dependency: CARD, QR, and EWALLET stay unavailable until a real gateway adapter and credentials are supplied.
16. Operational UI: role-aware Kitchen Queue and Sales Reports screens now consume the production APIs and Realtime events.
17. Recommended continuation: add the selected payment gateway and browser-level multi-device automation.

## Architecture map

```text
MenuHomeScreen
  → useCatalog
  → menuService
  → catalogRepository
  → products Edge Function
  → CatalogService/CatalogRepository
  → categories/products/options

TableSelectionScreen
  → useRestaurantTables
  → tableService
  → tableRepository
  → tables Edge Function / Realtime
  → transition_restaurant_table RPC
  → restaurant_tables

PaymentScreen
  → usePaymentCapabilities / useCheckout
  → paymentService + orderService
  → paymentRepository + orderRepository
  → payments/orders Edge Functions
  → create_pos_order / confirm_pos_payment RPC
  → orders/order_items/order_item_options/payments

OrderStatusScreen
  → useOrderDetails
  → orderService
  → orderRepository
  → orders Edge Function + Realtime
  → persisted receipt/status/history

KitchenScreen
  → useKitchenOrders
  → kitchenService
  → kitchenRepository
  → orders Edge Function + Realtime
  → role-validated transition_pos_order RPC
```

## Module progress

### Categories and Products

- Before: frontend product/category fixtures and component filtering.
- After: UI → `useCatalog` → menu service → catalog repository → products endpoint → PostgreSQL.
- Database: category/product RLS and option tables already migrated.
- Mock removed: yes.
- Simulation removed: yes.
- Test: PASS through local end-to-end smoke.
- Remaining: admin catalog-management UI is outside the current customer terminal scope.

### Restaurant Tables

- Before: table availability could be represented only in frontend state.
- After: UI → `useRestaurantTables` → table service/repository → tables endpoint/RPC → `restaurant_tables`; Realtime triggers refetch.
- Database: serialized and validated `transition_restaurant_table` RPC.
- Mock removed: yes.
- Simulation removed: yes.
- Test: PASS for AVAILABLE → RESERVED → OCCUPIED → AVAILABLE.
- Remaining: none in the existing terminal flow.

### Cart and Checkout

- Before: cart and checkout orchestration lived in `App.jsx`.
- After: `useCart` owns transient cart actions; `useCheckout` owns idempotency, order creation, payment coordination, cancellation, and refresh recovery.
- Database: unique `(user_id, idempotency_key)` protection.
- Mock removed: yes.
- Simulation removed: yes.
- Test: PASS, including duplicate submission returning the same order.
- Remaining: cart itself intentionally stays transient until checkout.

### Orders and Kitchen

- Before: service and data-access responsibilities were mixed; kitchen queue had a service-role read fallback.
- After: order/kitchen repositories isolate API and Realtime access; hooks own lifecycle; kitchen reads use caller JWT/RLS.
- Database: atomic `create_pos_order`, role-specific `transition_pos_order`, status history, table synchronization, staff read policies.
- Mock removed: yes.
- Simulation removed: yes.
- Test: PASS through PLACED → CONFIRMED → PREPARING → READY → SERVED → COMPLETED, with six history entries.
- UI: dedicated role-aware Kitchen Queue screen with persisted items, requests, status transitions, loading/error/empty states, refresh, and Realtime refresh.
- Remaining: browser-level multi-device acceptance testing.

### Payments and Reports

- Before: a development provider could return fake successful CARD/QR/EWALLET payments.
- After: cash is a real persisted POS workflow; unconfigured external gateways explicitly remain unavailable; receipt/report totals come from PostgreSQL.
- Database: single-paid-payment index, hardened confirmation RPC, daily sales view, separate SST and service-charge storage.
- UI: dedicated date-filtered Sales Reports screen for ADMIN and MANAGER profiles.
- Mock removed: yes.
- Simulation removed: yes.
- Test: PASS for cash confirmation, payment/order consistency, daily report, and separate charges.
- Remaining: real gateway credentials/adapter are required to enable CARD, QR, or EWALLET.

### Authentication and Profiles

- Before: profile queries and mapping were mixed inside the auth service.
- After: auth repository handles Supabase operations, service handles validation/domain mapping, hook handles session lifecycle.
- Database: Supabase Auth trigger, own-profile RLS, synchronized role name/ID, active-profile enforcement, and protected-field trigger preventing self-promotion/reactivation.
- UI: inactive, locked, missing, or unreadable staff profiles are blocked before operational screens render.
- Mock removed: yes.
- Simulation removed: yes.
- Test: PASS as part of the local signup/authenticated smoke flow.
- Remaining: production signup policy should match the operator-provisioning process chosen by the business.

## Verification

- `npm run lint`: PASS
- `npm test`: PASS (6/6)
- `npm run build`: PASS; one non-blocking bundle-size warning remains.
- `npm run test:menu`: PASS against local Supabase, including database price/category/status mutations and anonymous denial.
- `npm run test:smoke`: PASS against local Supabase, including idempotency, full order lifecycle, role denials, inactive-user isolation, protected profile fields, payment failure safety, and reports.
- `supabase db lint --local --level warning`: PASS with no schema errors. The linked lint command did not complete within the verification window; remote migration parity was verified separately.
- Linked migrations: local and remote synchronized through `20260812101000`.
- Deployed Edge Functions: products v5, tables v3, orders v6, payments v4; all report ACTIVE with JWT verification enabled.
- Manual browser acceptance: pending because no browser runtime was available in this workspace session.
