-- Local-development cleanup only. Removes generated smoke/demo fixtures
-- without recreating sample data or touching real production-like records.
begin;

delete from public.payments
where reference like 'DEMO-%'
   or transaction_reference like 'QR-DEMO-%'
   or idempotency_key like 'demo-%';

delete from public.order_items
where batch_id in (
  select id
  from public.order_item_batches
  where idempotency_key like 'demo-%'
);

delete from public.order_item_batches
where idempotency_key like 'demo-%';

delete from public.order_items
where order_id in (
  select id
  from public.orders
  where order_number like 'DEMO-%'
);

delete from public.orders
where order_number like 'DEMO-%';

delete from public.product_option_groups
where product_id in (
  select id
  from public.products
  where product_name in ('Chicken Chop', 'Chicken Burger', 'French Fries', 'Lemon Tea')
);

delete from public.kitchen_order_items
where order_item_id in (
  select id
  from public.order_items
  where product_id in (
    select id
    from public.products
    where product_name in ('Chicken Chop', 'Chicken Burger', 'French Fries', 'Lemon Tea')
      and description in (
        'Grilled chicken chop with house sauce',
        'Chicken burger with fresh vegetables',
        'Crispy golden fries',
        'Fresh lemon tea'
      )
  )
);

delete from public.order_items
where product_id in (
  select id
  from public.products
  where product_name in ('Chicken Chop', 'Chicken Burger', 'French Fries', 'Lemon Tea')
    and description in (
      'Grilled chicken chop with house sauce',
      'Chicken burger with fresh vegetables',
      'Crispy golden fries',
      'Fresh lemon tea'
    )
);

delete from public.products
where product_name in ('Chicken Chop', 'Chicken Burger', 'French Fries', 'Lemon Tea')
  and description in (
    'Grilled chicken chop with house sauce',
    'Chicken burger with fresh vegetables',
    'Crispy golden fries',
    'Fresh lemon tea'
  );

delete from public.categories
where name in ('Main Courses', 'Sides', 'Beverages')
  and description in ('Restaurant main dishes', 'Side dishes', 'Cold and hot drinks');

delete from public.payments
where user_id in (
  select id
  from public.profiles
  where email like 'smoke-%@example.com'
     or email like 'cashier-%@example.com'
     or email like 'inactive-%@example.com'
     or email like 'menu-smoke-%@example.com'
     or email like 'kitchen-%@example.com'
     or email like 'takeaway-%@example.com'
     or email like 'payment-%@example.com'
     or email like 'addon-%@example.com'
     or email like 'draft-%@example.com'
     or email like 'phase6-%@example.com'
     or email like 'batch-%@example.com'
     or email like 'realtime-%@example.com'
     or email like 'early-%@example.com'
     or email like '%-rls-%@example.com'
     or email like '%-pay-%@example.com'
     or email like '%-serve-%@example.com'
);

delete from public.orders
where user_id in (
  select id
  from public.profiles
  where email like 'smoke-%@example.com'
     or email like 'cashier-%@example.com'
     or email like 'inactive-%@example.com'
     or email like 'menu-smoke-%@example.com'
     or email like 'kitchen-%@example.com'
     or email like 'takeaway-%@example.com'
     or email like 'payment-%@example.com'
     or email like 'addon-%@example.com'
     or email like 'draft-%@example.com'
     or email like 'phase6-%@example.com'
     or email like 'batch-%@example.com'
     or email like 'realtime-%@example.com'
     or email like 'early-%@example.com'
     or email like '%-rls-%@example.com'
     or email like '%-pay-%@example.com'
     or email like '%-serve-%@example.com'
);

delete from public.profiles
where email like 'smoke-%@example.com'
   or email like 'cashier-%@example.com'
   or email like 'inactive-%@example.com'
   or email like 'menu-smoke-%@example.com'
   or email like 'kitchen-%@example.com'
   or email like 'takeaway-%@example.com'
   or email like 'payment-%@example.com'
   or email like 'addon-%@example.com'
   or email like 'draft-%@example.com'
   or email like 'phase6-%@example.com'
   or email like 'batch-%@example.com'
   or email like 'realtime-%@example.com'
   or email like 'early-%@example.com'
   or email like '%-rls-%@example.com'
   or email like '%-pay-%@example.com'
   or email like '%-serve-%@example.com';

delete from auth.users
where email like 'smoke-%@example.com'
   or email like 'cashier-%@example.com'
   or email like 'inactive-%@example.com'
   or email like 'menu-smoke-%@example.com'
   or email like 'kitchen-%@example.com'
   or email like 'takeaway-%@example.com'
   or email like 'payment-%@example.com'
   or email like 'addon-%@example.com'
   or email like 'draft-%@example.com'
   or email like 'phase6-%@example.com'
   or email like 'batch-%@example.com'
   or email like 'realtime-%@example.com'
   or email like 'early-%@example.com'
   or email like '%-rls-%@example.com'
   or email like '%-pay-%@example.com'
   or email like '%-serve-%@example.com';

commit;
