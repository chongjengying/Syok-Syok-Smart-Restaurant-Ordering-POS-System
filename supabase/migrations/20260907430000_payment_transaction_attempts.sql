begin;

-- The payments ledger holds completed financial movements.  This immutable
-- attempt journal also captures rejected/failed requests without allowing a
-- failed attempt to affect the order balance.
create table if not exists public.payment_attempts (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete restrict,
 branch_id uuid not null references public.branches(id) on delete restrict, terminal_id uuid references public.pos_terminals(id) on delete set null,
 staff_id uuid not null references public.profiles(id) on delete restrict, staff_session_id uuid references public.terminal_staff_sessions(id) on delete set null,
 order_id uuid not null references public.orders(id) on delete restrict, payment_id uuid references public.payments(id) on delete set null,
 idempotency_key varchar(128) not null, payment_method varchar(30) not null, provider_id text, requested_amount numeric(12,2) not null check(requested_amount>0), received_amount numeric(12,2),
 status varchar(12) not null check(status in ('PENDING','COMPLETED','FAILED','CONFLICT')), failure_code text, failure_reason text, created_at timestamptz not null default clock_timestamp(), completed_at timestamptz,
 unique(company_id,idempotency_key)
);
create index if not exists payment_attempts_order_created_idx on public.payment_attempts(order_id,created_at desc);
alter table public.payment_attempts enable row level security;
create policy payment_attempts_finance_read on public.payment_attempts for select to authenticated using(public.has_pos_permission('payment.view') and public.can_access_branch(branch_id));
revoke all on public.payment_attempts from public,anon;
grant select on public.payment_attempts to authenticated;

create or replace function public.begin_pos_payment_attempt(p_order_id uuid,p_payment_method text,p_requested_amount numeric,p_received_amount numeric,p_idempotency_key text,p_provider_id text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.terminal_staff_sessions; ord public.orders%rowtype; attempt public.payment_attempts%rowtype; key text:=nullif(left(btrim(coalesce(p_idempotency_key,'')),128),''); method text:=upper(btrim(coalesce(p_payment_method,'')));
begin
 if key is null or p_requested_amount is null or p_requested_amount<=0 then raise exception 'INVALID_PAYMENT_ATTEMPT'; end if;
 s:=public.require_terminal_staff_session(); if not public.has_pos_permission('payment.create') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 select * into ord from public.orders where id=p_order_id; if not found then raise exception 'ORDER_NOT_FOUND'; end if;
 if ord.company_id<>s.company_id or ord.branch_id<>s.branch_id then raise exception 'ORDER_BRANCH_MISMATCH'; end if;
 insert into public.payment_attempts(company_id,branch_id,terminal_id,staff_id,staff_session_id,order_id,idempotency_key,payment_method,provider_id,requested_amount,received_amount,status)
 values(s.company_id,s.branch_id,s.terminal_id,s.staff_id,s.id,ord.id,key,method,nullif(upper(btrim(coalesce(p_provider_id,'')),''),''),round(p_requested_amount,2),case when p_received_amount is null then null else round(p_received_amount,2) end,'PENDING')
 on conflict(company_id,idempotency_key) do update set idempotency_key=excluded.idempotency_key
 returning * into attempt;
 return jsonb_build_object('id',attempt.id,'status',attempt.status,'replayed',attempt.created_at<clock_timestamp()-interval '1 millisecond');
end $$;

create or replace function public.resolve_pos_payment_attempt(p_idempotency_key text,p_status text,p_failure_code text default null,p_failure_reason text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.terminal_staff_sessions; attempt public.payment_attempts%rowtype; target text:=upper(btrim(coalesce(p_status,''))); payment public.payments%rowtype;
begin
 if target not in ('COMPLETED','FAILED','CONFLICT') then raise exception 'INVALID_PAYMENT_ATTEMPT_STATUS'; end if;
 s:=public.require_terminal_staff_session();
 select * into attempt from public.payment_attempts where company_id=s.company_id and idempotency_key=left(btrim(coalesce(p_idempotency_key,'')),128) for update;
 if not found then raise exception 'PAYMENT_ATTEMPT_NOT_FOUND'; end if;
 if attempt.staff_id<>s.staff_id or attempt.branch_id<>s.branch_id then raise exception 'PAYMENT_ATTEMPT_OUT_OF_SCOPE'; end if;
 if attempt.status='COMPLETED' then return to_jsonb(attempt); end if;
 select * into payment from public.payments where idempotency_key=attempt.idempotency_key and status='PAID' order by paid_at desc limit 1;
 update public.payment_attempts set status=case when payment.id is not null then 'COMPLETED' else target end,payment_id=payment.id,completed_at=case when payment.id is not null then coalesce(completed_at,clock_timestamp()) else completed_at end,failure_code=case when payment.id is not null then null else left(nullif(btrim(coalesce(p_failure_code,'')),''),80) end,failure_reason=case when payment.id is not null then null else left(nullif(btrim(coalesce(p_failure_reason,'')),''),500) end where id=attempt.id returning * into attempt;
 perform public.write_pos_audit(case when attempt.status='COMPLETED' then 'PAYMENT_ATTEMPT_COMPLETED' else 'PAYMENT_ATTEMPT_'||attempt.status end,'PAYMENT_ATTEMPT',attempt.id,attempt.failure_reason,jsonb_build_object('orderId',attempt.order_id,'paymentId',attempt.payment_id,'requestedAmount',attempt.requested_amount,'method',attempt.payment_method,'providerId',attempt.provider_id,'failureCode',attempt.failure_code));
 return to_jsonb(attempt);
end $$;
revoke all on function public.begin_pos_payment_attempt(uuid,text,numeric,numeric,text,text),public.resolve_pos_payment_attempt(text,text,text,text) from public,anon;
grant execute on function public.begin_pos_payment_attempt(uuid,text,numeric,numeric,text,text),public.resolve_pos_payment_attempt(text,text,text,text) to authenticated;
commit;
