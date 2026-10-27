# UI/UX audit report

**PARTIALLY VERIFIED**

## Scope and method

Audited the current dirty worktree, preserving existing changes. Inventoried 212 frontend JS/JSX/TS/TSX/CSS files (20,907 lines), traced the application and admin route composition, and reviewed shared styles, components, forms, operational screens and relevant data hooks. Structural inventory is not a claim that every line or every state received a full semantic review.

Rendered the 24 authorized admin sections at 1366 × 768 with a temporary local administrator. Sampled authentication and five admin sections at four additional viewport sizes. Exercised a local terminal activation, first staff PIN reset, cashier shift opening, takeaway product selection, customization, cart review and payment entry; switched to kitchen and waiter roles on that same terminal. See the page and responsive registers for coverage and limitations.

Environment: Vite `http://127.0.0.1:5173`, local Supabase `http://127.0.0.1:54321`. The capture tools assert that the frontend points to that local API. The in-app browser bootstrap failed before connection; isolated Playwright Chromium supplied the rendered evidence. No staging or production environment was tested.

## Architecture and existing strengths

- React/Vite, Tailwind and CSS tokens in `src/index.css`; Lucide icons; existing shared Button, PageHeader, SearchFilterBar and StatusBadge components. Extend this foundation.
- `App.jsx` selects operational screens; AdminShell maps 24 permission-filtered hash sections. Frontend visibility complements existing backend enforcement.
- Staff selection, PIN setup, terminal context, shift state and permission-aware actions already exist. Current Auth-backed profiles, registered terminals and terminal staff sessions must not be described as fully separate device Auth and Auth-free staff identities.
- Inventory's existing AccessibleDialog kept focus inside for the observed forward-Tab sequence. Several forms use associated labels, status messaging and disabled processing states.
- The local POS journey reaches a server-created order and a populated payment screen. This is useful integration evidence, not proof of payment settlement.

## Highest-impact findings

| Finding | Impact | Evidence | Priority |
|---|---|---|---|
| Fixed product-options dimensions and 320px image pane obscure options/actions at phone width | Wrong or incomplete modifier selection is harder to detect | `CustomizationModal.jsx:105`, `:130`; mobile screenshot | P1 |
| Keyboard focus exits the product-options overlay into the underlying page | Operators lose their interaction context | Recorded 15-Tab sequence; six positions outside the modal | P1 |
| Payment amount and cash-received labels are visually present but not associated with inputs | Assistive technology cannot reliably identify these financial fields | `PaymentScreen.jsx:234`; rendered DOM inventory | P1 |
| Demo device selector, bezel and simulated device status occupy operational space | Smaller product area and multiple stacked headers, especially on phones | IpadShell and screenshots at all five sizes | P1 |
| Cart/payment actions require substantial scrolling on phones | Order total and next action are separated during checkout | Cart and payment mobile captures | P1 |
| Admin mobile navigation remains open after Escape | Keyboard dismissal is inconsistent with modal interaction | `nav-keyboard.json` | P2 |
| Gold gradients with white labels have insufficient contrast at sampled color stops | Key button labels are harder to read | Static color calculation; see accessibility report | P2 |
| Brand names vary between login, welcome and ordering | Product identity and context are inconsistent | SYOK SYOK POS / LUXURY POS / AURA POS | P2 |
| Local login footer says STAGING while shell says LOCAL | Operators can misidentify environment | Auth screenshot; AuthScreen line 455 | P2 |
| Dashboard puts large administration/health cards ahead of operational metrics | Business owners must scan past setup content | Settled dashboard screenshots | P2 |
| Admin mobile tables use a global 720px minimum width | Important trailing fields/actions require horizontal navigation | `index.css:167`; staff and payment screenshots | P2 |
| Many page-specific button, field and dialog styles bypass shared components | Inconsistent density, states and keyboard behavior | Structural scan: 413 native button tags, three shared Button usages | P2 |

Counts are static tag occurrences, not distinct live controls or defects. No P0 incident was established by this audit.

## Workflow observations

The measured scripted takeaway path, after an open shift and arrival at the menu, uses five explicit actions from product Add to the populated payment screen: open customization → Add to Cart → Checkout → Review Order → Continue to Pay. Payment confirmation is a further action and was not submitted. This count excludes search keystrokes, modifiers, quantity edits, tender input and activation/login. It is not a timed usability study.

The first-login PIN replacement adds a required security step. Keep that step. Improve the distinction between ordinary sign-in and first-use PIN setup through headings and progress feedback. Do not reduce approval or payment controls solely to reduce clicks.

Receipt printing, refunds, split settlement, manager approval, order editing after kitchen preparation and shift reconciliation need separate authenticated journeys before redesign acceptance. Their current source can inform a proposal; it cannot establish successful operation.

## Boundaries

Some initial screenshots caught loading or Saving PIN states. Settled captures supersede them for final-state findings; originals remain diagnostic evidence. A retry also found a nonunique fixture product name; the runner was corrected to use a unique name. Neither condition is reported as an application defect.

No application behavior, database schema, RLS, financial calculation or backend service was modified. Temporary local audit data was created; unpaid orders and zero-cash shifts were retired while retaining audit history. See the regression report for exact fixture checks and outstanding coverage.

## 13 October implementation update

The original sections above preserve the audit baseline. See the [implementation report](implementation-report-2026-10-13.md) and [updated issue register](issue-register.md) for delivered changes, current verification, files and remaining work. Do not interpret historical “pending” or failure entries as post-change results.
