# POS Ordering System Architecture

## Application boundaries

```text
src/
├── app/                         Application composition and screen flow
├── components/                  Presentational screens and reusable UI
├── config/                      Validated runtime configuration
├── hooks/                       React state and lifecycle around services
├── services/                    Business rules and domain mapping
├── repositories/                Supabase/Edge Function data access
├── types/                       TypeScript domain and transport models
├── features/
│   ├── auth/                    Authentication and staff-profile operations
│   └── */                       Legacy compatibility modules
├── infrastructure/supabase/    Supabase client and Edge Function transport
├── shared/                      Cross-feature domain constants
└── utils/                       UI-only utilities

supabase/
├── functions/
│   ├── _shared/                 HTTP and payment-provider infrastructure
│   ├── orders/                  Order API endpoint
│   ├── payments/                Payment API endpoint
│   ├── products/                Menu API endpoint
│   └── tables/                  Restaurant-table API endpoint
└── migrations/                  Versioned database schema and business rules
```

## Dependency rules

1. Components consume hooks or services; they do not construct Supabase queries.
2. Hooks depend on services, services depend on repositories, and repositories alone use Supabase infrastructure.
3. Infrastructure must not import React or UI modules.
4. Edge Functions validate HTTP input and delegate atomic financial/order work to PostgreSQL functions.
5. Database migrations remain the source of truth for constraints, RLS, triggers, and RPC definitions.
6. The service-role key is server-only and must never be exposed through Vite environment variables.

## Backend request flow

```text
React component
  → hook
  → service
  → repository
  → shared authenticated function client
  → Supabase Edge Function
  → RLS-aware query or PostgreSQL RPC
  → PostgreSQL transaction/constraints
```

Order prices, payment state, table occupancy, and lifecycle status are authoritative in PostgreSQL. Frontend calculations are previews only and must be reconciled with the server response.

## Product catalogue cache

The menu loads the complete active cafe catalogue through the product repository and service, then filters categories and search terms in memory. `product-cache.service.ts` provides a session-scoped stale-while-revalidate cache with a two-minute stale time, a thirty-minute retention limit, request deduplication, and centralized invalidation. Cached products remain visible during background refreshes and temporary refresh failures. PostgreSQL order creation still revalidates product status and authoritative prices.

## Dine-in order context

Dine-in ordering starts by selecting a table. An available table creates a new local order context and becomes occupied atomically when the first order is sent. Selecting an occupied table opens its existing active unpaid order. Further carts call the transactional `append_pos_order_items` RPC, which stores only the new items, tags their dispatch batch, recalculates the authoritative order total, and updates the pending payment without creating another bill.

## Environment configuration

The frontend requires:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Edge Functions use server-side Supabase secrets. `CORS_ALLOWED_ORIGIN` should be set to the deployed frontend origin outside local development. Cash is the only enabled payment provider until a real external gateway adapter and credentials are configured.
