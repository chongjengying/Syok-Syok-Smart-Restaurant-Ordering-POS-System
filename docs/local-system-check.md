# Local POS system check

Run from the repository root:

```sh
npm run test:system-local
```

Prerequisites: installed dependencies, Docker, the running local Supabase stack
(`Pos_Order`), local development configuration, and Playwright Chromium used by
the existing browser tests. The concurrency check requires an active local
branch and profile. The runner starts a local Vite server on port 5173 when
needed and stops the server it started when finished.

The command runs source contracts, money/state tests, authenticated database
fixtures, shift constraint concurrency, a read-only database integrity audit,
local authenticated API/browser checks, lint, and the local production build.
Checks run sequentially because some SQL fixtures share identifiers. A failed
check produces exit code 1; later independent checks still run.

Latest reports:

- `test-results/system-local/latest.md`: check results and commands.
- `test-results/system-local/latest.json`: durations, redacted diagnostics, and
  coverage information.

Timestamped copies are also saved. Reports are ignored by Git. Local test
credentials stay in controlled tooling; report diagnostics redact credentials.

To explicitly omit authenticated API/browser checks:

```sh
npm run test:system-local -- --no-browser
```

Omitted checks are reported as **NOT VERIFIED**. An all-green selected suite is
**VERIFIED PASS**, while overall system coverage remains **PARTIALLY VERIFIED**.
Source contracts alone do not prove live authorization or integration.

## Data and environment scope

Only loopback targets are accepted. The browser must use the local Supabase
backend. This command does not deploy, apply migrations, or test staging or
production. SQL fixtures and financial writes roll back. Browser fixtures clean
their temporary identities; the concurrency test cleans its temporary terminal.
Existing append-only audit records are preserved.

## Coverage limits

- Payment and serving checks use authenticated database sessions; a complete
  cashier browser journey is not covered.
- The shift constraint is tested across separate database connections.
  Payment/refund concurrency and external gateway confirmation are not covered.
- Some browser detail/error responses are mocked. These tests do not verify
  every admin module end to end.

Failures need investigation before release. A successful local check is not a
staging release certification.
