# Inventory Isolation Inspection

Local development inspection before implementation, 2026-10-04.

| Path | Existing behavior | Required repair |
|---|---|---|
| Direct inventory/items and movements SELECT | Permission only, no tenant/branch policy | Restrictive company and authorized-branch RLS |
| `list_inventory` list/search/low-stock/count | SECURITY DEFINER; permission only; trusts branch ID | Resolve branch inside authenticated company before query/count |
| `adjust_inventory` | Permission only; accepts arbitrary branch/product; replays globally keyed movement without validating request | Trusted ownership checks before replay, tenant-scoped fingerprint and locks |
| Product/branch inventory relationships | Independent FKs permit a foreign product with a branch | Company backfill with fail-closed preflight and composite FKs |
| Movement history | SELECT leak; not append-only; globally unique request key | Scoped history and immutable ledger; company-scoped keys |
| Transfer | Independent manual TRANSFER_IN/OUT adjustments, no paired transaction | Atomic same-company, authorized-branch transfer; reject manual transfer legs |
| Admin UI | Lists active branches; stale requests can retain previous branch rows; no-branch state remains loading | Scoped branch resolver, clear rows during loading/error, discard stale responses |
| Sale deduction / refund restocking | No inventory consumers in current order/payment/refund code | Explicit tracked-stock sale integration; refund disposition needs a business rule |
| Reports/export/import/background jobs/cache | No inventory-specific export/import/jobs/search index found; no stock report beyond list/low-stock | Scope current list/count and add scoped report/history contract; do not claim nonexistent integrations complete |

Inventory currently derives ownership through Branch -> Company. The planned hardening adds explicit company ownership for composite referential integrity while preserving this hierarchy. No existing stock rows were present in the inspected local database. Other environments must reject and investigate mixed-owner rows, not silently reassign them.
