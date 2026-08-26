# Syok-Syok Smart Restaurant Ordering POS System

Syok Syok is a restaurant ordering system for dine-in and takeaway service. Staff can manage tables, create orders, send items to the kitchen, track preparation, collect payments, and complete orders in one system.

The application uses React and Vite with PostgreSQL, Supabase Auth, Supabase Realtime, Row Level Security, and authenticated Edge Functions.

## Core workflows

- Dine-in and takeaway ordering with database-authoritative pricing.
- Kitchen submission batches, preparation, ready-to-serve, and serving flows.
- Cash, manually confirmed QR, split-bill, mixed-payment, receipt, and refund records.
- Transactional table claiming, moving, cleaning, and availability lifecycle.
- Role-based access for Admin, Manager, Cashier, Waiter, and Kitchen staff.
- Daily sales and product sales reporting for authorized management roles.

## Architecture

Application access follows:

```text
components → hooks → services → repositories → Edge Functions → PostgreSQL
```

The browser cannot directly mark an order or payment successful. Sensitive transitions are validated by transactional database RPCs, and direct Data API access remains subject to Supabase RLS.

## Development

```sh
npm install
npx supabase start
npx supabase db reset
npx supabase functions serve
npm run dev
```

Run the local checks:

```sh
npm run lint
npm run build
npm run test:integration-contracts
npm run test:security-contracts
npm run test:split-money
node scripts/smoke-local.mjs
```

## Deployment

```sh
npx supabase db push
npx supabase functions deploy orders products tables payments --use-api
npm run build:staging
```

For Cloudflare Pages staging, configure the project with build command
`npm run build:staging`, output directory `dist`, and branch/environment
`staging`. The repository also provides a direct deployment command:

```sh
npx wrangler login
npm run deploy:staging
```

Set the staging Supabase values (`VITE_SUPABASE_URL`,
`VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_APP_ENV=staging`) as Cloudflare
Pages environment variables for the **staging/preview** environment only.
Never put a Supabase service-role key in Pages variables.

Card and e-wallet providers remain unavailable until real gateway adapters and credentials are configured. Cash and QR use authenticated staff confirmation and persist provider and transaction references.
