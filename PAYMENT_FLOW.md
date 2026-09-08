# Payment Flow

```mermaid
flowchart TD
  A[Authoritative order total] --> B[Idempotent payment attempt]
  B --> C[Cash, QR, or split allocation]
  C --> D{Outstanding zero?}
  D -->|No| B
  D -->|Yes| E[Paid order and receipt]
  E --> F[Authorized refund or void]
```

Payment acceptance is routed through the payments Edge Function and database RPCs. Cash tender/change, split allocation, receipts, refunds, business numbering, and shift cash movement are represented in migrations. UI state is not authoritative.

Double-payment and lost-response behaviour must be reverified on the current Staging data.
