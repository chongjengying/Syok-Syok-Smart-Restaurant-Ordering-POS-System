insert into public.permissions(code,module,description) values
('einvoice.view','einvoice','View e-Invoice documents and status'),('einvoice.request','einvoice','Request individual e-Invoice'),('einvoice.company.manage','einvoice','Manage e-Invoice companies'),('einvoice.retry','einvoice','Retry failed submissions'),('einvoice.reconcile','einvoice','View reconciliation') on conflict(code) do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where upper(r.name) in ('ADMIN','OWNER','MANAGER') and p.code in ('einvoice.view','einvoice.company.manage','einvoice.retry','einvoice.reconcile')
on conflict do nothing;
create table if not exists public.customer_tax_profiles (
 id uuid primary key default gen_random_uuid(), customer_id uuid, buyer_name text not null, tin text not null,
 id_type text not null check(id_type in ('BRN','NRIC','PASSPORT','ARMY')), id_number text not null,
 sst_number text, address jsonb not null default '{}'::jsonb, phone text, email text,
 tin_validated boolean not null default false, tin_validated_at timestamptz, validation_reference text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(tin,id_type,id_number)
);
create table if not exists public.einvoice_requests (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id), receipt_id uuid,
 profile_id uuid not null references public.company_einvoice_profiles(id), tax_profile_id uuid references public.customer_tax_profiles(id),
 request_token_hash text unique, status text not null default 'REQUESTED' check(status in ('REQUESTED','VALIDATING','QUEUED','COMPLETED','REJECTED','EXPIRED')),
 expires_at timestamptz not null default (now()+interval '24 hours'), created_by uuid references auth.users(id), created_at timestamptz not null default now()
);
create table if not exists public.einvoice_document_lines (
 id uuid primary key default gen_random_uuid(), document_id uuid not null references public.einvoice_documents(id) on delete restrict,
 product_id uuid, product_code text, description text not null, classification text, quantity numeric(12,3) not null,
 unit text, unit_price numeric(12,2) not null, gross_amount numeric(12,2) not null, discount_amount numeric(12,2) not null default 0,
 voucher_amount numeric(12,2) not null default 0, promotion_amount numeric(12,2) not null default 0, tax_type text, tax_rate numeric(8,4), tax_amount numeric(12,2) not null default 0, net_amount numeric(12,2) not null
 );
create table if not exists public.einvoice_events (id uuid primary key default gen_random_uuid(), document_id uuid not null references public.einvoice_documents(id), event_type text not null, payload jsonb not null default '{}', created_at timestamptz not null default now());
create table if not exists public.einvoice_consolidation_batches (id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.company_einvoice_profiles(id), branch_id uuid not null references public.branches(id), period_start date not null, period_end date not null, status text not null default 'DRAFT', document_id uuid references public.einvoice_documents(id), created_at timestamptz not null default now(), unique(profile_id,branch_id,period_start,period_end));
create table if not exists public.einvoice_consolidation_items (batch_id uuid not null references public.einvoice_consolidation_batches(id) on delete cascade, order_id uuid not null references public.orders(id), primary key(batch_id,order_id), unique(order_id));
create table if not exists public.einvoice_document_links (original_document_id uuid not null references public.einvoice_documents(id), adjustment_document_id uuid not null references public.einvoice_documents(id), relationship_type text not null, primary key(original_document_id,adjustment_document_id));
alter table public.customer_tax_profiles enable row level security; alter table public.einvoice_requests enable row level security; alter table public.einvoice_document_lines enable row level security; alter table public.einvoice_events enable row level security; alter table public.einvoice_consolidation_batches enable row level security;
create policy einvoice_tax_profile_view on public.customer_tax_profiles for select to authenticated using(public.has_pos_permission('einvoice.view') or public.has_pos_permission('einvoice.request'));
create policy einvoice_request_view on public.einvoice_requests for select to authenticated using(public.has_pos_permission('einvoice.view') or public.has_pos_permission('einvoice.request'));
create policy einvoice_lines_view on public.einvoice_document_lines for select to authenticated using(public.has_pos_permission('einvoice.view'));
create policy einvoice_events_view on public.einvoice_events for select to authenticated using(public.has_pos_permission('einvoice.view'));
create policy einvoice_consolidation_view on public.einvoice_consolidation_batches for select to authenticated using(public.has_pos_permission('einvoice.reconcile'));
