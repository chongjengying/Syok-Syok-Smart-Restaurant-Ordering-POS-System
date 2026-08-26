-- Baseline schema required by all later POS migrations.
-- Every object is safe to apply to the existing linked project as well as an
-- empty local database.

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  name varchar(50) not null unique,
  description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

insert into public.roles (name, description)
values
  ('ADMIN', 'Administrator'),
  ('CASHIER', 'Point-of-sale cashier')
on conflict (name) do nothing;

create table if not exists public.profiles (
  id uuid primary key,
  role_id uuid not null references public.roles(id) on delete restrict,
  name text not null,
  username varchar(50) unique,
  email varchar(255) unique,
  password_hash text not null default 'supabase_managed',
  status varchar(20) not null default 'ACTIVE'
    check (status in ('ACTIVE', 'INACTIVE', 'LOCKED')),
  login_attempt integer not null default 0 check (login_attempt >= 0),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete restrict,
  product_name text not null,
  description text,
  unit varchar(20),
  cost_price numeric(10, 2) not null check (cost_price >= 0),
  sell_price numeric(10, 2) not null check (sell_price >= 0),
  status boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number varchar(50) not null unique,
  user_id uuid not null references public.profiles(id) on update cascade on delete restrict,
  subtotal numeric(10, 2) not null default 0 check (subtotal >= 0),
  discount numeric(10, 2) not null default 0 check (discount >= 0),
  tax numeric(10, 2) not null default 0 check (tax >= 0),
  total numeric(10, 2) not null default 0 check (total >= 0),
  status varchar(20) default 'PENDING'
    check (status in ('PENDING', 'PAID', 'COMPLETED', 'CANCELLED', 'REFUNDED')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_price numeric(10, 2) not null check (unit_price >= 0),
  subtotal numeric(10, 2) not null check (subtotal >= 0),
  status boolean default true,
  product_name_snapshot text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on update cascade on delete restrict,
  payment_method varchar(30) not null,
  amount numeric(10, 2) not null check (amount >= 0),
  reference varchar(100),
  status varchar(20) default 'PENDING'
    check (status in ('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED')),
  paid_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.kitchen_stations (
  id uuid primary key default gen_random_uuid(),
  name varchar(50) not null unique,
  status boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.kitchen_orders (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  station_id uuid references public.kitchen_stations(id) on delete set null,
  status varchar(20) default 'PENDING'
    check (status in ('PENDING', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.kitchen_order_items (
  id uuid primary key default gen_random_uuid(),
  kitchen_order_id uuid not null references public.kitchen_orders(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  status varchar(20) default 'PENDING',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_users_role_id on public.profiles(role_id);
create index if not exists idx_products_category_status on public.products(category_id, status);
create index if not exists idx_products_name on public.products(product_name);
create index if not exists idx_orders_user_id on public.orders(user_id);
create index if not exists idx_orders_created_at on public.orders(created_at);
create index if not exists idx_orders_status_created_at on public.orders(status, created_at);
create index if not exists idx_order_items_order_product on public.order_items(order_id, product_id);
create index if not exists idx_order_items_product_id on public.order_items(product_id);
create index if not exists idx_payments_order_id on public.payments(order_id);
create index if not exists idx_payments_user_id on public.payments(user_id);
create index if not exists idx_payments_paid_at on public.payments(paid_at);

alter table public.roles enable row level security;
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.kitchen_stations enable row level security;
alter table public.kitchen_orders enable row level security;
alter table public.kitchen_order_items enable row level security;

grant select on public.roles, public.categories, public.products to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert on public.orders, public.order_items, public.payments to authenticated;
grant all on all tables in schema public to service_role;

-- The linked project previously used this legacy trigger name for profiles.
drop trigger if exists trg_users_updated_at on public.profiles;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'roles', 'profiles', 'categories', 'products', 'orders', 'order_items',
    'payments', 'kitchen_stations', 'kitchen_orders', 'kitchen_order_items'
  ]
  loop
    execute format(
      'drop trigger if exists %I on public.%I',
      'trg_' || table_name || '_updated_at',
      table_name
    );
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.update_updated_at_column()',
      'trg_' || table_name || '_updated_at',
      table_name
    );
  end loop;
end;
$$;
