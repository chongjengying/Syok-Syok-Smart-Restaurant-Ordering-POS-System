# Realtime and Concurrency Staging Report

Date: 2026-08-25  
Supabase project: `tlknhjkbapqshykfrlbs`  
Automated run: `daf8f30d`

## Realtime Test Summary

PASS for authenticated independent waiter, kitchen, and cashier clients. Order, order-item, kitchen-batch, payment, and table mutations were observed without a page refresh. Explicit disconnect/mutate/reconnect recovered current database truth. Repository subscriptions use unique channel names and return cleanup functions that call `removeChannel`; React effects invoke those functions on cleanup.

Browser sleep/wake, long-background-tab throttling, and physical Wi-Fi loss were not reproduced. The test exercised equivalent Realtime socket disconnect/reconnect and authoritative refetch behavior at the client/API layer.

## Concurrency Test Matrix

| Scenario | Actors | Preconditions / actions | Expected | Actual | Result |
|---|---|---|---|---|---|
| Same table claim | Waiter A/B | Both create an order on one available table | One succeeds; one conflicts | HTTP `201` + `409`; one order in DB | PASS |
| Same draft edit | Waiter A/B | Same draft version; quantity change races removal | One write; stale write rejected | HTTP `200` + `409`; version advanced once; DB matches winner | PASS |
| Duplicate submit | Same waiter, two requests | Same idempotency key | One business order | Both replay same ID; one DB row | PASS |
| Concurrent add-ons | Waiter A/B | Append different products to one order | No lost item; unique batches | All items retained; batches 1, 2, 3 | PASS |
| Kitchen batch/status | Kitchen A/B | Concurrent add-ons and stale status transitions | Unique sequence; valid winner | Unique batches; invalid/stale path rejected or serialized to valid state | PASS |
| Payment | Cashier A/B | Pay same fulfilled order concurrently | One payment and receipt | HTTP `200` + `409`; one paid payment and receipt | PASS |
| Table move | Waiter A/B | Same source moved to two destinations | One destination wins | HTTP `200` + `409`; one occupied destination; audit pair present | PASS |
| Reconnect recovery | Waiter client | Disconnect, mutate product, reconnect/refetch | Latest DB state recovered | Latest availability recovered | PASS |
| Business sequences | Concurrent workflow | Generate orders, payments, receipts, batches | Unique DB-generated IDs | All populated and unique | PASS |

Database truth was queried after every scenario, and temporary run fixtures/users were removed in `finally` cleanup.

## Defects Found and Fixed

| Severity | Defect / root cause | Fix | Retest |
|---|---|---|---|
| Critical | Two stale table-move requests could both succeed sequentially because the RPC did not validate the caller's expected source table. | Added expected-source validation inside the locked PostgreSQL RPC and propagated it through function/repository/service/UI layers. | PASS local + staging |
| High | Whole-draft replacement used a row lock but no revision check, allowing last-writer-wins lost updates. | Added `orders.draft_version`; draft writes now require the expected version and reject stale writes with `409`. | PASS quantity-vs-removal race local + staging |
| High | Draft replacement accepted legacy `PENDING` payment state but new drafts use `UNPAID`. | Aligned the RPC invariant with `UNPAID` while retaining legacy compatibility. | PASS local + staging |
| High | Tables introduced by later migrations lacked operational grants for `service_role`; RLS bypass alone does not grant table access. | Restored table and sequence grants for `service_role`. | PASS local + staging cleanup/inspection |

## Regression Results

- `npm run test:integration-contracts`: PASS
- `npm run test:security-contracts`: PASS
- `npm run test:split-money`: PASS
- `npm run build`: PASS
- `npm run lint`: PASS
- Local concurrency suite: PASS (11 scenarios)
- Staging concurrency suite: PASS (11 scenarios)
- Local/remote migration history: synchronized through `20260825152000`
- Updated `orders` and `tables` Edge Functions: deployed to staging

## Critical Production Blockers

No database/API blocker was reproduced after fixes for duplicate orders, double payment, double table assignment, duplicate batches, stale kitchen transitions, lost draft updates, or Realtime recovery.

The Cloudflare/browser release is not fully certified from this checkout: `wrangler.jsonc`, a Wrangler dependency, and a frontend deployment script are absent. Physical offline/sleep/background-tab behavior and rendered UI staleness therefore remain manual browser acceptance items.

## Final Decision

**NOT READY FOR PRODUCTION** as a complete browser-delivered system until the staging frontend is deployed and the remaining browser lifecycle checks pass. The tested Supabase database, Edge Functions, atomic operations, and Realtime client behavior are ready for that final acceptance pass.
