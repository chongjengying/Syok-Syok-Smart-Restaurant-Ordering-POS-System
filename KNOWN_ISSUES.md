# Known Issues

## P1 — Terminal-device Auth separation is incomplete

Current staff profiles are Auth-backed and terminal resolution uses a browser device identifier. The target model of dedicated terminal Auth plus Auth-free staff records is not implemented.

- Verification: **PARTIALLY VERIFIED** by code inspection.
- Next step: staged terminal Auth/staff-entity migration plus negative E2E/RLS tests.

## P1 — Staging operational data was reset

The authorized migration `20260908120000_reset_staging_legacy_identities.sql` removed operational history and terminal records. Fresh configuration and live verification are required.

- Verification: **VERIFIED PASS** for migration application; post-reset POS readiness is **NOT VERIFIED**.
