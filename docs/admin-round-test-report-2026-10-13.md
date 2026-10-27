# Admin and POS local test round — 13 October 2026

**PARTIALLY VERIFIED** — broad local regression and real admin CRUD coverage, with an unresolved payment-history visibility failure.

## Environment and cleanup

Tests used a fresh, disposable Supabase project `Pos_Admin_Round_20261012`, API port 56321 and frontend port 5183, applying the repository migrations. No primary local business data was used as disposable fixtures.

**VERIFIED PASS** — cleanup: stopped the test frontend; ran `supabase stop --project-id Pos_Admin_Round_20261012 --no-backup`; confirmed zero matching containers and volumes; removed the temporary workspace. Primary `Pos_Order` remained healthy and its frontend returned HTTP 200 at http://127.0.0.1:5173. Test screenshots and non-secret results were retained, not test database records.

## Results

| Area | Verification | Evidence / scope |
|---|---|---|
| Existing regression runner | VERIFIED PASS | `node scripts/check-system-local.mjs`: 32 passed, zero failed/skipped after resolving test-environment setup; [results](../test-results/admin-round-2026-10-12/system-local.md) |
| Admin navigation | VERIFIED PASS | Password login and all 24 implemented sections rendered in Chromium, no recorded JavaScript errors |
| Admin writes | VERIFIED PASS | Company edit; branch, terminal, staff, category, product, table and custom role creation; product/category edits; opening inventory/history/export; payment-provider rename and reload |
| Promotion and voucher dates | VERIFIED PASS | Draft create/edit/delete; browser in Asia/Kuala_Lumpur; persisted dates retain the intended instant after editing |
| Device and staff journey | VERIFIED PASS | `test-complete-branch-journey-local.mjs`: browser activation/PIN, followed by API/RPC shift, order, fulfillment, payment, receipt and close; denied/revoked/foreign-context cases |
| Financial concurrency | VERIFIED PASS | `test-financial-concurrency-local.mjs`: payment, refund, void, discount and shift-close races retain single authoritative records |
| Financial tenant boundary | VERIFIED PASS | Final `test-financial-tenant-boundary-local.mjs`: five foreign finance calls denied without changing the paid order/receipt; fixture dependencies prepared first |
| Admin receipt detail | VERIFIED PASS | Real paid receipt rendered with original amount |
| Admin payment history and refund UI | VERIFIED FAIL | Searching an existing paid payment returned no rows, twice; refund action could not be reached. See screenshot below |
| Post-fix checks | VERIFIED PASS | `node scripts/test-date-time-input.mjs`, `npm run lint`, `npm run build:local`; focused live voucher/promotion CRUD rerun after the fix |
| External gateway / physical receipt printing / simultaneous physical devices | NOT VERIFIED | Local tests do not establish hardware or external settlement behavior |

The 32-check full runner preceded the date fix; focused live tests, unit checks, lint and build followed it. Initial test attempts included selector/readiness/setup errors; raw results retain those attempts. They are not additional product failures or successful tests.

## Bug fixed

Voucher editing passed API timestamps directly to `datetime-local`, displaying blank dates; promotion editing sliced UTC timestamps and presented them as local time. Both now use `src/shared/dateTimeInput.js` for local calendar display while retaining untouched original timestamps in form state. Zero numeric values also remain visible. Added a regression test across Kuala Lumpur, UTC and New York, including day rollover and milliseconds. No database migration, authorization, audit or financial calculation changes.

## Unresolved P1 finding

Completed payments are absent from the admin list despite existing payment and receipt rows in the same company. Inspection found `can_read_pos_order` filters users with `order.kitchen.manage` to active kitchen orders, including administrators who also hold that permission. This is the likely cause of the invoker payment query losing completed orders through its orders join; authorization remediation requires a separate functional change and negative security tests. No policy was weakened during this UI task.

[Payment history failure screenshot](../test-results/admin-round-2026-10-12/evidence/refund-ui-blocker.png).

## Coverage limits

All 24 pages were visited; this does not mean every filter, state, export and action on every page passed. Refund API concurrency passed, but the admin refund browser workflow did not. Device roles were exercised sequentially, not as three simultaneous independent devices. Staging and production were not tested or deployed.

[Raw browser and integration evidence](../test-results/admin-round-2026-10-12/evidence/) · [Cleanup evidence](../test-results/admin-round-2026-10-12/cleanup.json).
