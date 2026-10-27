# Design system specification

**PARTIALLY VERIFIED** — current tokens inspected; proposed values await implementation and rendered verification.

## Foundation

Continue Tailwind, `src/index.css`, Inter and Lucide. Share foundations across admin and POS while keeping distinct layouts and density. Do not add a UI framework.

| Token family | Current foundation | Proposed use |
|---|---|---|
| Brand | Gold `#C59A2A`, hover `#A77E18`; other screens use `#D4AF37` | One gold accent; use dark text on gold and verify all states |
| Primary action | Existing `.pos-button-primary`: `#18181B` / white | Default high-contrast primary action; one per action group |
| Canvas / surface | `#F5F6F8` / white | Neutral background, white working surfaces |
| Text | `#18181B`, secondary `#667085` | Main text / supporting text; never opacity-reduce essential money values |
| Border | `#E4E7EC` | Dividers; stronger validated contrast for interactive boundaries |
| Semantic colors | Success `#16794B`, warning `#A15C07`, danger `#B42318`, info `#175CD3` | Pair with text and icon; validate foreground/background combinations |
| Spacing | Mixed utilities | 4, 8, 12, 16, 24, 32, 48px |
| Type | Inter; extensive tiny uppercase text | 12 metadata, 14 admin body, 16 POS body, 20 section, 24 page, 32 totals; tabular numerals for money |
| Radius | Existing 6 / 10 / 14px tokens | 6 controls, 10 cards, 14 dialogs; remove arbitrary shape differences |
| Elevation | Existing subtle shadow | Border-first cards; one restrained overlay shadow |
| Heights | Mixed | Admin primary controls 44px; POS controls 48–56px; keypad at least 56px where space permits |
| Focus | Mixed | Visible 2px focus outline with offset; verify contrast on light and dark surfaces |
| Motion | Mixed scale/gradient transitions | Short color transitions; respect reduced motion; avoid scaling payment controls |

The 44/48px targets are product goals, not a blanket statement of WCAG AA's threshold. [WCAG 2.2 target sizing](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum/) specifies 24px with applicable alternatives and exceptions.

## Layout behavior

Use available content width rather than assuming a 1024px device yields a 1024px workspace. Proposed breakpoints: below 768 narrow layout; 768–1099 compact/tablet; 1100 and above full operational layout. Reconcile existing Tailwind and POS media rules before implementation.

- Admin: compact header, collapsible desktop sidebar, modal mobile navigation, a single obvious content scroll region.
- POS wide: category rail, responsive product grid, order panel about 320–380px when available.
- POS compact: horizontal categories, product grid, persistent order summary opening an order panel.
- POS phone: product list/grid and order view; persistent total/action; full-width modifier sheet with a bounded scroll body and visible footer.
- Payment: amount due, selected method, tender input and confirmation form one coherent task. On phones allow summary collapse without hiding amount due or payment state.

## Components and states

Button variants: primary, secondary, quiet, danger. Keep loading text, disabled behavior, accessible names and backend-triggering handlers intact. Use `aria-busy` where appropriate; do not signal success before the existing API confirms it.

Fields: visible label associated by ID, optional hint, required indication matching validation, inline error associated through `aria-describedby`, and invalid state. Use monetary input modes without altering parsing or rounding.

Dialog: labelled modal region, initial focus appropriate to content, Tab/Shift+Tab containment, Escape where existing flow allows cancellation, explicit close action, focus restoration, scroll boundary and touch-safe footer. Financial processing must keep existing dismissal safeguards.

State panels: loading, empty, unavailable, permission denied, recoverable error and offline. Each state explains the next available action. Do not equate offline with safely queued payment unless supported by the existing system.

Statuses: label plus color/icon; distinguish workflow progress, successful reversal and errors. Do not convert database statuses or reinterpret accounting values as part of presentation work.

## Acceptance

Verify every adopted component at all five audit sizes, keyboard-only navigation, 200% zoom, long labels, translated strings, reduced motion and loading/error states. Screen-reader and physical-touch checks remain required; current audit has not completed them.

## 13 October implementation update

The original sections above preserve the audit baseline. See the [implementation report](implementation-report-2026-10-13.md) and [updated issue register](issue-register.md) for delivered changes, current verification, files and remaining work. Do not interpret historical “pending” or failure entries as post-change results.
