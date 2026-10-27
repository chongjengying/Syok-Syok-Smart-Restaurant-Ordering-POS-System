# Company Role Isolation

## Implemented Model

Global `permissions` define immutable capability codes with `COMPANY_ASSIGNABLE`, `PLATFORM_ONLY` or `INTERNAL_ONLY` scope, active state and system-managed metadata. Company administrators cannot modify these definitions.

The existing `roles` table now distinguishes protected SYSTEM templates from COMPANY-owned roles. The existing uppercase `name` is the stable role code; uniqueness is `(company_id, name)`, so two companies can independently own CASHIER or SUPERVISOR. Reusing this table avoids a parallel authorization system.

Existing global roles remain SYSTEM templates. Each existing company receives separate copies and copied company-assignable permissions. Existing profile/staff role references are migrated to those copies. New companies receive copies through a private seeding trigger. Copies are snapshots, not mutable inheritance: editing a template never changes existing company roles.

Staff and profiles have composite company/role foreign keys. Role ownership, stable name, template source and built-in flags are immutable. Hard deletion is rejected; deactivation preserves historical transactions. Operational built-ins permit company-owned permission changes; ADMIN core permissions and internal setup roles remain protected. Role deactivation immediately ends affected operator sessions without deleting shifts or sales.

Company RPCs derive company from authenticated context, enforce `role.edit`, lock the target role and reject foreign/template IDs. Permission updates reject unknown, inactive, platform-only and internal-only capabilities. Audit diffs contain previous/new permissions and added/removed sets, with existing actor/company/branch/session attribution.

`get_my_permissions` remains the central effective permission resolver used by backend `has_pos_permission`. It validates active identity/company/role, role ownership and active company-assignable definitions. Session rendering now uses that same effective permission list instead of stale cached permissions. Staff detail and login snapshots also filter the capability scope.

## Platform Boundary

Platform administrator membership is stored separately in `platform_administrators`, with RLS and no browser table privileges. No existing company ADMIN was automatically promoted. Membership must be provisioned through a controlled backend/operator process, never a company role checkbox or frontend field.

Two explicit platform-only RPCs manage template permission sets and permission activation. They require platform membership, not a company role permission. Other platform provisioning and definition changes remain controlled database operations; a full platform administration UI is not implemented.

`backup.verify` is platform-only. New platform/internal capability codes are not assignable to company roles. Review future permission scope classifications explicitly; do not indiscriminately expose internal capabilities as company-assignable.

## Adjacent Fixes

- Self-service profile updates have only name/username/phone column privileges. Tenant, branch and role fields cannot be changed through that endpoint.
- The legacy privilege guard is null-safe and protects company/default-branch identity fields.
- Authorized staff update RPCs retain their controlled profile-write path; the old browser staff-access helper now calls the scoped RPC.
- Staff creation selects an active company-owned role, including in the service-role Edge Function.
- Composite role relationships replace redundant single-column relationships so PostgREST staff/role embedding remains unambiguous.
- The admin directory shows only the current company's manageable roles. Staff pickers exclude inactive roles and permission selection exposes only assignable active definitions.

## Database Delivery

Forward-only migrations:

- `20261004280000_company_role_isolation.sql`: ownership, backfill, authorization, platform boundary, RLS, constraints, audit.
- `20261004290000_role_session_integration.sql`: composite relationship integration and current session permissions.
- `20261004300000_role_permission_validation_aliases.sql`: SQL alias correction found by the first negative test.
- `20261004310000_role_permission_presentation_scope.sql`: scoped staff/session permission presentation.

Applied only to local Docker Supabase `supabase_db_Pos_Order`. Each file was run with `psql -v ON_ERROR_STOP=1`, then recorded in the local Supabase migration ledger. No shared/staging deployment was performed. No applied migration was rewritten. Historical financial records were not remapped, deleted or recreated.

Before a shared deployment, inspect that target's current definitions, migration ledger, privilege metadata and role references. Take the environment's approved backup. Confirm every profile/staff has a valid company and identify any target-only role consumers. The migration deliberately rejects missing company context rather than guessing an owner. The local preflight found zero profile/staff role-owner mismatches after migration.

Deploy these migrations together in order, before frontend/Edge changes. Validate existing assignments and effective permissions by company. Update staging version metadata as part of an explicitly authorized staging release; this local-only task is not a deployed release.

## Verification

**VERIFIED PASS**:

- `npm run test:company-role-local`: authenticated two-company role visibility, foreign edit/activation rejection, protected templates, platform/internal/unknown/inactive permission rejection, direct update denial, self-tenant tampering denial, company role creation/lifecycle, audit diffs, exact preservation of Company B assignments, staff composite foreign key, immutable ownership and hard-delete rejection. Also exercises explicit platform membership, no template-to-company propagation, real PIN login, live POS permission removal, role deactivation/session termination, and identical custom role names in different companies. Entire fixture transaction rolls back.
- `npm run test:company-role-ui-local`: real local Auth, PostgREST and RLS; template edit and tenant tampering denied; actual company role directory on desktop/tablet/phone with no runtime errors. Screenshots: `/tmp/pos-company-roles-1440.png`, `768.png`, `390.png`. No role data or API responses mocked.
- Browser fixture cleanup deactivates the temporary profile and removes its Auth account. Its audit-linked historical profile remains deliberately intact; deleting it would violate append-only audit protection. An initial deletion-based cleanup attempt failed with `AUDIT_LOG_IMMUTABLE`; the final test uses non-destructive retirement instead.
- `npm run test:terminal-device-local`, `npm run test:shift-management-local`, `npm run test:staff-detail-local`: existing backend terminal, session, branch, shift, financial/cash and staff-detail regressions with updated tenant-owned fixtures.
- `npm run test:terminal-api-local`: real local Auth/Edge rejection and credential protection checks.
- `npm run test:security-contracts`, `npm run test:integration-contracts`, `npm run test:login-flow`, `npm run test:cash-shifts-contracts`: static contract checks, not substitutes for live isolation tests.
- `npm run build:local`, `npm run lint`, `git diff --check`. Build retains existing ExcelJS eval and bundle-size warnings.

**PARTIALLY VERIFIED**: broader payment/refund/report interactions. The connected shift test exercises actual collections and a cash refund, but not every financial workflow or concurrent financial race.

**NOT VERIFIED**: shared/staging migration and browser testing, live external payment-provider callbacks, full concurrent checkout/refund regression, complete platform-admin UI and independent device-only Auth architecture.

The previous process review's inventory/promotion tenant-policy defects, scoped manager void approval, shared operational settings and mixed-tender refund/reporting defects are separate work. Fixing role isolation does not certify the entire POS production-ready.
