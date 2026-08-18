# POS System Audit

## Critical

File: [supabase/migrations/20260810140000_add_production_pos_modules.sql](/Users/chongjengying/Documents/Pos%20Order/supabase/migrations/20260810140000_add_production_pos_modules.sql)
Problem: `create_pos_order` had no idempotency protection, so the same client action could create duplicate orders if the request was retried or the UI was submitted twice during network instability.
Impact: Duplicate orders, duplicate kitchen tickets, duplicate pending payments, and incorrect revenue/operator workload.
Recommended Fix: Add an order idempotency key enforced per user in the database and pass it from the frontend through the orders Edge Function.

File: [supabase/migrations/20260810140000_add_production_pos_modules.sql](/Users/chongjengying/Documents/Pos%20Order/supabase/migrations/20260810140000_add_production_pos_modules.sql)
Problem: Payments could be marked `PAID` without a database-level guard ensuring only one successful payment exists for each order.
Impact: Double-settlement risk and inconsistent reporting for completed orders.
Recommended Fix: Add a partial unique index for `payments(order_id)` where `status = 'PAID'`, and harden `confirm_pos_payment` to reject invalid order states or amount mismatches.

File: [supabase/migrations](/Users/chongjengying/Documents/Pos%20Order/supabase/migrations)
Problem: `daily_sales_report` was missing even though the target system and test flow require reporting.
Impact: Paid transactions cannot be audited cleanly through a reporting surface, and Phase 5 report verification is incomplete.
Recommended Fix: Add a reporting view backed by paid payments and expose it through an authenticated backend endpoint.

## High

File: [src/components/OrderStatusScreen.jsx](/Users/chongjengying/Documents/Pos%20Order/src/components/OrderStatusScreen.jsx)
Problem: The receipt preview and totals are still derived from the client cart state rather than the persisted order payload.
Impact: A printed or displayed receipt can drift from the authoritative database total if pricing, tax, or options differ from the local preview.
Recommended Fix: Load the persisted order detail for receipt rendering and compute display totals from backend data.

File: [src/components/PaymentScreen.jsx](/Users/chongjengying/Documents/Pos%20Order/src/components/PaymentScreen.jsx)
Problem: On capability lookup failure, the screen silently falls back to cash-only mode.
Impact: Operational outages can be masked as normal behavior, making payment-provider problems harder to detect.
Recommended Fix: Keep the fallback for continuity, but surface it as a degraded state and log/report capability-fetch failures.

File: [supabase/functions/orders/index.ts](/Users/chongjengying/Documents/Pos%20Order/supabase/functions/orders/index.ts)
Problem: The kitchen queue read path elevates to `service_role` after a role check because current RLS does not cover the full query shape cleanly.
Impact: The endpoint works, but the authorization boundary is partly enforced in function code instead of entirely in RLS.
Recommended Fix: Keep the explicit role gate, and continue tightening RLS so privileged reads depend less on service-role fetches over time.

## Medium

File: [src/features/auth/authService.js](/Users/chongjengying/Documents/Pos%20Order/src/features/auth/authService.js)
Problem: Profile shaping and direct Supabase access are still mixed in the auth service.
Impact: Maintainability is lower than the newer repository/service split used for menu and table domains.
Recommended Fix: Introduce a small profile repository/service split when the auth module is next touched.

File: [scripts/smoke-local.mjs](/Users/chongjengying/Documents/Pos%20Order/scripts/smoke-local.mjs)
Problem: The smoke suite depends on a running local Supabase stack and currently cannot execute when the local API is down.
Impact: Verification can look complete in code review while still being unexecuted in practice.
Recommended Fix: Keep the script, but treat it as `NOT TESTED` until `supabase start` is running and the stack is reachable.

## Low

File: [package.json](/Users/chongjengying/Documents/Pos%20Order/package.json)
Problem: There is no dedicated test script yet; verification currently relies on lint, build, and smoke scripting.
Impact: Regression feedback is thinner than it should be for business-critical POS flows.
Recommended Fix: Add a repeatable test command once the local Supabase-backed integration path is stabilized.

# Implementation Priority

P0 - Security/Data Integrity
- Order idempotency
- Single-paid-payment enforcement
- Payment/order consistency checks

P1 - Core POS Functionality
- Reporting surface for daily sales
- Backend-authoritative receipt/order detail rendering

P2 - Reliability
- Better degraded-state handling around payment capability fetch failures
- Executed local smoke coverage against a running Supabase stack

P3 - Cleanup
- Auth module repository/service split
- Dedicated automated test command
