# Follow-up review — 26 October 2026

## First improvement: make the preview URL work through the deployed Worker

**VERIFIED FAIL before the fix:** local Wrangler using the existing `worker.js` and `wrangler.toml` returned 404 to browser navigation requests for `/pos/preview` and `/pos/preview/`. `/` returned 200. Vite's fallback had hidden this deployment integration gap during the initial review. The new regression suite reproduced four failures: both GET paths, HEAD and actual local Cloudflare navigation.

The project configures `assets.not_found_handling = "404-page"`, but the preview had only been registered in the client. Modern asset navigation can also bypass the Worker unless explicitly routed through it; see [Cloudflare's navigation routing documentation](https://developers.cloudflare.com/workers/static-assets/routing/static-site-generation/) and [the selective Worker-first setting](https://developers.cloudflare.com/workers/static-assets/binding/).

The fix registers only `/pos/preview` and `/pos/preview/` as Worker-first routes. For GET/HEAD on those exact paths, the Worker internally requests the existing root HTML shell and applies the existing no-store HTML policy. The browser URL stays unchanged, so the client still selects the isolated mock UI. Other routes, missing hashed assets and mutation methods retain their prior handling.

## Results

| Check                                                                              | Status            | Evidence                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mock POS service                                                                   | **VERIFIED PASS** | `node --test src/preview/tests/mockPosService.test.mjs`: 12 tests                                                                                                                                                                                                                                                                                                                     |
| Routing regression with actual local Worker                                        | **VERIFIED PASS** | `POS_WORKER_BASE_URL=http://127.0.0.1:5182 npm run test:preview-routing`: 9 tests; no skips. The same four failing cases now succeed                                                                                                                                                                                                                                                  |
| Production browser workflows through local Cloudflare                              | **VERIFIED PASS** | `POS_PREVIEW_BASE_URL=http://127.0.0.1:5182 npx playwright test --config tests/preview/playwright.config.js --output test-results/pos-preview-worker-review`: 24 scenarios across desktop, landscape, portrait and mobile. Run after `npm run build`                                                                                                                                  |
| Original entry and language flow                                                   | **VERIFIED PASS** | `npx playwright test --config tests/preview/playwright.config.js --grep "original sign-in" --output test-results/pos-preview-original-review`: 4 scenarios. Original login fields and Chinese language switch work with fictional environment configuration and locally mocked health probes. Original CSS and preview CSS load separately; preview loads no original backend modules |
| Existing backend-free scripts                                                      | **VERIFIED PASS** | All 10 commands below exited 0                                                                                                                                                                                                                                                                                                                                                        |
| Lint                                                                               | **VERIFIED PASS** | `npm run lint`; `npx oxlint worker.js tests/preview/worker-routing.test.mjs tests/preview/original-entry.spec.js`                                                                                                                                                                                                                                                                     |
| Syntax                                                                             | **VERIFIED PASS** | `node --check worker.js`; `node --check tests/preview/worker-routing.test.mjs`                                                                                                                                                                                                                                                                                                        |
| Production build                                                                   | **VERIFIED PASS** | `npm run build`: Vite production mode, exit 0                                                                                                                                                                                                                                                                                                                                         |
| Final diff and existing edits                                                      | **VERIFIED PASS** | `git diff --check`; SHA-256 comparison confirms all seven pre-existing edited/untracked POS and migration files are unchanged from the start of this review                                                                                                                                                                                                                           |
| Dedicated static type checking                                                     | **NOT VERIFIED**  | No `tsconfig`, type-check script or installed TypeScript compiler. JavaScript/TypeScript transpilation in Vite is not a static type check. No compiler/configuration was introduced as part of this focused routing fix                                                                                                                                                               |
| Authenticated administration, real database/payment/provider/RLS/concurrency flows | **NOT VERIFIED**  | These require approved credentials, populated services and fixture writes. The review ran backend-free checks and mock UI flows only                                                                                                                                                                                                                                                  |
| Hosted deployment, Cloudflare Pages and physical devices                           | **NOT VERIFIED**  | No deployment was performed. Routing was verified with the configured Cloudflare Worker locally; the separate Pages deployment path was not exercised. Browser sizes use Chrome emulation                                                                                                                                                                                             |

Backend-free commands run:

```text
npm run test:login-flow
npm run test:integration-contracts
npm run test:security-contracts
npm run test:cash-shifts-contracts
npm run test:split-money
npm run test:checkout-drafts
npm run test:start-order-contracts
npm run test:branch-menu-pricing-contracts
npm run test:system-health
npm run test:system-administration
```

The first original-entry test harness incorrectly assumed the original login made no health requests. Inspecting `useAuthConnection` confirmed its existing read-only probe; the test now fulfills only that expected health URL locally and rejects any other backend request. This was a test setup correction, not a change to authentication behaviour.

Wrangler also briefly reported a missing temporary middleware bundle while both the Worker and its configuration reloaded. Its next reload recovered automatically; the subsequent local routing and production browser suites completed successfully. The temporary review runtime was stopped after verification.

## Security and edge-case review

- Exact matching prevents a catch-all HTML fallback on API paths, preview subpaths or unknown routes. Non-GET/HEAD requests are not rewritten.
- Routing tests check query preservation, HEAD bodies, mutation rejection, missing scripts, original entry paths, response headers and propagation of asset-service failures.
- Both the existing browser suite and the new original-entry regression check module/network isolation. Original-entry configuration is fictional, health responses are local and all remote traffic is blocked. No real sign-in or payment was attempted.
- Preview notes/references remain React text, and the preview adapter still has no network or browser-storage imports. Mock quantity, modifier, immutable-batch, partial-payment, item-allocation and early-payment guards remain covered by existing service tests.
- Local Wrangler state is ignored rather than deleted, preserving any pre-existing runtime files. No dependencies, backend endpoints, permissions or database migrations were changed.
- Existing build warnings remain for ExcelJS's eval and the large lazy export chunk. Removing or upgrading that reporting dependency would be a separate change.

## Files changed in this review

- `worker.js`: exact preview GET/HEAD shell routing and existing cache policy.
- `wrangler.toml`: exact Worker-first navigation entries.
- `package.json`: discoverable routing test command.
- `.gitignore`: local Wrangler state exclusion.
- `tests/preview/worker-routing.test.mjs`: new routing and local runtime regression suite.
- `tests/preview/original-entry.spec.js`: new original entry/language/isolation regression.
- `tests/preview/playwright.config.js`: includes the original-entry regression.
- `docs/pos-preview/README.md`, `VALIDATION.md`, `REVIEW.md`: current instructions, historical validation link and this report.

No product or architecture decision is required for this fix. Enabling static type checking and real backend integration remain separate scopes.
