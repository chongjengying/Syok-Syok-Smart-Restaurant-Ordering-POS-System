# Connection monitoring 0.9.1

The health screen distinguishes live API connections from 24-hour API reliability. Staff (`admin-users`) and payment-provider reads now join the existing authenticated order, table, product, and payment probes. Historical failures and their severity thresholds are preserved.

Probes validate JSON, abort stalled requests and response bodies, and release connections. Permission-denied probes remain unknown rather than passing or masquerading as an outage. Cached health results belong to the requesting user. Dashboard navigation retains a recent snapshot; changed filters, stale snapshots, periodic refresh, and explicit refresh still request current data. Pending realtime refresh timers are cancelled when leaving the dashboard.

No database migration, business-data transfer, authorization change, or payment-behaviour change is included. Existing unrelated worktree edits to `AGENTS.md` and the historical staging reset migration are excluded from this release.

- **VERIFIED PASS** — `node scripts/test-admin-panel-local.mjs`: all 24 authenticated local admin sections, without API failures, alerts, or browser errors.
- **VERIFIED PASS** — `node scripts/test-admin-api-health-local.mjs`: six authenticated live checks; Auth, database, metrics, and browser Realtime; desktop/mobile health screens; dashboard filter/snapshot preservation and explicit refresh. Temporary local identities are cleaned.
- **VERIFIED PASS** — `node scripts/test-financial-concurrency-local.mjs`: terminal/PIN/shift connections; payment, receipt, refund, void, discount and shift-close concurrency; authoritative amounts and cash reconciliation. Local fixtures are cleaned and audits retained.
- **VERIFIED PASS** — `npm run test:system-health`: existing health contracts plus HTTP failures, denied access, malformed JSON, network failure, stalled-body timeout and incomplete-coverage tests.
- **VERIFIED PASS** — `npm run lint`, `npm run build:staging`, and 15 Worker routing checks. The optional local Cloudflare runtime test is **NOT VERIFIED**. Existing ExcelJS eval and bundle-size warnings remain.
- **PARTIALLY VERIFIED** — staging Auth, six protected API routes, CORS, Worker application routes and excluded preview routes were checked without shared-data writes. Deployment identifiers and subsequent checks are recorded under ignored `test-results/api-connections/` artifacts after publishing.
- **NOT VERIFIED** — authenticated staging business workflows require dedicated staging test credentials. External gateway settlement, physical printers/KDS, and authoritative backup integration are outside these connection checks.
