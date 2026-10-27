# Restaurant POS improvement plan

**PARTIALLY VERIFIED** — current local journey inspected; proposed changes await approval.

## Prioritized increments

| Order | Increment | Existing integration to preserve | Acceptance evidence |
|---|---|---|---|
| 1 | Responsive product-options dialog; accessible payment labels | Modifier validation, quantity, add/update handlers, tender parsing | Five sizes; keyboard containment/return; required modifier errors; unchanged totals |
| 2 | Compact operational shell and consistent identity | Terminal/branch/staff/shift context, lock, switch, logout, network status | Every role sees permitted controls; no lost session or hidden critical state |
| 3 | Product grid and persistent cart access | Search, category filter, availability, customization, current order state | Long names, images absent, unavailable products, large catalogs and touch targets |
| 4 | Cart/review hierarchy and focused payment layout | Existing discount approvals, tax, backend totals, idempotent submission | Edit/remove, cancel recovery, payment retry, partial/split/QR paths and no duplicate settlement |
| 5 | Kitchen and serving task hierarchy | Existing order states, branch scope, realtime updates, role checks | Populated queues; start/ready/serve/collect; reconnect and cross-device visibility |
| 6 | Shift and receipt refinement | Expected cash, variance, attribution, close rules, printing | Zero and nonzero shifts; shortages/overages; printer/PDF; receipt values unchanged |

## Screen proposals

**Menu:** retain category/product/order arrangement on wide screens. Reduce decorative image height and oversized cards, keep names and selling prices readable, and keep order quantity/total visible. On portrait/tablet use horizontal categories and an expandable order panel. On phone use a persistent cart summary and clear return-to-products action. Barcode controls only if supported by existing code.

**Customization:** stack image/name summary above options on narrow screens; put the image behind a compact summary if needed. Options scroll within the sheet. Quantity and Add to Cart stay visible and do not overlap. Announce required-group errors. Preserve existing modifier rules and price calculation.

**Cart/review:** show item, modifiers, quantity and line total together. Separate reversible draft edits from authorized void/cancel actions. Distinguish estimated totals from the server-confirmed amount when those stages differ. Consolidating review screens is a workflow proposal requiring separate approval and checkout regression evidence.

**Payment:** prominent amount due and order identity; clearly selected tender; labelled amount applied/cash received/change fields; visible processing/error state. Keep voucher entry secondary. Keep confirmation and retry semantics. Retain split/partial behavior and never imply settlement from button animation alone.

**Staff:** terminal/branch context, staff selection, PIN keypad and error region remain clear. First-use reset headings distinguish setup from routine sign-in. Do not disclose PINs, lockout internals or credentials. Preserve authentication architecture and rate/lockout controls.

**Tables:** label available/occupied states, keep table number and linked order discoverable. Preserve waiter assignment, branch scope and existing transfer support. No new transfer function is proposed without verified backend support.

**Kitchen/serving:** prioritize table/order number, age, items and next permitted action; use status text plus color. Show empty, disconnected and reconnecting states distinctly. The serving queue was captured empty; the kitchen-role fixture reached the welcome screen without a queue action. Kitchen queue rendering and populated-ticket usability are NOT VERIFIED.

**Shifts:** organize opening float, expected cash, actual cash and variance with descriptive labels. Closing confirmation must preserve current backend calculations and authorization. Operational staffing/session identity is separate from cash shift state.

## Workflow measurement and hardware

The scripted takeaway path has five actions from product Add through arrival at payment, excluding search and tender entry. Collect task time and operator errors on real hardware before setting a speed-improvement claim. Do not remove security confirmations to meet a tap-count target.

For simultaneous cashier, kitchen and waiter testing, use three registered terminals and three isolated browser profiles/devices. Multiple Chrome Incognito windows normally share the same private session, so they are insufficient isolation by themselves. The audit switched three roles sequentially on one terminal; concurrent cross-device order/payment/serving behavior is NOT VERIFIED.

Physical touchscreen dimensions, browser zoom, on-screen keyboards, scanner and receipt printer behavior are NOT VERIFIED. Desktop viewport emulation provides an initial layout gate only.

## 13 October implementation update

The original sections above preserve the audit baseline. See the [implementation report](implementation-report-2026-10-13.md) and [updated issue register](issue-register.md) for delivered changes, current verification, files and remaining work. Do not interpret historical “pending” or failure entries as post-change results.
