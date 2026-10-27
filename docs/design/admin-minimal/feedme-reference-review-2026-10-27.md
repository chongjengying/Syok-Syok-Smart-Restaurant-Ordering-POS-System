# FeedMe public-reference review

Checked: 27 October 2026, Malaysia time. Research only; no application or design changes.

## Located references

| Reference | URL | Evidence and limit |
| --- | --- | --- |
| Merchant portal | https://portal.feedme.cc/ | VERIFIED PASS — HTTP 200, title FeedMe Portal, visible sign-in screen captured in a browser. The screen shows Register or Sign In and a language selector. |
| Official website | https://www.feedme.ai/ | VERIFIED PASS — official product website opened. |
| Public POS features | https://www.feedme.ai/pos/feature | VERIFIED PASS — published descriptions inspected for menu management, outlets, tables, role management, receipts, payments, reporting, and other operational capabilities. Some embedded media did not load. |
| Report features | https://feedme.ai/product/report/features | PARTIALLY VERIFIED — indexed official content describes preset and custom reports; a direct page load returned the page shell/loading state. This is a feature reference, not proof of the current signed-in report layout. |
| Signed-in admin Dashboard and modules | Within the merchant portal | NOT VERIFIED — merchant authentication is required; no account was created and no sign-in attempted. |
| The exact name/domain “FeedMe VVIP” | Unconfirmed | NOT VERIFIED — no official product under this exact name was established. The relevant discovered merchant-management reference is FeedMe Portal. |

The official feature page is a source for published capabilities, not evidence that every capability is available in every plan or deployed merchant account. Older tutorial screenshots are not treated as the latest signed-in UI.

## Design recommendations for the seven-module brief

These are recommendations for this POS, informed by the public references and a read-only review of the current preview. They are not a claimed reproduction of FeedMe's private screens.

| Primary module | Recommended direction |
| --- | --- |
| Dashboard | Keep three compact KPIs, recent orders, top items, branch/date context, and links to the next action. Use one consistent scoped dataset for every value. |
| Menu | Keep items, categories, descriptions/images, modifiers/add-ons, and branch availability together. Explain which outlets/channels an edit affects. |
| Orders | Separate payment and preparation status. Link order details to payments, refunds, receipts, and history; preserve filter context while inspecting a record. |
| Tables | Use area tabs and a simple status/capacity grid. Offer clear add/edit and reservation actions without a complex floor-plan editor. |
| Staff | Group role, assigned branches, account status, and POS readiness. Keep company membership distinct and make the Manager preview follow saved permissions. |
| Reports | Use actual dated mock transactions for date ranges, gross sales, discounts, refunds, tax/service, net receipts, tender mix, and exports. Define all financial terms. |
| Settings | Separate restaurant, tax/service, methods/QR, receipts, printers, permissions, and profile. Keep branch and terminal lifecycle under relevant secondary settings pages. |

Keep the brief's light gray sidebar, white surfaces, and blue accent. FeedMe provides operational inspiration; this project's branding and simpler seven-module navigation remain the design direction.

## Existing preview corrections to prioritize after design approval

PARTIALLY VERIFIED — code inspection rather than a newly executed functional test suite:

1. Replace fixed or mixed-scope Dashboard figures and sample chart arrays with consistent branch/date data. Date ranges beyond Today currently do not implement their full advertised ranges.
2. Tie terminal and shift labels, cash totals, receipts, and audit context to the actual selected/open register. The composer still displays a fixed terminal/shift label.
3. Connect saved permission profiles to the Manager simulation; the shared mutation wrapper currently gives Manager the same access as Owner and only blocks Read only.
4. Complete modifier/add-on interactions and campaign eligibility, including voucher expiry and a usable promotion path in checkout.
5. Add the requested printer-settings design and review its existing backend contract before implementing controls.

Source pointers: `src/preview/admin/components/OperationsDashboard.jsx`, `src/preview/admin/AdminModulePage.jsx`, `src/preview/admin/components/ModuleForms.jsx`, and `src/preview/admin/hooks/previewWorkspace.jsx`.

These findings concern the mock preview. They do not establish a production authorization or tenant-isolation defect.

## Approval boundary

The existing Dashboard artwork remains a proposal awaiting approval. This research does not approve or implement that design, generate the remaining six screens, change production APIs, modify the schema, or deploy anything.
