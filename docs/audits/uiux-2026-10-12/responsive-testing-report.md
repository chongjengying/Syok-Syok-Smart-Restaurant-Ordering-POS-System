# Responsive testing report

**PARTIALLY VERIFIED** — Chromium viewport emulation; physical hardware and virtual keyboards NOT VERIFIED.

## Coverage

The final admin run produced 52 captures: authentication (default and fullscreen at laptop, plus four sizes), 24 admin sections at laptop, five selected sections at four additional sizes, inventory dialog and mobile navigation. The final POS run produced 51 captures. These are 103 rendered captures, not 103 independently completed functional tests.

| Screen family | 1920×1080 | 1366×768 | 1024×768 | 768×1024 | 390×844 |
|---|---|---|---|---|---|
| Authentication | Captured | Captured | Captured | Captured | Captured |
| All 24 admin sections | Selected only | Captured | Selected only | Selected only | Selected only |
| Dashboard, terminals, staff, payments, settings | Captured | Captured | Captured | Captured | Captured |
| Terminal setup, staff selector, cashier home | Captured | Captured | Captured | Captured | Captured |
| Product menu, options, cart, payment entry | Captured | Captured | Captured | Captured | Captured |
| Kitchen-role landing (welcome, not queue) | Captured | Captured | Captured | Captured | Captured |
| Ready to Serve / Collect empty queue | Captured | Captured | Captured | Captured | Captured |
| Activation confirmation, shift opening/active, dining, order review, waiter home | — | Captured | — | — | — |

Most final captures use Fullscreen Responsive selected explicitly. The default framed layout has separate login evidence. “Fullscreen” still uses a 1400px maximum width and outer shell, so a 1920px viewport does not provide a 1920px application workspace.

## Findings by viewport

- **1920:** excessive surrounding frame/unused width; dashboard hierarchy is clearer only because more cards fit. Opportunity for deliberate content width, not indiscriminate stretching.
- **1366:** most admin and wide POS structures are visible; multiple headers reduce height. Payment confirmation may require inner scrolling; larger windows do not remove the need for reachable actions.
- **1024:** three-column menu becomes compressed; options dialog fits better than on phone but retains a large image pane. Cashier actions compete with multiple context rows.
- **768 portrait:** menu switches to stacked regions. Cart item area retains excessive height before summary. Payment tender entry falls below the visible summary. Modal proportions remain desktop-oriented.
- **390:** product-options content/action is clipped; cart rows and summary compete for narrow width; admin trailing table fields require horizontal scrolling; shell stacks several rows. Serving empty state fits but populated tickets were not tested.

No document-level horizontal overflow was measured in the sampled settled admin views. This does not establish responsive correctness: internal overflow and clipping occur inside bounded containers.

## Required after implementation

Repeat matched viewport captures; inspect interior scrolling and footer reachability; test browser zoom at 200%, long translated text, portrait/landscape transitions, mobile safe areas and keyboard opening on PIN/search/tender fields. Use actual restaurant hardware for touch accuracy and receipt/scanner integration. Record chosen supported devices before making compatibility claims.

## 13 October implementation update

The original sections above preserve the audit baseline. See the [implementation report](implementation-report-2026-10-13.md) and [updated issue register](issue-register.md) for delivered changes, current verification, files and remaining work. Do not interpret historical “pending” or failure entries as post-change results.
