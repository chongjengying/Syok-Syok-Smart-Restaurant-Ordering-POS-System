-- Optional Malaysia e-Invoice foundation. No rows are created, so existing POS
-- behaviour is unchanged until an administrator enables a profile.
create table if not exists public.company_einvoice_profiles (
 id uuid primary key default gen_random_uuid(), company_id uuid not null, legal_name text not null,
 trading_name text, tin text not null, registration_id_type text not null default 'BRN', registration_number text not null,
 sst_number text, msic_code text, business_activity text, address jsonb not null default '{}'::jsonb,
 environment text not null default 'SANDBOX' check(environment in ('SANDBOX','PRODUCTION')),
 status text not null default 'NOT_CONFIGURED' check(status in ('NOT_CONFIGURED','CONFIGURING','CONNECTED','ACTIVE','SUSPENDED','CONNECTION_ERROR','DISABLED')),
 currency text not null default 'MYR', individual_enabled boolean not null default true,
 consolidation_enabled boolean not null default false, automatic_submission boolean not null default true,
 created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(company_id)
);
create table if not exists public.company_einvoice_branch_mappings (
 profile_id uuid not null references public.company_einvoice_profiles(id) on delete cascade,
 branch_id uuid not null references public.branches(id) on delete restrict, primary key(profile_id,branch_id), unique(branch_id)
);
create table if not exists public.einvoice_documents (
 id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.company_einvoice_profiles(id),
 branch_id uuid not null references public.branches(id), order_id uuid not null references public.orders(id), receipt_id uuid,
 document_number text not null, document_type text not null default 'INVOICE' check(document_type in ('INVOICE','CREDIT_NOTE','DEBIT_NOTE','REFUND_NOTE')),
 internal_status text not null default 'DRAFT' check(internal_status in ('DRAFT','QUEUED','SUBMITTED','PROCESSING','VALID','INVALID','FAILED','CANCELLED')),
 myinvois_status text, buyer_snapshot jsonb not null default '{}'::jsonb, transaction_snapshot jsonb not null,
 currency text not null default 'MYR', subtotal numeric(12,2) not null, discount_total numeric(12,2) not null default 0,
 service_charge numeric(12,2) not null default 0, tax_total numeric(12,2) not null default 0, total numeric(12,2) not null check(total>=0),
 submission_uid text, myinvois_uuid text, myinvois_long_id text, error_code text, error_message text,
 queued_at timestamptz, submitted_at timestamptz, validated_at timestamptz, created_by uuid references auth.users(id), created_at timestamptz not null default now(),
 unique(profile_id,document_number), unique(order_id,document_type)
);
create table if not exists public.einvoice_jobs (
 id uuid primary key default gen_random_uuid(), document_id uuid not null unique references public.einvoice_documents(id) on delete restrict,
 profile_id uuid not null references public.company_einvoice_profiles(id), status text not null default 'QUEUED' check(status in ('QUEUED','PROCESSING','SUBMITTED','WAITING_VALIDATION','VALID','INVALID','RETRYING','FAILED','DEAD_LETTER','CANCELLED')),
 attempt_count integer not null default 0, max_attempts integer not null default 8, idempotency_key text not null unique,
 next_attempt_at timestamptz not null default now(), last_attempt_at timestamptz, last_error_code text, last_error_message text, created_at timestamptz not null default now(), completed_at timestamptz
);
create index if not exists einvoice_jobs_claim_idx on public.einvoice_jobs(status,next_attempt_at);
alter table public.company_einvoice_profiles enable row level security;
alter table public.company_einvoice_branch_mappings enable row level security;
alter table public.einvoice_documents enable row level security;
alter table public.einvoice_jobs enable row level security;
create policy einvoice_profile_view on public.company_einvoice_profiles for select to authenticated using(public.has_pos_permission('einvoice.view'));
create policy einvoice_document_view on public.einvoice_documents for select to authenticated using(public.has_pos_permission('einvoice.view'));
create policy einvoice_job_view on public.einvoice_jobs for select to authenticated using(public.has_pos_permission('einvoice.view'));
create or replace function public.einvoice_profile_set_status(p_id uuid,p_status text) returns public.company_einvoice_profiles language plpgsql security definer set search_path=public as $$ declare r public.company_einvoice_profiles; begin if not public.has_pos_permission('einvoice.company.enable') then raise exception 'INSUFFICIENT_PERMISSION'; end if; if p_status not in ('ACTIVE','DISABLED','SUSPENDED') then raise exception 'INVALID_STATUS'; end if; update public.company_einvoice_profiles set status=p_status,updated_at=now() where id=p_id returning * into r; if not found then raise exception 'PROFILE_NOT_FOUND'; end if; perform public.write_pos_audit_diff('COMPANY_EINVOICE_STATUS_CHANGED','EINVOICE_PROFILE',p_id,null,null,to_jsonb(r)); return r; end $$;
grant execute on function public.einvoice_profile_set_status(uuid,text) to authenticated;
