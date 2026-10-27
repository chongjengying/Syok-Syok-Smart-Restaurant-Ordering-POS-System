# Critical Role and Permission Isolation Report

Overall: PARTIALLY VERIFIED. Local role-isolation attack tests are VERIFIED PASS. Shared/staging verification and the complete operational regression suite are NOT VERIFIED; release clearance is not claimed.

## Root Cause and Audit

The original model used shared role IDs and mutable shared role-permission mappings. Prior local forward migrations 20261004280000 through 20261004310000 copied SYSTEM templates into company-owned roles, copied assignable permission mappings and remapped profile/staff identities. These migrations were already applied before this request; no duplicate role system was introduced.

Live local inspection via pg_proc, pg_policies and profile/staff-to-role ownership joins found zero mismatched profile roles and zero mismatched staff roles. That is current local evidence, not a claim about production data or historical pre-migration counts. Financial/audit references remain preserved.

Reviewed API/data paths: roles and role_permissions PostgREST reads/DML; permissions catalog DML; create_admin_role; list_admin_roles_with_counts; set_role_permissions; activate/deactivate_admin_role; platform template/definition RPCs; admin_update_staff; admin_update_staff_record; admin-users Edge Function; PIN session permission resolution; order creation; payment/refund permission checks; manager void/discount approvals.

Remaining issues identified and fixed in this request:

- place_order allowed named roles without checking current order.create authorization.
- create_pos_order_unbound remained directly executable by authenticated callers.
- Server manager approval paths lacked explicit current company-owned role/permission checks against the order company and branch.
- Role ID denial RPCs returned generic database errors instead of HTTP 403.
- App merged refreshed permissions with an older profile snapshot, retaining removed UI capabilities.
- Permission refresh lacked periodic/focus revalidation and stale-response invalidation.
- A positive void regression exposed missing required cancellation metadata; authorized approval failed the existing database constraint.

## Database and Backend Changes

Four new forward migrations were applied and journaled only in local Docker Supabase, database supabase_db_Pos_Order:

- 20261004400000_authoritative_pos_role_permissions.sql: order.create enforcement, private unbound implementation, private tenant/branch/profile approval permission resolver, void and discount approval checks, paid/closed order discount rejection.
- 20261004410000_role_api_forbidden_status.sql: ownership/permission/protected-role denials use SQLSTATE 42501, mapped by PostgREST to HTTP 403.
- 20261004420000_manager_void_cancellation_metadata.sql: manager, server timestamp, reason and prior status recorded during approved void, preserving cancellation constraints.
- 20261004430000_approval_branch_access_dependency.sql: non-admin approvers require an active branch assignment; a stale primary branch does not restore removed access. Existing company ADMIN branch scope is retained.

Existing protection remains: company/name role uniqueness, company/ID composite role FKs on staff and profiles, immutable ownership/template identity, no destructive role deletion, private seed helpers, revoked authenticated role/permission DML, restrictive tenant RLS, immutable global templates for company admins, and independent platform administrator membership.

Permission definitions remain global read-only catalog data for normal companies. Permission resolution joins actual role ID, matching company, active role/company/definition and COMPANY_ASSIGNABLE scope. Approval permissions use the current staff role when a staff record exists, not just the legacy profile's role name. Void approval requires order.manage; discount approval requires discount.approve. No request-supplied company selector authorizes a mutation.

## Frontend and Session Changes

App now uses only the refreshed authoritative permission list. usePermissions clears state on identity change, discards stale/unmounted responses, refreshes visible sessions every 30 seconds and on focus/visibility restoration, and retains existing same-window role-change events. Failed refreshes clear permissions. Backend sensitive-action checks use live database authorization and do not wait for the UI refresh interval. JWTs do not supply authoritative permission lists. No Redis/external role cache was found.

## Attack Matrix

Evidence: npm run test:company-role-local against local PostgreSQL with authenticated-role impersonation, rollback fixtures for two companies, real PIN/device proof sessions, and server approval calls. This is live RLS/RPC evidence, not source inspection alone.

| Test | Result |
| --- | --- |
| Company A reads Company B role | VERIFIED PASS: foreign roles/mappings hidden by RLS |
| Company A edits Company B role | VERIFIED PASS: direct DML denied; scoped role mutation denied |
| Company A deletes Company B role | VERIFIED PASS: direct DML denied; role hard deletion forbidden |
| Company A changes B permissions | VERIFIED PASS: scoped RPC rejects B role ID |
| Cross-company Staff/Role assignment | VERIFIED PASS: staff composite FK and reverse profile guard reject |
| A permission change affects only A | VERIFIED PASS: A refund grant/revoke succeeds independently |
| B permission remains unchanged | VERIFIED PASS: complete B mapping snapshot unchanged, including refund grant |
| POS permission enforcement | VERIFIED PASS: live permission removal observed; removed order.create blocks place_order |
| Global role/definition edits by company admin | VERIFIED PASS: platform RPC and direct DML denied |
| Foreign manager approval | VERIFIED PASS: void rejected with no order mutation |
| Own manager void approval | VERIFIED PASS: cancellation succeeds with required metadata |

PostgREST collection reads under RLS return an empty result for inaccessible IDs; explicit scoped role RPC denials return HTTP 403. No inaccessible role is returned. Role lifecycle uses activation/deactivation rather than deletion to preserve references.

## Regression Evidence

- VERIFIED PASS: npm run test:company-role-local. Includes role creation, duplicate names across companies, lifecycle, permission allowlist, global template separation, audit diffs, PIN login, live permission revocation and role-deactivation session invalidation. SQL fixtures roll back.
- VERIFIED PASS: npm run test:company-role-ui-local. Actual local Auth/API/RLS, HTTP 403 template/lifecycle/direct DML attacks, self-company tampering denial and role directory at desktop/tablet/phone. Screenshots /tmp/pos-company-roles-1440.png, /tmp/pos-company-roles-768.png, /tmp/pos-company-roles-390.png. Phone screenshot inspected. Auth fixtures removed; audit-referenced profiles retired.
- VERIFIED PASS: npm run test:staff-detail-local; npm run test:branch-terminal-staff-local; npm run test:terminal-device-local; npm run test:shift-management-local. Covers staff assignment, branch/terminal access, device proof/lifecycle and connected shift behavior.
- VERIFIED PASS: npm run test:inventory-sale-local. Actual supported Auth-backed order creation, payment settlement/retry, item refund/return and insufficient-stock rollback.
- VERIFIED PASS: npm run test:security-contracts, npm run lint, npm run build:local and git diff --check. Build retains existing ExcelJS eval and large-chunk warnings. Build is not a standalone TypeScript check; contract tests are not live authorization tests.

## Remaining Risks and Release Gate

- NOT VERIFIED: shared/staging migration state, authenticated staging tests and production cross-company references. No deployment, shared migration push or release version bump was performed.
- NOT VERIFIED: complete end-to-end browser staff switching, discount approval via Edge/PIN exchange, complete void/refund operational suite, permission refresh timing/race automation and concurrent authorization-change tests. Targeted SQL/backend checks and browser directory tests are narrower.
- PARTIALLY VERIFIED: overall operational regression. Targeted staff, terminal, branch, shift, sale/payment/refund tests passed; these do not establish every requested business flow.
- Existing device/person architecture still uses Auth-backed profiles and is not fully separated. No claim of complete Auth-free staff/device operation is made.

The local isolation controls and targeted attacks are verified, but this release blocker must not be described as globally resolved or approved for release until the remaining environment and full operational checks are completed.
