Syok-Syok-Smart-Restaurant-Ordering-POS-System

Syok Syok is a restaurant ordering system designed to make dine-in and takeaway ordering faster and easier. Staff can manage tables, create orders, send items to the kitchen, track food preparation status, process payments, and complete orders in one system.
=======
# Supabase POS Ordering System

React/Vite point-of-sale frontend backed by PostgreSQL, Supabase Auth,
Supabase Realtime, and authenticated Edge Functions.

## Backend endpoints

- `GET /functions/v1/products` returns active categories, products, option
  groups, and options. It accepts `categoryId`, `search`, `limit`, and `offset`.
- `GET /functions/v1/tables` returns live restaurant table state. Admin and
  manager roles can also use `POST`, `PATCH /:id`, and `DELETE /:id`.
- `POST /functions/v1/orders` creates a `PLACED` order, option snapshots, and a
  pending payment in one database transaction.
- `GET /functions/v1/orders/:id` returns an order and status history.
- `PATCH /functions/v1/orders/:id` applies a validated manual lifecycle
  transition. Kitchen/staff queues are returned by `GET /functions/v1/orders`.
- `POST /functions/v1/payments` processes a pending payment through a provider
  adapter and records confirmation on the backend.

Example order request:

```json
{
  "items": [
    {
      "productId": "<product-uuid>",
      "quantity": 2,
      "optionIds": ["<option-uuid>"],
      "specialRequest": "No pepper"
    }
  ],
  "paymentMethod": "CASH",
  "diningMode": "dine-in",
  "tableId": "<restaurant-table-uuid>"
}
```

Product and option prices are always read from PostgreSQL. The browser cannot
mark an order or payment successful.

## Payments and order lifecycle

Cash is confirmed by authenticated staff. Card, QR, and e-wallet requests
return an explicit provider-not-configured error until a real gateway adapter
and credentials are installed. The backend contains no fake-success provider.

The order lifecycle is:

```text
PLACED → CONFIRMED → PREPARING → READY → SERVED → COMPLETED
```

All transitions are validated and written to `order_status_history`.
Order/table/payment changes are published through Supabase Realtime. A table is
occupied when a dine-in order is placed and released after cancellation, or
after the order reaches `COMPLETED` with settled payment.

## Frontend architecture

Application access follows `components → hooks → services → repositories →
Supabase/Edge Functions → PostgreSQL`. UI components do not query application
tables directly.

## Development

```sh
npm install
npx supabase start
npx supabase db reset
npx supabase functions serve
npm run dev
```

Run the local end-to-end backend check while Supabase and the functions are
running:

```sh
node scripts/smoke-local.mjs
```

Production deployment:

```sh
npx supabase db push
npx supabase functions deploy orders products tables payments --use-api
```

=======

Syok-Syok-Smart-Restaurant-Ordering-POS-System
yok Syok is a restaurant ordering system designed to make dine-in and takeaway ordering faster and easier. Staff can manage tables, create orders, send items to the kitchen, track food preparation status, process payments, and complete orders in one system.

