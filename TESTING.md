# Testing

## Commands

| Area | Command |
|---|---|
| Build / lint | `npm run build:staging`, `npm run lint` |
| Contracts | `npm run test:login-flow`, `test:integration-contracts`, `test:security-contracts`, `test:cash-shifts-contracts`, `test:split-money`, `test:checkout-drafts`, `test:start-order-contracts`, `test:branch-menu-pricing-contracts` |
| System checks | `npm run test:system-health`, `npm run test:system-administration` |
| Browser | `npm run test:e2e` |
| Local smoke | `npm run test:table-to-payment-local`, `test:payment-screen-local`, `test:qr-payment-local`, `test:split-payment-local` |
| Live staging | `npm run test:concurrency-staging`, `npm run test:performance-staging` |

Run each command as `npm run <name>`. Do not infer results from its existence.

## Staging inputs

`STAGING_SUPABASE_URL`, `STAGING_PUBLISHABLE_KEY`, and `STAGING_SERVICE_KEY` are required by the live concurrency/performance scripts. The service key is a server-side secret. Playwright currently reads `POS_E2E_ADMIN_EMAIL` and `POS_E2E_ADMIN_PASSWORD`; local E2E account variables must remain ignored files.

## Coverage status

Contract suites provide static/isolated checks. Playwright covers login accessibility and selected admin acceptance flows. The staging concurrency script creates disposable QA staff, terminal, catalog, table, order, payment, receipt, refund, and shift fixtures. It is not a substitute for complete manual restaurant, hardware, offline, or production-readiness testing.
