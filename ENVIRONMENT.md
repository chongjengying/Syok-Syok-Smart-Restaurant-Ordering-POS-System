# Environment

## Frontend-safe values

`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (or `VITE_SUPABASE_PUBLISHABLE_KEY`), and `VITE_APP_ENV` are read by `src/config/env.js`. Build metadata may use `VITE_APP_VERSION`, `VITE_GIT_COMMIT_SHA`, `VITE_BUILD_ID`, and `VITE_BUILD_TIMESTAMP`.

## Secret values

`SUPABASE_SERVICE_ROLE_KEY`, database credentials, provider credentials, and staging test service keys are server-only. `STAGING_SERVICE_KEY` is for controlled test tooling only. Never prefix secrets with `VITE_`.

`.env`, `.env.*`, and `*.local` are ignored by Git except an optional `.env.example`. `.env.staging.local` is suitable for local-only test credentials; do not commit it.
