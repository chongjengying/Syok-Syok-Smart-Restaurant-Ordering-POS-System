# Restaurant Table Lifecycle — Production Integration Report

Date: 2026-08-13

## 1. Audit findings

| Issue | Severity | Cause | Solution | Status |
|---|---|---|---|---|
| Paid/completed dine-in orders released tables directly to `AVAILABLE` | CRITICAL | Legacy trigger skipped the physical cleaning workflow | Terminal paid dine-in orders now transition `OCCUPIED → CLEANING`; only explicit cleaning completion releases the table | FIXED |
| `DISABLED` did not match the operational model | HIGH | Legacy table state naming and UI constant | Migrated persisted state and constraints to `OUT_OF_SERVICE`; synchronized `is_active` | FIXED |
| Two devices could race to claim one table | HIGH | Application checks were not backed by a unique database invariant | Row locking plus a partial unique index permits only one active order per table | FIXED |
| Order and table could be partially moved | HIGH | No atomic move operation | Added transactional `move_pos_order`, deterministic table locking, rollback, audit and idempotent replay | FIXED |
| Table changes were not traceable | HIGH | No suitable audit entity | Added RLS-protected `table_activity_logs` with actor, order, transition, operation key and metadata | FIXED |
| Generic status RPC allowed business workflow bypasses | HIGH | Status mutation was too general | Manual `OCCUPIED`/`CLEANING` changes are rejected; controlled RPCs own these states | FIXED |
| Order retry key was not bound to request content | HIGH | Same key could replay a semantically different request | Fingerprint binding and advisory locks now return `409` for key reuse with a different payload | FIXED |
| Cancellation could leave payment/table state inconsistent | MEDIUM | Cancellation only changed order status | Unpaid payment attempts become `CANCELLED`; early cancellation releases, kitchen-started cancellation requires cleaning; paid cancellation is rejected | FIXED |
| Realtime reconnect could retain stale state | MEDIUM | Subscription did not explicitly reconcile on reconnect | Hook refetches authoritative PostgreSQL state when subscription reaches `SUBSCRIBED` | FIXED |
| No operations-focused table UI | MEDIUM | Selection UI was not a management workflow | Added role-aware table cards, active order context, move/clean/reserve/service operations, errors and confirmations | FIXED |
| Frontend bundle exceeds 500 kB warning threshold | LOW | Main application bundle still contains several eagerly loaded modules | Table management is lazy-loaded; broader route/vendor splitting remains a performance task | OPEN |

No remaining table mock data, fake payment transitions, or timer-controlled table state changes were found in `src`.

## 2. Implemented state machine

```text
AVAILABLE ── create dine-in order atomically ──> OCCUPIED
AVAILABLE ── reserve ─────────────────────────> RESERVED
RESERVED  ── create dine-in order atomically ─> OCCUPIED
RESERVED  ── release reservation ─────────────> AVAILABLE

OCCUPIED ── paid + completed order ───────────> CLEANING
OCCUPIED ── early unpaid cancellation ────────> AVAILABLE
OCCUPIED ── kitchen-started cancellation ─────> CLEANING
CLEANING ── authorized cleaning confirmation ─> AVAILABLE

AVAILABLE/CLEANING ── manager service action ─> OUT_OF_SERVICE
OUT_OF_SERVICE ────── manager restore ────────> AVAILABLE

MOVE A → B (one transaction): source → CLEANING, destination → OCCUPIED
```

The actual order lifecycle remains the existing project lifecycle:

```text
PLACED → CONFIRMED → PREPARING → READY → SERVED → COMPLETED
```

`DRAFT → PLACED` is supported by the database but the current order-creation RPC creates at `PLACED`. Valid cancellations are available from `DRAFT`, `PLACED`, `CONFIRMED`, `PREPARING`, and `READY`; a paid order cannot use cancellation. `COMPLETED → REFUNDED` is rejected until a dedicated provider-aware refund operation exists. Examples such as `COMPLETED → PREPARING`, `PLACED → READY`, and manual table `OCCUPIED → AVAILABLE` are rejected.

## 3. Database changes

### Migrations

- `20260812110000_production_table_lifecycle.sql`
  - Normalizes table states and constraints.
  - Adds one-active-order-per-table partial unique index.
  - Adds table activity audit table, indexes, RLS and Realtime publication.
  - Adds controlled cleaning, service, restore and move RPCs.
  - Replaces table/order synchronization trigger.
  - Makes order creation an authoritative transaction with server-side product prices, options, tax, service charge and total.
- `20260812111000_harden_order_and_table_idempotency.sql`
  - Binds order idempotency keys to MD5 request fingerprints under an advisory transaction lock.
  - Hardens order transition authorization and cancellation/payment consistency.
- `20260812112000_bind_table_move_idempotency.sql`
  - Binds move operation keys to actor, order and destination.
  - Returns the persisted move result on safe retry.

### Integrity and security

- Foreign keys retain order → table, order item → product and payment → order integrity.
- The partial unique index covers active order states: `DRAFT`, `PLACED`, `CONFIRMED`, `PREPARING`, `READY`, `SERVED`.
- All lifecycle RPCs are `SECURITY DEFINER`, have fixed `search_path`, revoke public execution, validate `auth.uid()` against an active profile and expose execution only to authenticated users.
- Audit log reads are RLS-limited to operational roles. The frontend never receives a service-role key.

## 4. Important code changes

- `supabase/functions/tables/index.ts`: validated table endpoints, controlled operations, role checks and safe business-error mapping.
- `supabase/functions/orders/index.ts`: required idempotency keys and structured `400/401/403/409/422/500` responses.
- `supabase/functions/_shared/repositories/tableRepository.ts`: real table and active-order persistence queries.
- `src/features/tables/tableRepository.js`: repository-only Edge Function/RPC access and Realtime subscription.
- `src/features/tables/tableService.js`: persistence mapping and table operation orchestration; bypass helpers were removed.
- `src/hooks/useRestaurantTables.js`: lifecycle-safe subscription cleanup and reconnect refetch.
- `src/hooks/useTableManagement.js`: loading, mutation locking, refetch and UI-safe errors.
- `src/components/TableManagementScreen.jsx`: status cards, active order details, role-aware actions and confirmations.
- `src/components/WelcomeScreen.jsx`, `src/App.jsx`: authorized, lazy-loaded Table Operations route.
- `scripts/smoke-local.mjs`: database/API/auth/payment/table lifecycle, concurrency, idempotency and audit coverage.

## 5. Permission matrix

| Operation | ADMIN | MANAGER | WAITER | CASHIER | KITCHEN |
|---|---:|---:|---:|---:|---:|
| Create/claim dine-in order | Yes | Yes | Yes | Yes | No |
| Reserve/release table | Yes | Yes | Yes | No | No |
| Move active order | Yes | Yes | Yes | No | No |
| Early own-order cancellation | Yes | Yes | Yes* | Yes* | No |
| Late cancellation | Yes | Yes | No | No | No |
| Confirm cash payment | Yes | Yes | Yes | Yes | No |
| Complete cleaning | Yes | Yes | Yes | No | No |
| Set/restore out of service | Yes | Yes | No | No | No |

`*` Non-manager cancellation is limited to the caller's own `DRAFT`/`PLACED` order. UI visibility is not the enforcement boundary; database functions enforce these rules.

## 6. Concurrency and recovery

- Double table claim: table row lock plus partial unique index; exactly one concurrent request succeeds.
- Double order submission: caller/key advisory lock plus unique key and payload fingerprint.
- Double payment: payment/order rows are locked by `confirm_pos_payment`; an existing `PAID` result is returned idempotently.
- Conflicting move: order lock, deterministic source/destination table locks, destination validation and one transaction.
- Cleaning double-click: operation is idempotent; an already available table returns its current state.
- Client timeout after success: retrying the same idempotency/operation key reconciles with persisted state.
- Missed Realtime event/reconnect: PostgreSQL remains authoritative and the hook refetches on subscription reconnection.

## 7. Edge-case behavior

| Case | Expected behavior |
|---|---|
| Two iPads open one table | One `201`; one `409 TABLE_NOT_AVAILABLE`/`ACTIVE_ORDER_EXISTS` |
| Two cashiers pay | Row lock serializes; later request receives persisted `PAID` result |
| Payment provider unavailable | `503`; payment/order remain pending, never falsely paid |
| Destination occupied during move | Move transaction rejects and rolls back |
| Cancel before kitchen | Unpaid order/payment cancelled; table available |
| Cancel after kitchen starts | Manager-only; table enters cleaning |
| Paid stale client attempts cancel/pay | Cancel rejected; payment replay returns paid result |
| Refresh during cleaning | Persisted `CLEANING` reloads; no timer releases it |
| Direct manual occupied/cleaning status | Controlled RPC rejects it |
| Open out-of-service table | Order RPC returns conflict |
| Unauthorized maintenance/cleaning | Database role validation returns forbidden |
| Legacy inconsistent duplicate active orders | Unique index prevents new duplicates; migration would fail visibly rather than silently preserve unsafe data |

## 8. Verification results

| Check | Result | Evidence |
|---|---|---|
| TypeScript | NOT TESTED | Frontend is JavaScript/JSX and has no typecheck script; Edge TypeScript was bundled successfully during deployment |
| Lint | PASS | `npm run lint` |
| Unit tests | PASS | `npm test`: 6/6 |
| Database reconstruction | PASS | `supabase db reset --local --no-seed`: all 19 migrations applied from zero |
| Database lint | PASS | `supabase db lint --local --level warning`: no schema errors |
| Integration/E2E smoke | PASS | Full order/payment/table flow, concurrent claim, auth denial, idempotency and audit assertions |
| Production build | PASS | `npm run build` |
| Browser UI automation | NOT TESTED | No configured browser/UI test runner in the project |
| Remote migrations | PASS | Local and remote migration histories match through `20260812112000` |
| Edge deployment | PASS | `tables` ACTIVE v4; `orders` ACTIVE v7 |

## 9. Remaining risks and production readiness

Restaurant Table Module: **8.5/10**

The transactional core, authorization boundary, database constraints, audit trail, Realtime recovery and API integration are production-oriented. Before allowing an unattended real cafe launch:

1. Run iPad/browser E2E tests against staging, including offline/reconnect, rapid taps, multiple screen sizes and operator usability.
2. Load/concurrency test the linked staging project with many devices; the local race test proves correctness but not production capacity.
3. Integrate and certify real card/QR/e-wallet providers, webhook signature checks and a dedicated refund/void workflow. Current non-cash methods correctly fail closed when unavailable.
4. Add monitoring/alerting for Edge Function errors, payment reconciliation failures, migration health and unexpected table states.
5. Define backup, restore, incident response and staff override procedures; exceptional overrides should receive their own audited manager RPC.
6. Consider replacing MD5 with SHA-256 for idempotency fingerprints as a defense-in-depth improvement; MD5 here is used for deterministic equality, not authentication.
7. Add first-class guest count/table-session fields if the business needs occupancy analytics; current cards show table capacity because the schema has no captured guest count.
