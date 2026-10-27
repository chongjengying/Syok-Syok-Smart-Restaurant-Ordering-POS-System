# Component consistency checklist

**PARTIALLY VERIFIED** — inventory and proposed acceptance checks.

| Component | Current finding | Required enhancement / check |
|---|---|---|
| IpadShell | Demo frame and several small controls surround operational UI | Compact production layout; preserve every context/action prop; move preview modes to explicit preview tooling |
| Button | Shared component exists but adoption is sparse | Consistent variants, sizes, busy state, accessible name; preserve type/disabled/handler behavior |
| PageHeader | Available alongside many bespoke headers | Standard title/context/action hierarchy; responsive action wrap |
| SearchFilterBar | Existing shared primitive | Associated labels; clear/reset; stable filter values and focus |
| StatusBadge | Existing semantic component | Text plus color; distinguish reversal from failure; do not rewrite status values |
| AccessibleDialog | Forward Tab containment observed in inventory | Verify initial Shift+Tab, no-focusable case, unique label IDs, rerenders and focus restoration before wider reuse |
| POS overlays | Custom fixed layouts and inconsistent semantics | Reuse hardened dialog behavior with separate POS layout; keep operation-specific dismissal guards |
| Form fields | Mixed nested labels, htmlFor and unassociated labels | Associate labels/hints/errors without changing input parsing or saved values |
| Data table wrappers | Global mobile min-width | Intentional overflow cue or mobile details; retain access to actions and complete data |
| Toasts and alerts | Admin polite status exists; other messages vary | Consistent severity and persistence; focus important validation errors; no transient-only financial error |
| Loading/empty panels | Implemented unevenly | Distinguish no records, permission denial, network failure and unavailable metrics |
| Product cards | 306px fixed height in current source | Density presets, readable price/name, stable missing-image fallback, unavailable semantics |
| Money values | Screen-specific emphasis/alignment | Tabular numbers and consistent currency display; reuse existing formatting/calculation utilities |
| Icons | Lucide already in use | Label icon-only actions; decorative icons hidden from accessibility tree |
| Confirmation panels | Native confirms plus custom overlays | Consistent presentation without removing approvals, reasons or transaction confirmation |
| ReceiptPreview/ShiftSummary | Shared domain presentation exists | Reuse before duplicating; preserve print styles and financial attribution |

Adopt primitives incrementally when touching a page. Avoid a whole-application rewrite or a generic form engine without a demonstrated need.

## 13 October implementation update

The original sections above preserve the audit baseline. See the [implementation report](implementation-report-2026-10-13.md) and [updated issue register](issue-register.md) for delivered changes, current verification, files and remaining work. Do not interpret historical “pending” or failure entries as post-change results.
