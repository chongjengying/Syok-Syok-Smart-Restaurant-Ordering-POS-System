# Engineering Instructions

## Rules

- Inspect the relevant code, migration, test, and current Git diff before modifying behaviour.
- Make the smallest safe change. Do not weaken RLS, constraints, audit records, or backend validation to unblock a flow.
- Treat `supabase/migrations` as the database source of truth. Add forward-only migrations; never rewrite applied migrations.
- Keep `SUPABASE_SERVICE_ROLE_KEY`, database credentials, passwords, tokens, and test secrets out of source, `VITE_*` variables, browser code, Markdown, and logs.
- Browser code uses the publishable/anon Supabase key only. Service-role use is limited to Edge Functions or controlled test tooling.
- Authorization is backend enforced by RLS, RPCs, Edge Functions, and database constraints. UI visibility is never authorization.
- Protect payment completion, refunds, voids, discounts, terminal/session transitions, and business numbering with server-side idempotency and transactions.
- Audit records are append-only. Preserve company, branch, terminal, actor, staff-session, approver, reason, and timestamps where implemented.
- Do not reset, truncate, delete, deploy, or push migrations to a shared environment without explicit user authorization and an exact target scope.
- Preserve unrelated dirty-worktree changes. Do not use destructive Git commands unless explicitly requested.

## Authentication and POS context

The current implementation has Auth-backed `profiles`, registered terminals, Staff PIN credentials, and terminal staff sessions. It does **not** yet fully implement separate terminal-device Auth and Auth-free staff records. Do not document or claim that separation as complete.

## Verification language

Use only: **VERIFIED PASS**, **VERIFIED FAIL**, **PARTIALLY VERIFIED**, or **NOT VERIFIED**. A code review is not a verified pass. Record the command, live environment, or observable evidence.

## Testing

Run the smallest relevant test first, then build and lint for cross-cutting changes. Run live staging tests only with explicitly supplied staging credentials and clean their fixtures. Do not claim regression complete when authenticated browser, RLS, payment, or concurrency coverage is absent.
