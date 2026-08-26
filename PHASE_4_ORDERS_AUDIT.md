# Phase 4 — Orders Audit

## Decision

**PARTIAL — the real PostgreSQL order flow exists and is substantially protected, but it is not production-ready until the financial rounding and ambiguous-retry defects below are corrected.**

## Critical and high-priority findings

### P0 — Stored order total and pending payment amount can disagree

`create_pos_order` calculates `round(subtotal * 0.16, 2)` and uses that value for the pending payment. A later `BEFORE INSERT` trigger changes the stored order to separately rounded 6% SST and 10% service charge. Separate rounding does not always equal combined rounding.

For example, a subtotal of RM 0.09 produces RM 0.01 when 16% is rounded once, but RM 0.02 when 6% and 10% are rounded separately. `confirm_pos_payment` correctly rejects a payment whose amount differs from `orders.total`, so such an order cannot be paid.

Required remediation:

1. Replace the compatibility trigger with one authoritative calculation inside `create_pos_order`.
2. Calculate `tax`, `service_charge`, `discount`, and `total` once.
3. Insert `payments.amount` from `new_order.total`, not from an earlier local variable.
4. Add boundary tests covering cent values and rounding policy.

### P1 — Idempotency key is optional and not durable before submission

The frontend generates a UUID in memory, but the API/RPC accepts a missing key. The browser stores the order ID only after receiving a successful response. If PostgreSQL commits but the response is lost, then the page reloads, the in-memory key is lost and a new submission can create another order.

Required remediation:

1. Require a non-empty idempotency key in the Edge Function and RPC.
2. Persist the key before sending the order request.
3. Store a request fingerprint with the key and reject reuse with different content.
4. Retain the key until the client has reconciled the resulting order ID.

### P1 — Concurrent duplicate requests are duplicate-safe but not fully idempotent

The unique `(user_id, idempotency_key)` index prevents two committed orders. However, two concurrent requests can both miss the initial lookup; one succeeds and the other receives a unique-constraint failure, currently surfaced as HTTP 500 instead of returning the existing order.

Required remediation: use an atomic insert/conflict strategy or catch `unique_violation`, then load and return the existing order.

### P1 — Duplicate option IDs can inflate an item price

Option IDs are validated for existence but not uniqueness. A repeated option ID can be counted and priced more than once when a MULTIPLE group permits the resulting selection count.

Required remediation: reject input when `jsonb_array_length(optionIds)` differs from the count of distinct option IDs.

### P2 — Two table columns represent the same relationship

`orders.restaurant_table_id` is the canonical UUID foreign key. The legacy `orders.table_id` text column is also populated and can drift because it has no foreign key.

Required remediation: migrate any legacy value, update consumers to use `restaurant_table_id`, then remove `table_id` after a compatibility window.

### P2 — Discounts are not implemented

`orders.discount` is constrained and included in the final-total trigger, but order creation always writes zero. There is no discount rule, authorization, reason, promotion reference, or audit record.

Required remediation: either explicitly declare discounts out of scope and keep them at zero, or implement server-authoritative discount rules and approval/audit fields.

### P2 — Some validation failures become generic HTTP 500 responses

The endpoint maps unavailable products/tables to 422, but invalid option selections, malformed table UUIDs, and idempotency races can become generic 500 responses. The error still reaches the UI, but its classification and retry guidance are inaccurate.

Required remediation: return stable error codes and appropriate 400/409/422 statuses without leaking internal SQL details.

## Persistence and relationships

| Check | Result | Evidence |
|---|---|---|
| Orders persisted in PostgreSQL | PASS | `public.orders` and `create_pos_order` |
| Order items persisted in PostgreSQL | PASS | `public.order_items` inserted by the same RPC |
| Order → items FK | PASS | `order_items.order_id → orders.id ON DELETE CASCADE` |
| Item → product FK | PASS | `order_items.product_id → products.id ON DELETE RESTRICT` |
| Order → restaurant table | PARTIAL | Canonical UUID FK is correct; redundant text `table_id` remains |
| Multiple items per order | PASS | RPC loops over 1–100 JSON items |
| Quantity validation | PASS | Frontend, Edge Function and RPC enforce 1–99; DB enforces `> 0` |
| Atomic order creation | PASS | Order, items, options and pending payment are created in one PostgreSQL function transaction |
| Dangerous partial inserts | PASS | Unhandled RPC failure rolls back the transaction |

## Pricing and financial integrity

| Check | Result | Notes |
|---|---|---|
| Server-authoritative unit price | PASS | Loaded from active products and selected options |
| Historical price preserved | PASS | `order_items.unit_price`, `subtotal`, option snapshots and product-name snapshot are stored |
| Product price changes alter history | PASS | Existing item/order numeric snapshots are not recomputed |
| Subtotal | PARTIAL | Correct for normal unique options; duplicate option IDs are not rejected |
| Tax | FAIL | 6% value is stored, but split-rounding can disagree with the payment amount |
| Service charge | FAIL | Same split-rounding defect |
| Discount | PARTIAL | Always zero; no discount feature exists |
| Final total | FAIL | Stored total is internally consistent, but pending payment can contain a different total |
| Decimal safety | PARTIAL | PostgreSQL `numeric(10,2)` is appropriate; conflicting rounding paths are unsafe |
| Frontend totals trusted | PASS | Browser sends identities, quantities and selections—not prices or totals |

## Actual implemented order lifecycle

Current order creation starts at `PLACED`. `DRAFT` is allowed by the database and transition function but is not produced by the current create-order RPC.

```text
DRAFT (defined, not created by current checkout)
  ├─→ PLACED
  └─→ CANCELLED

PLACED
  ├─→ CONFIRMED
  └─→ CANCELLED

CONFIRMED
  ├─→ PREPARING
  └─→ CANCELLED

PREPARING
  ├─→ READY
  └─→ CANCELLED

READY
  ├─→ SERVED
  └─→ CANCELLED

SERVED
  └─→ COMPLETED  (requires payment_status = PAID)

COMPLETED
  └─→ REFUNDED

CANCELLED and REFUNDED are terminal.
```

Payment status is a separate state machine: `PENDING`, `PROCESSING`, `PAID`, `FAILED`, `CANCELLED`, or `REFUNDED`. Payment does not skip kitchen/order statuses.

## Authorization matrix

| Role | Allowed order transitions |
|---|---|
| ADMIN | Any transition permitted by the lifecycle graph |
| MANAGER | Any transition permitted by the lifecycle graph |
| KITCHEN | `PLACED→CONFIRMED`, `CONFIRMED→PREPARING`, `PREPARING→READY` |
| WAITER | `READY→SERVED` |
| CASHIER | `SERVED→COMPLETED`, and cancellation of their own DRAFT/PLACED order |
| Order owner | May cancel their own DRAFT/PLACED order |

Only active profiles pass the transition RPC. `COMPLETED→REFUNDED` is effectively ADMIN/MANAGER-only.

## Invalid transitions

The database rejects every transition not present in the lifecycle graph. Examples include:

- `COMPLETED → PREPARING`
- `COMPLETED → CANCELLED`
- `CANCELLED → PLACED`
- `REFUNDED → COMPLETED`
- `PLACED → READY`
- `PREPARING → SERVED`
- `READY → COMPLETED`
- `SERVED → CANCELLED`
- Any transition to the current status
- `SERVED → COMPLETED` while payment is not `PAID`

The transition RPC locks the order row, validates the graph and role, writes the new status, and records status history.

## Cancellation, completion and tables

- Cancellation is allowed from DRAFT through READY according to role rules.
- Non-manager owners may cancel only their own DRAFT/PLACED orders.
- CANCELLED is terminal and cannot be paid.
- COMPLETED requires `payment_status = PAID`.
- COMPLETED can only transition to REFUNDED.
- Dine-in orders occupy their table while active.
- Cancellation/refund releases the table.
- A paid, completed order releases the table.

The table behavior is database-triggered and Realtime can propagate its result, but the duplicate `table_id` column should be removed as noted above.

## RLS and direct modification

- RLS is enabled for orders and order items.
- Active owners can read their own orders/items.
- ADMIN, MANAGER, KITCHEN and WAITER can read all orders/items needed for operations.
- Direct authenticated UPDATE policies are not provided.
- Status changes go through the security-definer transition RPC, which performs its own active-profile, lifecycle and role checks.
- Inactive profiles are blocked by RLS and write guards.

Result: authorization is materially enforced, though the role matrix should be confirmed as an explicit business decision—especially CASHIER completing any known served/paid order.

## Frontend recovery and error propagation

The path is:

```text
UI → useCheckout/useOrderDetails → orderService → orderRepository
   → orders Edge Function → PostgreSQL RPC/RLS → PostgreSQL
```

- API errors are converted into structured `ApiError` objects.
- Checkout and payment errors are shown in the payment UI.
- Order-detail load errors are shown on the status screen.
- Kitchen Realtime events trigger an authoritative refetch.
- Successfully reconciled pending/paid order IDs survive refresh through `sessionStorage`.
- Recovery is tab-scoped and fails for the ambiguous commit/response-loss case described under idempotency.

## Verification coverage

Existing automated checks cover:

- Empty-order rejection.
- Invalid-product rejection.
- Sequential idempotent retry.
- Invalid `PLACED → READY` rejection.
- Full normal lifecycle through COMPLETED.
- Status-history persistence.
- Payment/order consistency.
- Kitchen queue visibility.
- Inactive-profile and restricted-role denials.

Coverage still required:

1. Multi-item order and stored item-price assertions.
2. Product price change followed by historical-order verification.
3. Zero, negative, fractional and greater-than-99 quantities at API and RPC boundaries.
4. Duplicate option IDs.
5. Financial rounding boundary cases.
6. Dine-in claim, cancellation and completion table behavior.
7. Concurrent requests using the same idempotency key.
8. Commit-success/response-timeout/page-reload recovery.
9. Complete role-transition matrix.
10. Direct RLS attempts to read or update another user’s order.

## Final recommendation

Do not classify Orders as production-ready yet. Fix P0 financial calculation first, then harden durable/concurrent idempotency. After that, remove the legacy table column, define the discount scope, improve domain error mapping, and add the missing concurrency/financial/RLS tests.
