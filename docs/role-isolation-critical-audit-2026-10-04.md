# Critical Role Isolation Audit

Before further edits, the local database was inspected via pg_proc, pg_policies and identity/role joins. Prior forward migrations 20261004280000 through 20261004310000 already separate SYSTEM templates from COMPANY roles, copy mappings and enforce composite profile/staff role ownership. Current local mismatch counts: profiles 0; staff 0. This does not establish shared/staging state.

Remaining reviewed gaps:

- place_order authorizes profile role names rather than authoritative order.create permission. Removing that company permission does not reliably deny the RPC.
- approve_order_void checks active requester/manager and manager role names but does not validate either identity against the order company/branch or current role permission.
- approve_manual_order_discount checks manager branch assignment but lacks explicit company/active-role/discount.approve resolution and trusts role names.
- App combines refreshed permissions with the profile's older permission snapshot, retaining removed capabilities in UI state.
- usePermissions responds only to same-window change events; other-device changes are not refreshed periodically and outdated requests can overwrite newer identity state.

Role and permission mutation RPCs, revoked direct DML, restrictive RLS, private seed helpers, immutable role identities, scoped staff update services and Edge staff creation were inspected. Existing global template/definition RPCs require independently provisioned platform membership. No alternate global role mutation endpoint was found in public pg_proc.
