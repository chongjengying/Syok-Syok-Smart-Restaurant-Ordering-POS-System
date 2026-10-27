# UI/UX issue register

Verification describes the evidence for the current finding, not completion of the proposed fix. The 13 October modernization brief authorized frontend implementation. See the implementation report for updated evidence. P0 = critical/unsafe; P1 = high operational impact; P2 = consistency/workflow; P3 = polish. No P0 was established.

| ID | Page | Problem | Severity | Proposed design | Implementation status | Verification |
|---|---|---|---|---|---|---|
| UX-01 | Product options | Fixed dimensions clip options/action at 390px | P1 | Responsive stacked sheet, scroll body, persistent footer | Implemented | VERIFIED PASS — five-size component viewport and Save reachability |
| UX-02 | Product options | Focus escapes overlay; no modal role | P1 | Harden/reuse shared dialog behavior | Implemented | VERIFIED PASS — forward/reverse Tab, Escape and focus return |
| UX-03 | Payment | Unassociated amount/tender labels | P1 | Field IDs and associated labels/errors | Implemented | VERIFIED PASS — labelled amount/tender/provider/reference in component browser |
| UX-04 | Shared shell | Preview controls/bezel consume working area | P1 | Compact operational header; explicit preview mode | Implemented | VERIFIED PASS — authenticated admin and responsive shell captures |
| UX-05 | Cart/payment | Important actions distant from totals on phones | P1 | Persistent context and safe action region | Implemented responsive access; full acceptance remains | PARTIALLY VERIFIED — smaller cart layout, current-order shortcut, payment header; virtual keyboard untested |
| UX-06 | Admin mobile nav | Escape does not close drawer | P2 | Modal navigation keyboard behavior | Implemented | VERIFIED PASS — authenticated mobile drawer Escape and restoration |
| UX-07 | Primary gold actions | White/gold contrast insufficient at sampled stops | P2 | Dark text or dark primary fill | Modifier/menu actions and cart amounts improved | PARTIALLY VERIFIED — sampled dark-on-gold render; global contrast audit incomplete |
| UX-08 | Login/welcome/menu | Three product brand names | P2 | Reuse configured business identity consistently | Login/menu/welcome branding aligned | PARTIALLY VERIFIED — generic Restaurant POS identity; legacy assets remain |
| UX-09 | Login | Local footer incorrectly says STAGING | P2 | Render actual environment label | Implemented | VERIFIED PASS — local shell and source environment label |
| UX-10 | Dashboard | Setup cards precede operational figures | P2 | Existing business metrics first; secondary setup links | Implemented | VERIFIED PASS — authenticated dashboard captures show metrics first |
| UX-11 | Admin tables | Forced 720px tables on phone | P2 | Essential columns/detail access and scroll affordance | Pending | PARTIALLY VERIFIED — actual overflow observed |
| UX-12 | Multiple admin forms | Unassociated inputs | P2 | Labels, descriptions and inline error associations | Sampled financial/provider filters fixed | PARTIALLY VERIFIED — authenticated named-input check; not every form |
| UX-13 | Shell/login | Small header and language controls | P2 | 44px admin / 48px POS product target | Header/cart/kitchen targets enlarged | PARTIALLY VERIFIED — five-size captures; not every control |
| UX-14 | Shared UI | Sparse primitive adoption; repeated visual styles | P2 | Incremental reuse of existing primitives | Native AccessibleDialog reused across overlays | PARTIALLY VERIFIED — component and admin browser checks |
| UX-15 | Menu | Oversized fixed-height product cards | P2 | Compact product density and optional imagery | Implemented compact cards and responsive header | VERIFIED PASS — component menu captures at five sizes |
| UX-16 | Audit | Raw technical record details dominate | P2 | Who/what/where summary with expandable raw detail | Implemented disclosure | VERIFIED PASS — authenticated populated audit disclosure |
| UX-17 | Admin navigation | replaceState may surprise Back navigation | P2 | Verify desired history then preserve filter state | Pending investigation | NOT VERIFIED — source concern only |
| UX-18 | Shared dialog | Initial Shift+Tab / rerender focus edge cases | P2 | Test before broader adoption; unique title IDs | Implemented native modal and explicit Tab wrap | VERIFIED PASS — initial/reverse focus and edit rerenders in component checks |
| UX-19 | Kitchen role landing | Kitchen fixture landed on welcome with no queue action | P1 | Diagnose role/grants/landing separately before visual acceptance | Pending separate functional diagnosis | PARTIALLY VERIFIED — observed role landing; root cause NOT VERIFIED |
| UX-20 | Visual hierarchy | Tiny uppercase labels, variable spacing/radii | P3 | Adopt token scale and normal-case supporting text | Shared foundations improved | PARTIALLY VERIFIED — further module-specific polish remains |
| UX-21 | Admin Payments | Completed payment missing from search; refund UI blocked | P1 | Separate scoped authorization diagnosis and security regression | Open; backend unchanged | VERIFIED FAIL — repeated live admin search |
