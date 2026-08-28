begin;

insert into public.permissions(code,module,description) values
 ('inventory.view','inventory','View branch inventory and stock movements'),
 ('inventory.manage','inventory','Adjust stock and reorder thresholds'),
 ('branch.manage','operations','Manage branch ownership and configuration'),
 ('device.manage','operations','Manage device heartbeats and print jobs'),
 ('backup.verify','security','Record and verify authoritative backups'),
 ('payment.reconcile','finance','Reconcile external payment events')
on conflict(code) do update set module=excluded.module,description=excluded.description;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.name='ADMIN' and p.code=any(array['inventory.view','inventory.manage','branch.manage','device.manage','backup.verify','payment.reconcile'])
on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.name='MANAGER' and p.code=any(array['inventory.view','inventory.manage','device.manage'])
on conflict do nothing;

alter table public.restaurant_tables add column if not exists branch_id uuid references public.branches(id) on delete restrict;
alter table public.orders add column if not exists branch_id uuid references public.branches(id) on delete restrict;
alter table public.payments add column if not exists branch_id uuid references public.branches(id) on delete restrict;
alter table public.refunds add column if not exists branch_id uuid references public.branches(id) on delete restrict;
update public.restaurant_tables set branch_id=(select id from public.branches where code='MAIN') where branch_id is null;
update public.orders o set branch_id=coalesce((select branch_id from public.restaurant_tables t where t.id=o.table_id),(select branch_id from public.profiles p where p.id=o.user_id),(select id from public.branches where code='MAIN')) where branch_id is null;
update public.payments p set branch_id=coalesce((select branch_id from public.orders o where o.id=p.order_id),(select id from public.branches where code='MAIN')) where branch_id is null;
update public.refunds r set branch_id=coalesce((select branch_id from public.orders o where o.id=r.order_id),(select id from public.branches where code='MAIN')) where branch_id is null;
alter table public.restaurant_tables alter column branch_id set not null;
alter table public.orders alter column branch_id set not null;
alter table public.payments alter column branch_id set not null;
alter table public.refunds alter column branch_id set not null;
create index if not exists idx_restaurant_tables_branch_status on public.restaurant_tables(branch_id,status);
create index if not exists idx_orders_branch_created on public.orders(branch_id,created_at desc);
create index if not exists idx_payments_branch_paid on public.payments(branch_id,paid_at desc);

create table if not exists public.inventory_items(
 id uuid primary key default gen_random_uuid(),branch_id uuid not null references public.branches(id) on delete restrict,
 product_id uuid not null references public.products(id) on delete restrict,stock_on_hand numeric(14,3) not null default 0,
 reorder_level numeric(14,3) not null default 0 check(reorder_level>=0),unit varchar(20) not null default 'UNIT',
 version bigint not null default 0,updated_at timestamptz not null default now(),updated_by uuid references public.profiles(id) on delete set null,
 unique(branch_id,product_id)
);
create table if not exists public.inventory_movements(
 id uuid primary key default gen_random_uuid(),inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
 movement_type varchar(20) not null check(movement_type in('OPENING','PURCHASE','SALE','WASTE','TRANSFER_IN','TRANSFER_OUT','ADJUSTMENT','RETURN')),
 quantity_delta numeric(14,3) not null check(quantity_delta<>0),balance_after numeric(14,3) not null,
 reason varchar(500) not null,reference_type varchar(40),reference_id uuid,idempotency_key varchar(128) not null unique,
 created_at timestamptz not null default now(),created_by uuid references public.profiles(id) on delete set null
);
create index if not exists idx_inventory_low_stock on public.inventory_items(branch_id,stock_on_hand,reorder_level);
create index if not exists idx_inventory_movements_item_created on public.inventory_movements(inventory_item_id,created_at desc);
alter table public.inventory_items enable row level security;alter table public.inventory_movements enable row level security;
revoke all on public.inventory_items,public.inventory_movements from public,anon,authenticated;
grant select on public.inventory_items,public.inventory_movements to authenticated;grant all on public.inventory_items,public.inventory_movements to service_role;
create policy permitted_inventory_items_read on public.inventory_items for select to authenticated using(public.has_pos_permission('inventory.view'));
create policy permitted_inventory_movements_read on public.inventory_movements for select to authenticated using(public.has_pos_permission('inventory.view'));

create or replace function public.adjust_inventory(p_branch_id uuid,p_product_id uuid,p_quantity_delta numeric,p_movement_type text,p_reason text,p_idempotency_key text,p_expected_version bigint default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare item public.inventory_items%rowtype;movement public.inventory_movements%rowtype;existing public.inventory_movements%rowtype;normalized_type text:=upper(btrim(coalesce(p_movement_type,'')));
begin
 if not public.has_pos_permission('inventory.manage') then raise exception 'INSUFFICIENT_PERMISSION';end if;
 if p_quantity_delta=0 or normalized_type not in('OPENING','PURCHASE','SALE','WASTE','TRANSFER_IN','TRANSFER_OUT','ADJUSTMENT','RETURN') then raise exception 'INVALID_INVENTORY_ADJUSTMENT';end if;
 if char_length(btrim(coalesce(p_reason,''))) not between 3 and 500 or btrim(coalesce(p_idempotency_key,''))='' then raise exception 'INVENTORY_REASON_AND_KEY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('inventory:'||p_idempotency_key,0));select * into existing from public.inventory_movements where idempotency_key=p_idempotency_key;if found then return jsonb_build_object('item',(select row_to_json(i) from public.inventory_items i where i.id=existing.inventory_item_id),'movement',row_to_json(existing),'replayed',true);end if;
 insert into public.inventory_items(branch_id,product_id,updated_by) values(p_branch_id,p_product_id,auth.uid()) on conflict(branch_id,product_id) do nothing;
 select * into item from public.inventory_items where branch_id=p_branch_id and product_id=p_product_id for update;
 if p_expected_version is not null and item.version<>p_expected_version then raise exception 'INVENTORY_VERSION_CHANGED';end if;
 if item.stock_on_hand+p_quantity_delta<0 then raise exception 'INSUFFICIENT_STOCK';end if;
 update public.inventory_items set stock_on_hand=stock_on_hand+p_quantity_delta,version=version+1,updated_at=now(),updated_by=auth.uid() where id=item.id returning * into item;
 insert into public.inventory_movements(inventory_item_id,movement_type,quantity_delta,balance_after,reason,idempotency_key,created_by) values(item.id,normalized_type,p_quantity_delta,item.stock_on_hand,left(btrim(p_reason),500),left(btrim(p_idempotency_key),128),auth.uid()) returning * into movement;
 perform public.write_pos_audit('INVENTORY_ADJUSTED','PRODUCT',p_product_id,p_reason,jsonb_build_object('branchId',p_branch_id,'delta',p_quantity_delta,'balance',item.stock_on_hand,'movementId',movement.id));
 return jsonb_build_object('item',row_to_json(item),'movement',row_to_json(movement),'replayed',false);
end;$$;
revoke all on function public.adjust_inventory(uuid,uuid,numeric,text,text,text,bigint) from public,anon;grant execute on function public.adjust_inventory(uuid,uuid,numeric,text,text,text,bigint) to authenticated;

create or replace function public.list_inventory(p_branch_id uuid,p_search text default null,p_low_stock_only boolean default false,p_limit integer default 25,p_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if not public.has_pos_permission('inventory.view') then raise exception 'INSUFFICIENT_PERMISSION';end if;
 return jsonb_build_object('rows',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from(select i.id,i.branch_id,i.product_id,p.product_code,p.product_name,i.stock_on_hand,i.reorder_level,i.unit,i.version,i.updated_at from public.inventory_items i join public.products p on p.id=i.product_id where i.branch_id=p_branch_id and (coalesce(p_search,'')='' or p.product_name ilike '%'||replace(p_search,'%','')||'%' or p.product_code ilike '%'||replace(p_search,'%','')||'%') and (not p_low_stock_only or i.stock_on_hand<=i.reorder_level) order by (i.stock_on_hand<=i.reorder_level) desc,p.product_name limit least(greatest(p_limit,1),100) offset greatest(p_offset,0))x),'total',(select count(*) from public.inventory_items i join public.products p on p.id=i.product_id where i.branch_id=p_branch_id and (coalesce(p_search,'')='' or p.product_name ilike '%'||replace(p_search,'%','')||'%' or p.product_code ilike '%'||replace(p_search,'%','')||'%') and (not p_low_stock_only or i.stock_on_hand<=i.reorder_level)));
end;$$;
revoke all on function public.list_inventory(uuid,text,boolean,integer,integer) from public,anon;grant execute on function public.list_inventory(uuid,text,boolean,integer,integer) to authenticated;

create table if not exists public.print_jobs(
 id uuid primary key default gen_random_uuid(),printer_id uuid not null references public.printer_configs(id) on delete restrict,
 branch_id uuid not null references public.branches(id) on delete restrict,job_type varchar(30) not null check(job_type in('RECEIPT','KITCHEN_TICKET','TEST')),
 entity_id uuid,payload jsonb not null check(jsonb_typeof(payload)='object'),status varchar(20) not null default 'PENDING' check(status in('PENDING','PROCESSING','SUCCEEDED','FAILED','CANCELLED')),
 attempts smallint not null default 0 check(attempts between 0 and 10),next_attempt_at timestamptz not null default now(),locked_at timestamptz,locked_by varchar(100),
 last_error varchar(500),idempotency_key varchar(128) not null unique,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index if not exists idx_print_jobs_claim on public.print_jobs(status,next_attempt_at,created_at) where status in('PENDING','FAILED');
alter table public.print_jobs enable row level security;revoke all on public.print_jobs from public,anon,authenticated;grant select on public.print_jobs to authenticated;grant all on public.print_jobs to service_role;
create policy permitted_print_jobs_read on public.print_jobs for select to authenticated using(public.has_pos_permission('device.manage'));
create or replace function public.enqueue_print_job(p_printer_id uuid,p_job_type text,p_entity_id uuid,p_payload jsonb,p_idempotency_key text) returns public.print_jobs language plpgsql security definer set search_path=public as $$ declare result public.print_jobs%rowtype;branch uuid;begin
 if not public.has_pos_permission('device.manage') then raise exception 'INSUFFICIENT_PERMISSION';end if;if upper(p_job_type) not in('RECEIPT','KITCHEN_TICKET','TEST') or jsonb_typeof(p_payload)<>'object' or btrim(coalesce(p_idempotency_key,''))='' then raise exception 'INVALID_PRINT_JOB';end if;
 select branch_id into branch from public.profiles where id=auth.uid();insert into public.print_jobs(printer_id,branch_id,job_type,entity_id,payload,idempotency_key) values(p_printer_id,branch,upper(p_job_type),p_entity_id,p_payload,left(btrim(p_idempotency_key),128)) on conflict(idempotency_key) do update set idempotency_key=excluded.idempotency_key returning * into result;return result;
end;$$;
create or replace function public.retry_print_job(p_job_id uuid) returns public.print_jobs language plpgsql security definer set search_path=public as $$ declare prior public.print_jobs%rowtype;result public.print_jobs%rowtype;begin
 if not public.has_pos_permission('device.manage') then raise exception 'INSUFFICIENT_PERMISSION';end if;select * into prior from public.print_jobs where id=p_job_id for update;if not found then raise exception 'PRINT_JOB_NOT_FOUND';end if;if prior.status not in('FAILED','CANCELLED') or prior.attempts>=10 then raise exception 'PRINT_JOB_NOT_RETRYABLE';end if;update public.print_jobs set status='PENDING',next_attempt_at=now(),locked_at=null,locked_by=null,last_error=null,updated_at=now() where id=p_job_id returning * into result;insert into public.audit_logs(actor_id,action,entity_type,entity_id,old_value,new_value,branch_id) values(auth.uid(),'PRINT_JOB_RETRIED','PRINT_JOB',p_job_id,to_jsonb(prior),to_jsonb(result),result.branch_id);return result;
end;$$;
revoke all on function public.enqueue_print_job(uuid,text,uuid,jsonb,text),public.retry_print_job(uuid) from public,anon;grant execute on function public.enqueue_print_job(uuid,text,uuid,jsonb,text),public.retry_print_job(uuid) to authenticated;
create or replace function public.upsert_device_heartbeat(p_device_id text,p_device_type text,p_display_name text,p_state text,p_pending_jobs integer default 0,p_failed_jobs integer default 0,p_metadata jsonb default '{}'::jsonb) returns void language plpgsql security definer set search_path=public as $$ begin
 if not public.has_pos_permission('device.manage') then raise exception 'INSUFFICIENT_PERMISSION';end if;
 insert into public.system_device_heartbeats(device_key,device_type,display_name,state,last_seen_at,pending_jobs,failed_jobs,metadata,updated_at) values(left(p_device_id,100),upper(p_device_type),left(p_display_name,120),upper(p_state),now(),greatest(p_pending_jobs,0),greatest(p_failed_jobs,0),coalesce(p_metadata,'{}'),now()) on conflict(device_key) do update set device_type=excluded.device_type,display_name=excluded.display_name,state=excluded.state,last_seen_at=now(),pending_jobs=excluded.pending_jobs,failed_jobs=excluded.failed_jobs,metadata=excluded.metadata,updated_at=now();
end;$$;
revoke all on function public.upsert_device_heartbeat(text,text,text,text,integer,integer,jsonb) from public,anon;grant execute on function public.upsert_device_heartbeat(text,text,text,text,integer,integer,jsonb) to authenticated;

create table if not exists public.payment_gateway_events(
 id uuid primary key default gen_random_uuid(),provider varchar(80) not null,event_id varchar(160) not null,event_type varchar(80) not null,
 transaction_reference varchar(160),order_id uuid references public.orders(id) on delete restrict,amount numeric(12,2),currency_code char(3),
 verification_status varchar(20) not null check(verification_status in('VERIFIED','REJECTED')),processing_status varchar(20) not null default 'PENDING' check(processing_status in('PENDING','MATCHED','APPLIED','IGNORED','ERROR')),
 payload_digest varchar(128) not null,error varchar(500),received_at timestamptz not null default now(),processed_at timestamptz,unique(provider,event_id)
);
alter table public.payment_gateway_events enable row level security;revoke all on public.payment_gateway_events from public,anon,authenticated;grant select on public.payment_gateway_events to authenticated;grant all on public.payment_gateway_events to service_role;
create policy permitted_gateway_events_read on public.payment_gateway_events for select to authenticated using(public.has_pos_permission('payment.reconcile'));

create table if not exists public.api_rate_limit_windows(
 subject_key varchar(180) not null,action varchar(80) not null,window_started_at timestamptz not null,request_count integer not null default 1 check(request_count>0),primary key(subject_key,action,window_started_at)
);
revoke all on public.api_rate_limit_windows from public,anon,authenticated;grant all on public.api_rate_limit_windows to service_role;
create or replace function public.consume_api_rate_limit(p_subject_key text,p_action text,p_limit integer,p_window_seconds integer) returns boolean language plpgsql security definer set search_path=public as $$
declare bucket timestamptz:=to_timestamp(floor(extract(epoch from clock_timestamp())/p_window_seconds)*p_window_seconds);current_count integer;
begin
 if p_limit not between 1 and 10000 or p_window_seconds not between 1 and 86400 then raise exception 'INVALID_RATE_LIMIT';end if;
 insert into public.api_rate_limit_windows(subject_key,action,window_started_at,request_count) values(left(p_subject_key,180),left(p_action,80),bucket,1) on conflict(subject_key,action,window_started_at) do update set request_count=public.api_rate_limit_windows.request_count+1 returning request_count into current_count;
 return current_count<=p_limit;
end;$$;
revoke all on function public.consume_api_rate_limit(text,text,integer,integer) from public,anon,authenticated;grant execute on function public.consume_api_rate_limit(text,text,integer,integer) to service_role;

alter table public.system_backup_records add column if not exists verified_at timestamptz,add column if not exists verification_status varchar(20) default 'UNVERIFIED' check(verification_status in('UNVERIFIED','VERIFIED','RESTORE_TESTED','FAILED')),add column if not exists restore_tested_at timestamptz,add column if not exists checksum varchar(128),add column if not exists verified_by uuid references public.profiles(id) on delete set null;
create or replace function public.verify_backup_record(p_record_id bigint,p_status text,p_checksum text default null) returns public.system_backup_records language plpgsql security definer set search_path=public as $$ declare result public.system_backup_records%rowtype;normalized text:=upper(p_status);begin
 if not public.has_pos_permission('backup.verify') then raise exception 'INSUFFICIENT_PERMISSION';end if;if normalized not in('VERIFIED','RESTORE_TESTED','FAILED') then raise exception 'INVALID_BACKUP_VERIFICATION';end if;
 update public.system_backup_records set verification_status=normalized,verified_at=now(),restore_tested_at=case when normalized='RESTORE_TESTED' then now() else restore_tested_at end,checksum=nullif(left(btrim(coalesce(p_checksum,'')),128),''),verified_by=auth.uid() where id=p_record_id returning * into result;if not found then raise exception 'BACKUP_RECORD_NOT_FOUND';end if;
 perform public.write_pos_audit('BACKUP_'||normalized,'BACKUP',null,null,jsonb_build_object('recordId',p_record_id,'provider',result.provider,'completedAt',result.completed_at));return result;
end;$$;
revoke all on function public.verify_backup_record(bigint,text,text) from public,anon;grant execute on function public.verify_backup_record(bigint,text,text) to authenticated;

create or replace function public.write_pos_audit_diff(p_action text,p_entity_type text,p_entity_id uuid,p_reason text,p_old_value jsonb,p_new_value jsonb,p_metadata jsonb default '{}'::jsonb) returns uuid language plpgsql security definer set search_path=public as $$ declare audit_id uuid;begin
 if btrim(coalesce(p_action,''))='' or btrim(coalesce(p_entity_type,''))='' then raise exception 'INVALID_AUDIT_EVENT';end if;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,reason,metadata,old_value,new_value,branch_id) values(auth.uid(),upper(left(btrim(p_action),80)),upper(left(btrim(p_entity_type),50)),p_entity_id,nullif(left(btrim(coalesce(p_reason,'')),500),''),coalesce(p_metadata,'{}'),p_old_value,p_new_value,(select branch_id from public.profiles where id=auth.uid())) returning id into audit_id;return audit_id;
end;$$;
revoke all on function public.write_pos_audit_diff(text,text,uuid,text,jsonb,jsonb,jsonb) from public,anon,authenticated;

commit;
