begin;

-- A batch is the immutable kitchen ticket.  Commercial lines already carry
-- product/options/note snapshots; these fields make delivery and recovery
-- operationally observable without recreating a ticket.
alter table public.order_item_batches
 add column if not exists acknowledged_at timestamptz,
 add column if not exists acknowledged_by uuid references public.profiles(id) on delete set null,
 add column if not exists completed_at timestamptz,
 add column if not exists received_at timestamptz,
 add column if not exists print_status text not null default 'NOT_PRINTED',
 add column if not exists reprint_count integer not null default 0,
 add column if not exists last_reprinted_at timestamptz,
 add column if not exists last_reprinted_by uuid references public.profiles(id) on delete set null,
 add column if not exists failure_reason text,
 add column if not exists recovered_at timestamptz,
 add column if not exists recovered_by uuid references public.profiles(id) on delete set null;
alter table public.order_item_batches drop constraint if exists order_item_batches_status_check;
alter table public.order_item_batches add constraint order_item_batches_status_check check(status in ('PENDING','RECEIVED','ACKNOWLEDGED','PREPARING','READY','SERVED','COMPLETED','CANCELLED','FAILED'));
alter table public.order_item_batches drop constraint if exists order_item_batches_print_status_check;
alter table public.order_item_batches add constraint order_item_batches_print_status_check check(print_status in ('NOT_PRINTED','PRINTED','FAILED','REPRINTED'));
alter table public.order_item_batches drop constraint if exists order_item_batches_reprint_count_check;
alter table public.order_item_batches add constraint order_item_batches_reprint_count_check check(reprint_count>=0);

create table if not exists public.kitchen_ticket_events (
 id uuid primary key default gen_random_uuid(), batch_id uuid not null references public.order_item_batches(id) on delete restrict,
 order_id uuid not null references public.orders(id) on delete restrict, event_type text not null check(event_type in ('RECEIVED','ACKNOWLEDGED','PREPARING','READY','COMPLETED','FAILED','RECOVERED','REPRINTED','CANCELLED')),
 performed_by uuid references public.profiles(id) on delete set null, reason text, metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'), created_at timestamptz not null default clock_timestamp()
);
create index if not exists kitchen_ticket_events_batch_created_idx on public.kitchen_ticket_events(batch_id,created_at);
alter table public.kitchen_ticket_events enable row level security;
create policy kitchen_ticket_events_read on public.kitchen_ticket_events for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id and public.can_access_branch(o.branch_id)));
revoke all on public.kitchen_ticket_events from public,anon;
grant select on public.kitchen_ticket_events to authenticated;

create or replace function public.initialize_kitchen_ticket()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 new.status:=case when coalesce(new.status,'PENDING')='PENDING' then 'RECEIVED' else new.status end;
 new.received_at:=coalesce(new.received_at,clock_timestamp());
 return new;
end $$;
drop trigger if exists trg_initialize_kitchen_ticket on public.order_item_batches;
create trigger trg_initialize_kitchen_ticket before insert on public.order_item_batches for each row execute function public.initialize_kitchen_ticket();

create or replace function public.record_kitchen_ticket_received()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.kitchen_ticket_events(batch_id,order_id,event_type,performed_by,metadata)
 values(new.id,new.order_id,'RECEIVED',new.user_id,jsonb_build_object('batchNo',new.batch_no,'ticketCreatedAt',new.created_at));
 perform public.write_pos_audit('KITCHEN_TICKET_RECEIVED','KITCHEN_BATCH',new.id,null,jsonb_build_object('orderId',new.order_id,'batchNo',new.batch_no));
 return new;
end $$;
drop trigger if exists trg_record_kitchen_ticket_received on public.order_item_batches;
create trigger trg_record_kitchen_ticket_received after insert on public.order_item_batches for each row execute function public.record_kitchen_ticket_received();

create or replace function public.protect_kitchen_ticket_identity()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.order_id<>old.order_id or new.user_id<>old.user_id or new.batch_no<>old.batch_no or new.idempotency_key<>old.idempotency_key or new.request_items<>old.request_items then raise exception 'KITCHEN_TICKET_IMMUTABLE'; end if;
 return new;
end $$;
drop trigger if exists trg_protect_kitchen_ticket_identity on public.order_item_batches;
create trigger trg_protect_kitchen_ticket_identity before update on public.order_item_batches for each row execute function public.protect_kitchen_ticket_identity();

create or replace function public.write_kitchen_ticket_event(p_batch public.order_item_batches,p_type text,p_reason text default null,p_metadata jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin
 insert into public.kitchen_ticket_events(batch_id,order_id,event_type,performed_by,reason,metadata) values(p_batch.id,p_batch.order_id,p_type,auth.uid(),nullif(left(btrim(coalesce(p_reason,'')),500),''),coalesce(p_metadata,'{}'));
 perform public.write_pos_audit('KITCHEN_TICKET_'||p_type,'KITCHEN_BATCH',p_batch.id,p_reason,jsonb_build_object('orderId',p_batch.order_id,'batchNo',p_batch.batch_no)||coalesce(p_metadata,'{}'));
end $$;

create or replace function public.acknowledge_kitchen_ticket(p_order_id uuid,p_batch_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare batch public.order_item_batches%rowtype; role text;
begin
 select role_name into role from public.profiles where id=auth.uid() and status='ACTIVE'; if coalesce(role,'') not in ('ADMIN','MANAGER','KITCHEN') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 select b.* into batch from public.order_item_batches b join public.orders o on o.id=b.order_id where b.id=p_batch_id and b.order_id=p_order_id and public.can_access_branch(o.branch_id) for update;
 if not found then raise exception 'KITCHEN_BATCH_NOT_FOUND'; end if;
 if batch.status='ACKNOWLEDGED' then return to_jsonb(batch); end if;
 if batch.status not in ('RECEIVED','PENDING') then raise exception 'KITCHEN_BATCH_NOT_RECEIVED'; end if;
 update public.order_item_batches set status='ACKNOWLEDGED',acknowledged_at=clock_timestamp(),acknowledged_by=auth.uid() where id=batch.id returning * into batch;
 perform public.write_kitchen_ticket_event(batch,'ACKNOWLEDGED'); return to_jsonb(batch);
end $$;

create or replace function public.start_kitchen_batch(p_order_id uuid,p_batch_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare ord public.orders%rowtype; batch public.order_item_batches%rowtype; role text;
begin
 select role_name into role from public.profiles where id=auth.uid() and status='ACTIVE'; if coalesce(role,'') not in ('ADMIN','MANAGER','KITCHEN') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 select * into ord from public.orders where id=p_order_id for update; if not found or not public.can_access_branch(ord.branch_id) then raise exception 'ORDER_NOT_FOUND'; end if;
 select * into batch from public.order_item_batches where id=p_batch_id and order_id=ord.id for update; if not found then raise exception 'KITCHEN_BATCH_NOT_FOUND'; end if;
 if batch.status='PREPARING' then return to_jsonb(batch); end if; if batch.status not in ('RECEIVED','ACKNOWLEDGED','PENDING') then raise exception 'KITCHEN_BATCH_NOT_READY_TO_START'; end if;
 update public.order_items set item_status='PREPARING' where batch_id=batch.id and item_status='SUBMITTED';
 update public.order_item_batches set status='PREPARING',acknowledged_at=coalesce(acknowledged_at,clock_timestamp()),acknowledged_by=coalesce(acknowledged_by,auth.uid()),started_at=coalesce(started_at,clock_timestamp()) where id=batch.id returning * into batch;
 if ord.payment_status<>'PAID' then update public.orders set status='PREPARING',kitchen_started_at=coalesce(kitchen_started_at,clock_timestamp()) where id=ord.id; end if;
 perform public.write_kitchen_ticket_event(batch,'PREPARING'); return to_jsonb(batch);
end $$;

create or replace function public.ready_kitchen_batch(p_order_id uuid,p_batch_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare ord public.orders%rowtype; batch public.order_item_batches%rowtype; role text; next_status text;
begin
 select role_name into role from public.profiles where id=auth.uid() and status='ACTIVE'; if coalesce(role,'') not in ('ADMIN','MANAGER','KITCHEN') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 select * into ord from public.orders where id=p_order_id for update; if not found or not public.can_access_branch(ord.branch_id) then raise exception 'ORDER_NOT_FOUND'; end if;
 select * into batch from public.order_item_batches where id=p_batch_id and order_id=ord.id for update; if not found then raise exception 'KITCHEN_BATCH_NOT_FOUND'; end if;
 if batch.status='READY' then return to_jsonb(batch); end if; if batch.status<>'PREPARING' then raise exception 'KITCHEN_BATCH_NOT_PREPARING'; end if;
 update public.order_items set item_status='READY' where batch_id=batch.id and item_status='PREPARING'; update public.order_item_batches set status='READY',ready_at=coalesce(ready_at,clock_timestamp()) where id=batch.id returning * into batch;
 next_status:=case when exists(select 1 from public.order_items where order_id=ord.id and item_status='PREPARING') then 'PREPARING' when exists(select 1 from public.order_items where order_id=ord.id and item_status='SUBMITTED') then 'CONFIRMED' when exists(select 1 from public.order_items where order_id=ord.id and item_status='READY') then 'READY' else ord.status end;
 if ord.payment_status<>'PAID' then update public.orders set status=next_status where id=ord.id; end if;
 perform public.write_kitchen_ticket_event(batch,'READY'); return to_jsonb(batch);
end $$;

create or replace function public.fail_kitchen_ticket(p_order_id uuid,p_batch_id uuid,p_reason text) returns jsonb language plpgsql security definer set search_path=public as $$
declare batch public.order_item_batches%rowtype; role text; reason text:=nullif(left(btrim(coalesce(p_reason,'')),500),'');
begin
 select role_name into role from public.profiles where id=auth.uid() and status='ACTIVE'; if coalesce(role,'') not in ('ADMIN','MANAGER','KITCHEN') then raise exception 'INSUFFICIENT_PERMISSION'; end if; if reason is null then raise exception 'FAILURE_REASON_REQUIRED'; end if;
 select b.* into batch from public.order_item_batches b join public.orders o on o.id=b.order_id where b.id=p_batch_id and b.order_id=p_order_id and public.can_access_branch(o.branch_id) for update; if not found then raise exception 'KITCHEN_BATCH_NOT_FOUND'; end if;
 if batch.status in ('READY','SERVED','COMPLETED','CANCELLED') then raise exception 'KITCHEN_BATCH_NOT_FAILABLE'; end if;
 update public.order_item_batches set status='FAILED',failure_reason=reason where id=batch.id returning * into batch; perform public.write_kitchen_ticket_event(batch,'FAILED',reason); return to_jsonb(batch);
end $$;

create or replace function public.recover_kitchen_ticket(p_order_id uuid,p_batch_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare batch public.order_item_batches%rowtype; role text;
begin
 select role_name into role from public.profiles where id=auth.uid() and status='ACTIVE'; if coalesce(role,'') not in ('ADMIN','MANAGER','KITCHEN') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 select b.* into batch from public.order_item_batches b join public.orders o on o.id=b.order_id where b.id=p_batch_id and b.order_id=p_order_id and public.can_access_branch(o.branch_id) for update; if not found then raise exception 'KITCHEN_BATCH_NOT_FOUND'; end if; if batch.status<>'FAILED' then raise exception 'KITCHEN_BATCH_NOT_FAILED'; end if;
 update public.order_item_batches set status='RECEIVED',recovered_at=clock_timestamp(),recovered_by=auth.uid(),failure_reason=null where id=batch.id returning * into batch; perform public.write_kitchen_ticket_event(batch,'RECOVERED'); return to_jsonb(batch);
end $$;

create or replace function public.reprint_kitchen_ticket(p_order_id uuid,p_batch_id uuid,p_reason text default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare batch public.order_item_batches%rowtype; role text;
begin
 select role_name into role from public.profiles where id=auth.uid() and status='ACTIVE'; if coalesce(role,'') not in ('ADMIN','MANAGER','KITCHEN') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 select b.* into batch from public.order_item_batches b join public.orders o on o.id=b.order_id where b.id=p_batch_id and b.order_id=p_order_id and public.can_access_branch(o.branch_id) for update; if not found then raise exception 'KITCHEN_BATCH_NOT_FOUND'; end if;
 update public.order_item_batches set print_status='REPRINTED',reprint_count=reprint_count+1,last_reprinted_at=clock_timestamp(),last_reprinted_by=auth.uid() where id=batch.id returning * into batch; perform public.write_kitchen_ticket_event(batch,'REPRINTED',p_reason,jsonb_build_object('originalTicketTime',batch.created_at,'reprintCount',batch.reprint_count)); return jsonb_build_object('ticket',to_jsonb(batch),'reprint',true);
end $$;

create or replace function public.complete_kitchen_ticket(p_order_id uuid,p_batch_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare batch public.order_item_batches%rowtype; role text;
begin
 select role_name into role from public.profiles where id=auth.uid() and status='ACTIVE'; if coalesce(role,'') not in ('ADMIN','MANAGER','KITCHEN','WAITER') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 select b.* into batch from public.order_item_batches b join public.orders o on o.id=b.order_id where b.id=p_batch_id and b.order_id=p_order_id and public.can_access_branch(o.branch_id) for update; if not found then raise exception 'KITCHEN_BATCH_NOT_FOUND'; end if;
 if batch.status='COMPLETED' then return to_jsonb(batch); end if; if not exists(select 1 from public.order_items where batch_id=batch.id) or exists(select 1 from public.order_items where batch_id=batch.id and item_status not in ('SERVED','VOIDED')) then raise exception 'KITCHEN_BATCH_NOT_FULFILLED'; end if;
 update public.order_item_batches set status='COMPLETED',completed_at=coalesce(completed_at,clock_timestamp()) where id=batch.id returning * into batch; perform public.write_kitchen_ticket_event(batch,'COMPLETED'); return to_jsonb(batch);
end $$;

revoke all on function public.acknowledge_kitchen_ticket(uuid,uuid),public.start_kitchen_batch(uuid,uuid),public.ready_kitchen_batch(uuid,uuid),public.fail_kitchen_ticket(uuid,uuid,text),public.recover_kitchen_ticket(uuid,uuid),public.reprint_kitchen_ticket(uuid,uuid,text),public.complete_kitchen_ticket(uuid,uuid) from public,anon;
grant execute on function public.acknowledge_kitchen_ticket(uuid,uuid),public.start_kitchen_batch(uuid,uuid),public.ready_kitchen_batch(uuid,uuid),public.fail_kitchen_ticket(uuid,uuid,text),public.recover_kitchen_ticket(uuid,uuid),public.reprint_kitchen_ticket(uuid,uuid,text),public.complete_kitchen_ticket(uuid,uuid) to authenticated;
commit;
