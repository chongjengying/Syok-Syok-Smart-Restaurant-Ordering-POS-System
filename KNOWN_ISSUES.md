# Known Issues

## P1 — Terminal-device and staff identity separation needs full verification

The current flow has terminal Auth identities, revocable device credentials, and PIN-based `staff` records. Legacy `profiles` keys still connect historical operational records. The separation is not yet established across every POS path by negative authenticated browser, RLS, payment, and concurrency tests.

- Verification: **PARTIALLY VERIFIED** by local terminal lifecycle, staff-session, and tenant tests. Full cashier browser and staging authorization coverage is **NOT VERIFIED**.
- Next step: cover terminal revocation, staff login, payment, refunds, and cross-company denial in authenticated browser and concurrent backend tests.

## P1 — Staging operational data was reset

The authorized migration `20260908120000_reset_staging_legacy_identities.sql` removed operational history and terminal records. Fresh configuration and live verification are required.

- Verification: **VERIFIED PASS** for migration application; post-reset POS readiness is **NOT VERIFIED**.
