# Production Readiness

Use this as a release gate. `[x]` requires current executable evidence.

- [x] Build, lint, contract, browser, and staging-test commands are defined.
- [ ] Authentication/role matrix verified against current Staging data.
- [ ] Dedicated terminal-device Auth separated from staff Auth.
- [ ] Staff PIN, switching, and inactivity lock verified after reset.
- [ ] Company/branch RLS attack matrix verified.
- [ ] Order, kitchen, voucher, payment, receipt, refund, cash, report, and audit flows verified on current Staging.
- [ ] Double-payment, lost-response, Realtime, multi-terminal, offline, and performance tests verified on current Staging.
- [ ] Production provider, hardware, monitoring, backup, restore, and rollback checks verified.

Current verdict: **NOT VERIFIED for production readiness.**
