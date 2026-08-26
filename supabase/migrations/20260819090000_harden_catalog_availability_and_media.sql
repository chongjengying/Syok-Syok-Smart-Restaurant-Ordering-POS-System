alter table public.categories add column if not exists status boolean not null default true;
alter table public.products add column if not exists is_available boolean not null default true;
alter table public.products add column if not exists image_url text;

update public.products set is_available = coalesce(status, true) where is_available is null;

create index if not exists idx_categories_status_name on public.categories(status, name);
create index if not exists idx_products_category_active_available on public.products(category_id, status, is_available);

-- Keep category visibility and product availability authoritative for all new
-- catalogue reads. Existing order RPCs still lock/read products server-side.
comment on column public.products.is_available is 'Operational sellability; false means sold out but still visible in the POS menu.';
comment on column public.products.image_url is 'Optional product image URL managed by the catalogue.';
