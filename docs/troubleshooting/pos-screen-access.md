# POS screen access and troubleshooting

## Start here

| Experience | Local | Staging |
| --- | --- | --- |
| Real POS | [Open POS](http://127.0.0.1:5173/pos) | [Open POS](https://syok-syok-pos-staging.jengying0503.workers.dev/pos) |
| Device activation | [Terminal setup](http://127.0.0.1:5173/pos/setup) | [Terminal setup](https://syok-syok-pos-staging.jengying0503.workers.dev/pos/setup) |
| Admin | [Admin dashboard](http://127.0.0.1:5173/admin#admin/dashboard) | [Admin dashboard](https://syok-syok-pos-staging.jengying0503.workers.dev/admin#admin/dashboard) |
| Connection diagnostics | [System health](http://127.0.0.1:5173/admin#admin/system-health) | [System health](https://syok-syok-pos-staging.jengying0503.workers.dev/admin#admin/system-health) |
| Mock POS workflows | [POS preview](http://127.0.0.1:5173/pos/preview) | Excluded from staging |
| Mock admin workflows | [Admin preview](http://127.0.0.1:5173/preview/admin) | Excluded from staging |

The preview lets you inspect mock screens without activating a device. Testing the real POS requires an activated terminal, an authorized staff PIN, and an open shift where required. Preview signup and company invitations do not provision live businesses.

## Open the real POS

1. Sign in to Admin with an existing company administrator account. Check that its company and branch are active.
2. In **Staff → Staff records**, create or select operational staff, assign their role and branch access, and configure PIN onboarding.
3. In **Settings → Terminals**, create/select a terminal for that branch and generate an activation code.
4. Open `/pos/setup` in the browser profile that will operate that physical device. Enter the temporary six-digit code.
5. Continue to staff sign-in. Select authorized staff and enter their PIN. Finish permanent PIN setup if the temporary PIN requires it.
6. Open the cash shift with opening cash where required, then start an order.

An administrator account normally routes to Admin. To operate POS while retaining an admin session, use a separate browser profile and activate the POS in that profile. Device credentials belong to that browser context. Staff access still depends on backend company, branch, terminal and permission checks.

## All operational screens

Most operational screens are reached through workflow buttons inside `/pos`; they do not each have an independent URL. `/pos/sales` and `/pos/kitchen` are role landing URLs. Reloading one still restores and validates the device/staff context.

| Screen | How to reach it |
| --- | --- |
| Terminal setup | Open `/pos/setup` on the device being activated. |
| Staff selector and PIN | Complete activation or use **Switch Staff** on the terminal. |
| Permanent PIN setup | Follow the prompt after a temporary/reset PIN is accepted. |
| POS home | Sign in as operational staff; sales-role landing is `/pos/sales`. |
| Cash shift | Home → **Cash Shift**, or the current-shift toolbar action when available. |
| Dining mode and tables | Home → **Start Order**. Choose dine-in/table or takeaway. |
| Menu and product customization | Continue from dining/table selection; tap a product. |
| Cart and order review | Continue through the menu checkout and review actions. |
| Order status and receipt | Send the order, or open an existing order. Receipt actions depend on its state. |
| Unpaid orders and order detail | Home → **Unpaid Orders** → select an order. |
| Full payment | Eligible order → **View Bill / Pay**. Requires payment permission and a permitted role. |
| Split bill / remaining payment | Eligible order detail → **Split Bill** or **Pay Remaining**. |
| Payment confirmation | Complete an authorized payment. |
| Kitchen queue | Kitchen staff landing `/pos/kitchen`, or Home → **Kitchen Queue** when permitted. |
| Ready to serve / collect | Home → the ready-to-serve/collect action when permitted. |
| Table operations | Home → **Table Operations** when permitted. |
| Reports | Home → **Sales Reports** when the staff role and `report.view` allow it. |
| Personal profile | Open the profile action in the terminal toolbar. |
| Locked terminal | Use **Lock** in the toolbar; unlock with the authorized PIN. |

## All admin screens

Open Admin, select the primary module, then its section tab. **Find a module** also searches these routes. Prefix each route below with the local or staging origin from the first table. Visibility depends on the signed-in account's permissions.

| Primary module | Sections and URLs |
| --- | --- |
| Dashboard | Overview: `/admin#admin/dashboard` |
| Menu | Items: `/admin#admin/products`; categories: `/admin#admin/categories`; inventory: `/admin#admin/inventory`; promotions: `/admin#admin/promotions`; vouchers: `/admin#admin/vouchers` |
| Orders | Orders: `/admin#admin/orders`; payments/refunds: `/admin#admin/payments`; receipts: `/admin#admin/receipts`; registers/shifts: `/admin#admin/cash-shifts` |
| Tables | `/admin#admin/tables` |
| Staff | Staff records: `/admin#admin/users`; roles/permissions: `/admin#admin/roles` |
| Reports | Sales: `/admin#admin/reports`; discount activity: `/admin#admin/discount-activity`; audit: `/admin#admin/audit`; e-invoices: `/admin#admin/einvoice` |
| Settings | Overview: `/admin#admin/settings`; restaurant: `/admin#admin/company`; branches: `/admin#admin/branches`; terminals: `/admin#admin/terminals`; payment methods: `/admin#admin/payment-providers`; QR payments: `/admin#admin/qr-settings`; preferences: `/admin#admin/system-administration`; personal profile: `/admin#admin/profile`; health: `/admin#admin/system-health` |

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `/pos/`, `/pos/sales` or `/pos/kitchen` returns HTTP 404 | The staging Worker must include these app routes. Release 0.9.2 adds them and accepts a trailing slash on recognized routes. |
| POS opens Admin | An administrator session is active. Use the activated operational browser profile for POS. |
| Device not activated / terminal unavailable | Check terminal activation, device revocation, company/branch status, and the terminal assignment in Admin. |
| Staff missing from sign-in | Check active staff/profile status, assigned branch, role status and terminal access restrictions. |
| POS button missing | Check both the staff role's POS capabilities and its granted permissions. A cashier, waiter and kitchen operator have different screens. |
| Cannot start an order or take payment | Check shift state, permissions, connection errors and order state. Unsent draft items must be submitted before payment. |
| Reports missing from POS home | Release 0.9.2 connects the existing Reports screen to the home action. The role must also have reporting capability and `report.view`. |
| API reliability is red but live APIs are healthy | The 24-hour reliability card includes historical failures until they age out. Inspect **Live API Connections** for the current snapshot. |
| Printer, KDS, external gateway or backup is unknown | No successful integration proof is available. These must not be assumed connected from an HTTP route check. |

## Verification scope for 0.9.2

- **VERIFIED FAIL** before the fix: staging HTTP GET `/pos/`, `/pos/sales` and `/pos/kitchen` each returned 404.
- **VERIFIED PASS** locally: `POS_WORKER_BASE_URL=http://127.0.0.1:8787 npm run test:preview-routing` — all 23 checks, including the real local Cloudflare runtime, preview exclusions, missing assets and recognized POS routes.
- **VERIFIED PASS** locally: `node scripts/test-terminal-setup-ui-local.mjs` — real local Auth plus simulated activation response states, staff-sign-in transition, separate admin login, mobile layout and temporary Auth-user cleanup. This is not a complete real-activation browser journey.
- **VERIFIED PASS** locally: the actual `WelcomeScreen` was rendered in a browser; the permitted Reports action invoked its callback, the action was absent without access, and its Malay label rendered. This is component coverage, not an authenticated reporting journey.
- **VERIFIED PASS**: login contracts, terminal access state tests, device-proof tests, checkout draft tests, lint and the staging build.
- **VERIFIED PASS** locally: `node scripts/test-financial-concurrency-local.mjs` — payment/refund/void/discount/shift-close concurrency and cash reconciliation; authorized daily-sales/payment report page and summary RPCs; frontend report-summary conversion. The local terminal manager lacks `report.view`, so its report reads were correctly denied; administrator report reads succeeded. No role permissions were broadened.
- **NOT VERIFIED**: every POS screen as a complete signed-in browser journey; authenticated staging workflows without dedicated staging test credentials; physical printer/KDS operation and external gateway settlement.

Local screenshots, component-check evidence and post-deployment HTTP results are retained in ignored `test-results/pos-screen-troubleshooting/` artifacts.
