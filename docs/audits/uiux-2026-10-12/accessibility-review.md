# Accessibility review

**PARTIALLY VERIFIED** — DOM, keyboard samples, source and static contrast checks. This is not a WCAG conformance audit.

## Observed checks

| Check | Evidence | Result |
|---|---|---|
| Product-options modal forward Tab containment | 15 presses; final six focus positions outside overlay | VERIFIED FAIL |
| Inventory dialog forward Tab containment | 14 presses; all inside role=dialog | VERIFIED PASS — this sequence only |
| Mobile admin navigation Escape | Drawer still present after Escape | VERIFIED FAIL |
| Payment input names | Visual labels without label association for amount applied/cash received | VERIFIED FAIL |
| Admin form label samples | DOM inventory finds unassociated inputs in orders, payments, receipts, audit, providers and dashboard | VERIFIED FAIL — sampled fields only |
| Small control bounds | Several shell/language controls below product touch goals | PARTIALLY VERIFIED — spacing exceptions not evaluated |
| Screen reader / full keyboard order / zoom / forced colors | Not exercised | NOT VERIFIED |

A modal should keep focus within the interaction and restore an appropriate focus target when closed. [WAI-ARIA modal dialog guidance](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

The inventory result does not cover initial Shift+Tab, nested dialogs, callbacks changing during rerender or every close path. The reusable dialog source warrants those tests before adoption across POS.

## Contrast

Static sRGB relative-luminance calculations are recorded in `contrast.json`. White over `#D4AF37` is approximately 2.10:1 and over `#C59A2A` approximately 2.62:1. The modifier action uses a gold gradient with white text. Verify its actual rendered background and every interaction state when selecting a replacement.

Normal text requires 4.5:1 and large text 3:1 under the relevant WCAG contrast criterion. [W3C contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum/). These sampled white/gold combinations fall below both thresholds; this is not a complete assessment of every gradient pixel, status color or page.

## Touch and keyboard specification

Use 44px admin and 48px POS targets as product design goals. WCAG 2.2 AA target sizing is 24px with spacing alternatives and exceptions, so “below 44px” alone is not evidence of a WCAG failure. [W3C target sizing guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum/).

Provide a visible focus indicator; preserve it in dark headers. Give close, edit, increment and decrement icon buttons names including their target item when needed. Keep DOM order aligned with visible layout after responsive rearrangement. Statuses and table occupancy need text plus color.

## Feedback and forms

Associate labels, hints and errors; focus the first invalid field when appropriate. Announce important asynchronous results without repeatedly interrupting PIN entry or kitchen updates. Keep actionable errors visible long enough to recover. Preserve existing disabled/busy states and ensure financial failures cannot be mistaken for confirmed payment.

Long names, Chinese/Malay strings, reduced motion, 200% zoom, actual on-screen keyboards and screen-reader speech remain NOT VERIFIED.

Evidence files: [contrast calculations](evidence/contrast.json), [POS focus sequence](evidence/pos-modal-focus.json), [inventory focus sequence](evidence/dialog-focus.json), [navigation Escape result](evidence/nav-keyboard.json).

## 13 October implementation update

The original sections above preserve the audit baseline. See the [implementation report](implementation-report-2026-10-13.md) and [updated issue register](issue-register.md) for delivered changes, current verification, files and remaining work. Do not interpret historical “pending” or failure entries as post-change results.
