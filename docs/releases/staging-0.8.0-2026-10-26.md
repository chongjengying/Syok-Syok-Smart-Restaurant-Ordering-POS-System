# Staging release 0.8.0

Date: 2026-10-26, Asia/Kuala_Lumpur.

## IMPLEMENTED

**VERIFIED PASS** — Published the current application to the existing Supabase staging project and Cloudflare staging Worker. The admin UI preview remains available only during local development. Preview components, mock records, preview CSS, and the disabled-preview screen are absent from the staging JavaScript/CSS assets. Worker requests to `/preview/admin` and its descendants return a plain-text 404 before asset handling.

- Application version: `0.8.0`; package and lockfile root versions match.
- Build ID: `staging-0.8.0-087888a38147`.
- Build timestamp: `2026-10-25T17:19:50Z`.
- Base Git commit: `3800d28cc28e5808f7e82589fc1f2236a42d889f`.
- The release was built from the existing dirty worktree, including untracked application dependencies. It is not a clean committed release. Existing unrelated changes were preserved.
- Code fingerprint: `087888a38147f1214df5f21fcf52d610efe917a450f4d49122c828d0d51ef2e7`. This covers the package files, Worker source, HTML/Vite entry files, non-preview frontend source, public assets, Edge Function source, and migrations. Deployment configuration is recorded separately below.

## CONNECTED

| Target | Deployed value |
| --- | --- |
| Supabase project | Eat-Syok-Syok - Staging |
| Project reference | `tlknhjkbapqshykfrlbs` |
| Cloudflare Worker | `syok-syok-pos-staging` |
| Admin | https://syok-syok-pos-staging.jengying0503.workers.dev/admin |
| POS | https://syok-syok-pos-staging.jengying0503.workers.dev/pos |
| Terminal setup | https://syok-syok-pos-staging.jengying0503.workers.dev/pos/setup |
| Active Worker version | `5a844e51-2356-4f52-a980-603c59724368` |
| Previous Worker version before this release | `0b08f1e2-747a-46e6-937b-fd57a28f5b56` |

All 10 application Edge Functions were deployed and subsequently listed as ACTIVE. Their existing gateway JWT-verification settings were preserved: enabled for products, tables, system-health, staff-pin-session, einvoice-submit, and terminal-account-binding; disabled for orders, payments, admin-users, and payment-webhooks, whose application-level authentication/signature checks remain in their source.

Staging runtime metadata `APP_ENV`, `APP_VERSION`, `GIT_COMMIT_SHA`, `BUILD_ID`, and `BUILD_TIMESTAMP` was set. The reported remote digests matched the intended values without reading or recording secret values.

## BUGS FOUND & FIXED

- Added `/admin` and `/admin/` to the Worker's application document routes.
- Enabled `assets.run_worker_first = true`. A live request initially showed Cloudflare serving root HTML before the Worker could set its cache headers. After the configuration correction and redeployment, root/admin/POS HTML returned `no-store, no-cache, must-revalidate`.
- Removed the deployed disabled-preview placeholder from the frontend entry point and added a Worker 404 boundary for preview URLs.
- Updated stale integration assertions for the entry point's compile-time `DEV` flag and the existing dashboard title `Sales trend`. Runtime configuration remains centralized; the test explicitly rejects other environment reads in the entry point. Added Worker behavior regression checks for preview exclusion, application deep links, and missing assets.
- Staging Auth still used `http://localhost:5174` as its site URL and disabled anonymous device sessions, although the current terminal activation flow requires them. Updated only `site_url`, `uri_allow_list`, and `external_anonymous_users_enabled` using the [Supabase Auth configuration API](https://supabase.com/docs/reference/api/v1-update-auth-service-config). The Worker origin is now the site URL; redirects allow that origin, its `/admin` route, and the prior local staging URL. Email confirmation, signup, and anonymous rate-limit settings were preserved.

## DATABASE

**VERIFIED PASS** — `supabase migration list --linked --output-format json` reported 363 matching local/remote migration versions, no pending versions, and no remote-only versions. No migration was applied, no seed ran, and no business data was reset or deleted. The pre-existing edit to the historical identity reset migration was preserved and was not reapplied.

Migration version equality does not establish checksum equality or absence of manual schema drift.

## SECURITY

- The browser build uses the staging publishable key. Asset inspection found no secret-key value or service-role JWT.
- The staging project reference and frontend backend URL match. No production project was deployed or configured.
- All nine protected Edge Function smoke requests without authorization returned 401. The webhook GET request returned 405. These checks made no authenticated business operations.
- Auth configuration was read back after the targeted patch. The public Auth settings endpoint subsequently reported anonymous device sign-ins enabled. No user was created to test token issuance.
- The existing implementation still uses Auth-backed profiles, registered terminals, staff PIN credentials, and terminal staff sessions. This release does not claim complete separation of device Auth and Auth-free staff records.

## TESTED

| Verification | Evidence |
| --- | --- |
| **VERIFIED PASS** | `node scripts/test-environment.mjs` |
| **VERIFIED PASS** | `npm run test:login-flow` |
| **VERIFIED PASS** | `npm run test:integration-contracts` |
| **VERIFIED PASS** | `npm run test:security-contracts` |
| **VERIFIED PASS** | `npm run test:split-money` |
| **VERIFIED PASS** | `npm run test:checkout-drafts` |
| **VERIFIED PASS** | `npm run test:branch-menu-pricing-contracts` |
| **VERIFIED PASS** | `npm run test:staff-presentation` |
| **VERIFIED PASS** | `npm run test:shift-presentation` |
| **VERIFIED PASS** | `npm run test:start-order-contracts` |
| **VERIFIED PASS** | `npm run test:system-health` |
| **VERIFIED PASS** | `npm run test:system-administration` |
| **VERIFIED PASS** | `npm run lint` and `git diff --check` |
| **VERIFIED PASS** | `npm run build:staging` with release metadata injected; existing ExcelJS eval and large-chunk warnings remain |
| **VERIFIED PASS** | Staging bundle inspection for excluded preview assets/mock content, staging backend URL, release metadata, and privileged credential patterns |
| **VERIFIED PASS** | `wrangler deploy --env staging --dry-run`, followed by the real deployment and active deployment-status readback |
| **VERIFIED PASS** | Live root/admin/POS document comparisons to the local staging artifact; preview-route 404s; missing JavaScript asset 404; deployed entry/metadata chunks matching local bytes |
| **VERIFIED PASS** | Live Chromium `/admin` sign-in form render, no browser errors, no preview root, and no Supabase mutation requests |
| **VERIFIED PASS** | Supabase ACTIVE function listing, preserved JWT-verification flags, unauthorized endpoint responses, runtime metadata digests, and Auth configuration readback |

Local evidence, excluded from Git, is in `test-results/staging-release-metadata.json`, `staging-functions.json`, `staging-api-smoke.json`, `staging-worker-smoke.json`, `staging-auth-config-change.json`, `staging-browser-smoke.json`, and `staging-admin-login-v0.8.0.png`.

## REMAINING

**NOT VERIFIED** — Authenticated staging administrator login, terminal activation/PIN login, shift operations, sale/payment/refund completion, RLS isolation under real staging identities, concurrency, external payment callbacks, and live email delivery. No staging test login credentials were supplied, and no business fixtures were created. Static contract checks and unauthorized smoke requests are not a complete authenticated regression test.

The final staging deployment and preview exclusion are **VERIFIED PASS** within the checks recorded above. Production promotion and integration of the preview designs are outside this release.
