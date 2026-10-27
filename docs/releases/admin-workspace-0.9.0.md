# Admin workspace 0.9.0

Scope confirmed by the product owner: apply the approved admin preview design to existing live admin workflows. New-business signup and company invitations remain outside this release. GitHub target: `agent/pos-preview`. Deployment target: Cloudflare Worker `syok-syok-pos-staging`, backed by Supabase project `tlknhjkbapqshykfrlbs`.

## Implemented

- Seven permission-aware primary modules, section navigation, searchable modules, mobile navigation, and retained existing admin URLs.
- Three live dashboard metrics, recent orders, top-selling products, real period/branch filters, and expandable operational analytics.
- Grouped settings links to existing company, receipt, tax, printer, terminal, role, and payment-provider modules.
- Personal account page using the existing profile service, with unsaved-change protection and persistent save feedback.
- Menu table, detail drawer, filtering, pagination, real CSV downloads, image handling, and persisted product edits.
- Shared light surfaces, blue actions, consistent typography, and rounded form focus treatment. POS presentation remains separate.

## Integration fixes

- Started the stopped local Edge Functions runtime; Staff, Tables, Payments and Health no longer return local HTTP 503.
- Product double submissions are blocked synchronously. A metadata save followed by an image-upload failure retains the product ID for retry instead of creating another product. Catalog cache invalidation also follows partial metadata success.
- Profile DTOs retain company and branch context.
- Profile and token refreshes retain the active admin form. Sign-out invalidates pending session validation so a late response cannot restore the old session.
- Navigation supports browser Back and permitted default sections; filter history stays synchronized.
- Stale list requests cannot overwrite newer filter results, and invalid pagination falls back to page one.
- Static preview records are not filtered by creation date, preventing tables disappearing after midnight. Preview routes are development-only and are excluded from the published release.

## Verification

VERIFIED PASS (local): authenticated rendering of all 24 existing admin sections without API errors; live profile save; real product creation/editing; upload failure/retry; duplicate-submit guards; CSV download; unsaved changes; browser history; five responsive sizes; mobile focus trapping; permission navigation; and token-refresh/sign-out race handling.

VERIFIED PASS (local): company role/RLS isolation and tenant-tampering checks; actual Auth/API role-directory checks; financial concurrency with one payment/receipt, refund, void, discount and shift-close result; authoritative amounts and cash reconciliation; device-proof and terminal-access checks; checkout drafts; security, login and integration contracts; navigation/CSV checks; lint and staging build.

VERIFIED PASS (staging, read-only): all 363 migration versions match; Auth health is available; Edge Function routes respond with authentication denial instead of service failure; private dashboard/order/payment/receipt/role RPCs deny anonymous access using their frontend request signatures.

NOT VERIFIED: authenticated staging journeys and live external payment/device integrations; no staging test credentials were supplied. No database migration push, reset, financial write, or tenant provisioning was performed on staging.

Local System Health retains historical infrastructure failures in its 24-hour telemetry window after services recover. These historical metrics were preserved.

## Source preservation

Pre-existing changes to `AGENTS.md` and the already-applied historical migration `20260908120000_reset_staging_legacy_identities.sql` are preserved locally and excluded from this release commit. Applied migration files are not rewritten by this release. Previous forward migrations and dependent POS source are included to keep the release reproducible.

Deployment commit, Worker version, URL, and final live checks are recorded after publication.
