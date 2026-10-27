# Regression test report

**PARTIALLY VERIFIED** — audit-only local exercise; no production UI implementation yet.

## Commands and observations

All tools below ran against local Vite `127.0.0.1:5173` and Supabase `127.0.0.1:54321`; the capture scripts check that the frontend uses that API. Scripts and raw artifacts reside in `test-results/uiux-audit-2026-10-12/` (Git ignored).

| Command / evidence | Result | Limit |
|---|---|---|
| `node test-results/uiux-audit-2026-10-12/capture-admin-settled.mjs` | VERIFIED PASS — 52 captures, 0 recorded browser page errors | Does not prove all request responses or mutations |
| `node test-results/uiux-audit-2026-10-12/capture-pos-settled.mjs` final run | VERIFIED PASS — 51 captures; activation, PIN replacement, zero-float shift, order/payment entry, role handoff | Kitchen images show welcome, not queue; no settlement submitted |
| Product-options focus / mobile clipping | VERIFIED FAIL | Recorded usability defects, not test-runner failures |
| Mobile navigation Escape | VERIFIED FAIL | Drawer remained open |
| `node test-results/uiux-audit-2026-10-12/verify-fixtures.mjs` final run | VERIFIED PASS — three fixture scopes retired; zero settlements and open shifts | Cancelled payment-attempt rows retained; see `fixture-verification.json` |
| Original admin/POS capture passes | PARTIALLY VERIFIED | Some images caught loading/PIN saving; superseded by settled captures |
| First settled POS retry | NOT VERIFIED — stopped on ambiguous product locator | Runner corrected to use a unique fixture product name; final rerun completed |
| Earlier `npm run test:system-local` | VERIFIED PASS — 32 checks in earlier local run | Historical baseline, not a redesign regression gate; overall suite coverage PARTIALLY VERIFIED |

Earlier system report: `test-results/system-local/2026-10-12T13-32-43-863Z.md`. No application code has been changed for this UI/UX audit, so build/lint and unrelated financial suites were not rerun solely for Markdown deliverables. A new implementation must run its relevant tests and required build/lint gates.

## Fixture lifecycle

Three explicitly owned local UI audit branches were created across capture attempts. Retire their staff and catalog, revoke terminals, cancel their unpaid orders, and close their zero-cash shifts using existing APIs/RPCs. Preserve audit/history records and deactivate the temporary administrators retained by audit relationships. Separate read-only admin-capture users were removed after use.

Fixture verification checks inactive branches/staff, revoked terminal devices, no open shifts, cancelled orders and zero settled payments associated with those orders; automatically created pending payment records were cancelled and retained. No production/shared data was reset, truncated or migrated. No application credentials are included in reports or screenshots.

## Required regression gates after approved work

- Batch 1: modifier selection/edit/quantity/error handling; keyboard modal traversal; actual viewport/keyboard reachability; `npm run test:checkout-drafts`, `npm run test:split-money`, relevant local payment-screen journey; build and lint for shared changes.
- Shell/admin: login and staff handoff; terminal setup/device proof; permission-filtered sections and backend denials; organization/staff/shift UI tests; deep links, filters and unsaved-form behavior.
- Payment layout: successful and failed cash/QR/split settlement, retry/double-click, manager approvals, refunds/voids, receipt totals, shift attribution and tenant boundaries using existing controlled local tools.
- Kitchen/waiter: dedicated terminals and isolated contexts; populated queues; start/ready/serve/collect; reconnect; wrong-role and wrong-company denials.

Authenticated payment completion, refund approval, printer output, full RLS coverage, concurrency, three-device realtime propagation and staging release are **NOT VERIFIED** by this audit. No release version bump or deployment is part of the documentation deliverable.

## Documentation verification

The source fingerprint comparison found no changes or deletions to pre-existing files before the final documentation integration. The only subsequent pre-existing-file edit adds section 24 to `docs/enterprise-pos-master-prompt.md`, linking this audit and incorporating the supplied UI/UX workflow. Application, backend and migration files remain unchanged by this audit. Local Markdown links and screenshot references were checked; reports were scanned for credential-shaped content.

The first fixture-verification attempt used a nonexistent terminal column; the next incorrectly assumed order creation produces no payment-attempt row. The verifier was corrected against the schema to check `registration_status`, cancelled attempt status and absent settlement timestamps. These tooling corrections did not change application behavior.

Recorded evidence: [fixture verification](evidence/fixture-verification.json), [admin browser errors](evidence/browser-errors.json).

## 13 October implementation update

The original sections above preserve the audit baseline. See the [implementation report](implementation-report-2026-10-13.md) and [updated issue register](issue-register.md) for delivered changes, current verification, files and remaining work. Do not interpret historical “pending” or failure entries as post-change results.
