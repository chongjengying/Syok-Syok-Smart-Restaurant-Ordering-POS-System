-- Query-specific indexes for the POS catalogue and admin search screens.
-- pg_trgm enables indexed contains-search (ILIKE '%term%').
create extension if not exists pg_trgm with schema extensions;

create index if not exists idx_products_active_category_available_name
  on public.products(category_id, is_available, product_name)
  where status = true;
create index if not exists idx_products_active_name_trgm
  on public.products using gin (lower(product_name) extensions.gin_trgm_ops)
  where status = true;
create index if not exists idx_products_code_trgm
  on public.products using gin (lower(product_code) extensions.gin_trgm_ops);

create index if not exists idx_categories_active_display_name
  on public.categories(display_order, name)
  where status = true;

create index if not exists idx_vouchers_code_trgm
  on public.vouchers using gin (lower(code) extensions.gin_trgm_ops);
create index if not exists idx_vouchers_name_trgm
  on public.vouchers using gin (lower(name) extensions.gin_trgm_ops);
create index if not exists idx_vouchers_active_validity
  on public.vouchers(status, starts_at, expires_at)
  where status = 'ACTIVE';

create index if not exists idx_orders_number_trgm
  on public.orders using gin (lower(order_number) extensions.gin_trgm_ops);
create index if not exists idx_orders_queue_status_created
  on public.orders(payment_status, status, created_at desc)
  where status not in ('CANCELLED', 'REFUNDED');

create index if not exists idx_payments_number_trgm
  on public.payments using gin (lower(payment_number) extensions.gin_trgm_ops);
create index if not exists idx_payments_reference_trgm
  on public.payments using gin (lower(optional_reference_no) extensions.gin_trgm_ops)
  where optional_reference_no is not null;

create index if not exists idx_profiles_name_trgm
  on public.profiles using gin (lower(name) extensions.gin_trgm_ops);
create index if not exists idx_profiles_email_trgm
  on public.profiles using gin (lower(email) extensions.gin_trgm_ops)
  where email is not null;
create index if not exists idx_profiles_username_trgm
  on public.profiles using gin (lower(username) extensions.gin_trgm_ops)
  where username is not null;

create index if not exists idx_audit_logs_action_trgm
  on public.audit_logs using gin (lower(action) extensions.gin_trgm_ops);
create index if not exists idx_audit_logs_entity_type_trgm
  on public.audit_logs using gin (lower(entity_type) extensions.gin_trgm_ops);

create index if not exists idx_einvoice_documents_profile_status_created
  on public.einvoice_documents(profile_id, internal_status, created_at desc);
create index if not exists idx_einvoice_documents_branch_created
  on public.einvoice_documents(branch_id, created_at desc);

analyze public.products;
analyze public.categories;
analyze public.vouchers;
analyze public.orders;
analyze public.payments;
analyze public.profiles;
analyze public.audit_logs;
analyze public.einvoice_documents;
