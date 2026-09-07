begin;

-- A correction must be another event: historical evidence is never rewritten.
alter table public.audit_logs
  add column if not exists staff_session_id uuid references public.terminal_staff_sessions(id) on delete restrict,
  add column if not exists event_status varchar(16) not null default 'SUCCEEDED' check (event_status in ('PENDING','SUCCEEDED','APPROVED','REJECTED','FAILED')),
  add column if not exists correlation_id text,
  add column if not exists error_code varchar(100),
  add column if not exists error_message varchar(500),
  add column if not exists order_id uuid references public.orders(id) on delete restrict,
  add column if not exists order_item_id uuid references public.order_items(id) on delete restrict,
  add column if not exists payment_id uuid references public.payments(id) on delete restrict,
  add column if not exists receipt_id uuid references public.receipts(id) on delete restrict;
create index if not exists idx_audit_logs_timeline on public.audit_logs(company_id, branch_id, created_at desc, id desc);
create index if not exists idx_audit_logs_status on public.audit_logs(event_status, created_at desc);
create index if not exists idx_audit_logs_order_timeline on public.audit_logs(order_id, created_at asc, id asc) where order_id is not null;
create index if not exists idx_audit_logs_correlation on public.audit_logs(correlation_id, created_at asc) where correlation_id is not null;

create or replace function public.protect_pos_audit_history() returns trigger language plpgsql security definer set search_path=public as $$
begin raise exception 'AUDIT_LOG_IMMUTABLE'; end $$;
revoke all on function public.protect_pos_audit_history() from public, anon, authenticated;
drop trigger if exists audit_logs_no_update on public.audit_logs;
create trigger audit_logs_no_update before update on public.audit_logs for each row execute function public.protect_pos_audit_history();
drop trigger if exists audit_logs_no_delete on public.audit_logs;
create trigger audit_logs_no_delete before delete on public.audit_logs for each row execute function public.protect_pos_audit_history();

-- Server-side attribution cannot be forged by browser input.
create or replace function public.attribute_pos_audit() returns trigger language plpgsql security definer set search_path=public as $$
declare s public.terminal_staff_sessions;
begin
 s:=public.current_terminal_staff_session();
 new.actor_auth_user_id:=coalesce(s.actor_auth_user_id,auth.uid(),new.actor_id); new.actor_staff_id:=coalesce(s.staff_id,new.actor_staff_id); new.staff_session_id:=coalesce(s.id,new.staff_session_id); new.terminal_id:=coalesce(s.terminal_id,new.terminal_id);
 if s.id is not null then new.branch_id:=s.branch_id;
 elsif new.entity_type='BRANCH' then new.branch_id:=new.entity_id;
 elsif new.entity_type='TERMINAL' then select branch_id into new.branch_id from public.pos_terminals where id=new.entity_id;
 elsif new.entity_type='ORDER' then select branch_id,id into new.branch_id,new.order_id from public.orders where id=new.entity_id;
 elsif new.entity_type='PAYMENT' then select branch_id,order_id,id into new.branch_id,new.order_id,new.payment_id from public.payments where id=new.entity_id;
 elsif new.entity_type='RECEIPT' then select branch_id,order_id,id into new.branch_id,new.order_id,new.receipt_id from public.receipts where id=new.entity_id;
 end if;
 if new.branch_id is null and new.entity_type<>'COMPANY' then select branch_id into new.branch_id from public.profiles where id=coalesce(auth.uid(),new.actor_id); end if;
 new.order_id:=coalesce(new.order_id,nullif(new.metadata->>'orderId','')::uuid); new.order_item_id:=coalesce(new.order_item_id,nullif(new.metadata->>'orderItemId','')::uuid); new.payment_id:=coalesce(new.payment_id,nullif(new.metadata->>'paymentId','')::uuid); new.receipt_id:=coalesce(new.receipt_id,nullif(new.metadata->>'receiptId','')::uuid);
 if new.order_id is not null and new.branch_id is null then select branch_id into new.branch_id from public.orders where id=new.order_id; end if;
 if new.entity_type='COMPANY' then new.company_id:=new.entity_id; new.branch_id:=null; elsif new.branch_id is not null then select company_id into new.company_id from public.branches where id=new.branch_id; end if;
 return new;
end $$;

create or replace function public.write_pos_audit(p_action text,p_entity_type text,p_entity_id uuid,p_reason text default null,p_metadata jsonb default '{}'::jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare audit_id uuid; m jsonb:=coalesce(p_metadata,'{}'::jsonb); event_result text:=upper(coalesce(m->>'status','SUCCEEDED'));
begin
 if btrim(coalesce(p_action,''))='' or btrim(coalesce(p_entity_type,''))='' then raise exception 'INVALID_AUDIT_EVENT'; end if;
 if event_result not in ('PENDING','SUCCEEDED','APPROVED','REJECTED','FAILED') then raise exception 'INVALID_AUDIT_STATUS'; end if;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,reason,metadata,event_status,correlation_id,request_id,error_code,error_message,approved_by_staff_id)
 values(auth.uid(),upper(left(btrim(p_action),80)),upper(left(btrim(p_entity_type),50)),p_entity_id,nullif(left(btrim(coalesce(p_reason,'')),500),''),m,event_result,coalesce(nullif(m->>'correlationId',''),nullif(current_setting('app.correlation_id',true),'')),coalesce(nullif(m->>'requestId',''),nullif(current_setting('app.request_id',true),'')),left(nullif(m->>'errorCode',''),100),left(nullif(m->>'errorMessage',''),500),nullif(m->>'approvedBy','')::uuid) returning id into audit_id;
 return audit_id;
end $$;
revoke all on function public.write_pos_audit(text,text,uuid,text,jsonb) from public, anon, authenticated;

create or replace function public.write_pos_audit_diff(p_action text,p_entity_type text,p_entity_id uuid,p_reason text,p_old_value jsonb,p_new_value jsonb,p_metadata jsonb default '{}'::jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare audit_id uuid; m jsonb:=coalesce(p_metadata,'{}'::jsonb); event_result text:=upper(coalesce(m->>'status','SUCCEEDED'));
begin
 if btrim(coalesce(p_action,''))='' or btrim(coalesce(p_entity_type,''))='' then raise exception 'INVALID_AUDIT_EVENT'; end if;
 if event_result not in ('PENDING','SUCCEEDED','APPROVED','REJECTED','FAILED') then raise exception 'INVALID_AUDIT_STATUS'; end if;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,reason,metadata,old_value,new_value,event_status,correlation_id,request_id,error_code,error_message,approved_by_staff_id)
 values(auth.uid(),upper(left(btrim(p_action),80)),upper(left(btrim(p_entity_type),50)),p_entity_id,nullif(left(btrim(coalesce(p_reason,'')),500),''),m,p_old_value,p_new_value,event_result,coalesce(nullif(m->>'correlationId',''),nullif(current_setting('app.correlation_id',true),'')),coalesce(nullif(m->>'requestId',''),nullif(current_setting('app.request_id',true),'')),left(nullif(m->>'errorCode',''),100),left(nullif(m->>'errorMessage',''),500),nullif(m->>'approvedBy','')::uuid) returning id into audit_id;
 return audit_id;
end $$;
revoke all on function public.write_pos_audit_diff(text,text,uuid,text,jsonb,jsonb,jsonb) from public, anon, authenticated;

create or replace function public.list_pos_audit_events(p_filters jsonb default '{}'::jsonb) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare f jsonb:=coalesce(p_filters,'{}'::jsonb); safe_limit integer:=least(greatest(coalesce(nullif(f->>'limit','')::integer,100),1),250); term text:=left(btrim(coalesce(f->>'search','')),100);
begin
 if not public.has_pos_permission('audit.view') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc) from (
  select a.id,a.action,a.entity_type,a.entity_id,a.reason,a.metadata,a.old_value,a.new_value,a.request_id,a.correlation_id,a.event_status,a.error_code,a.error_message,a.company_id,a.branch_id,a.terminal_id,a.staff_session_id,a.actor_auth_user_id,a.actor_staff_id,a.approved_by_staff_id,a.order_id,a.order_item_id,a.payment_id,a.receipt_id,a.created_at,coalesce(actor.name,'System') actor_name,approver.name approved_by_name
  from public.audit_logs a left join public.profiles actor on actor.id=coalesce(a.actor_staff_id,a.actor_id) left join public.profiles approver on approver.id=a.approved_by_staff_id
  where a.branch_id is not null and public.can_access_branch(a.branch_id)
   and (nullif(f->>'companyId','') is null or a.company_id=nullif(f->>'companyId','')::uuid) and (nullif(f->>'branchId','') is null or a.branch_id=nullif(f->>'branchId','')::uuid) and (nullif(f->>'terminalId','') is null or a.terminal_id=nullif(f->>'terminalId','')::uuid) and (nullif(f->>'staffId','') is null or coalesce(a.actor_staff_id,a.actor_id)=nullif(f->>'staffId','')::uuid) and (nullif(f->>'eventStatus','') is null or a.event_status=upper(f->>'eventStatus')) and (nullif(f->>'action','') is null or a.action=upper(f->>'action')) and (nullif(f->>'entityType','') is null or a.entity_type=upper(f->>'entityType')) and (nullif(f->>'dateFrom','') is null or a.created_at >= (f->>'dateFrom')::date) and (nullif(f->>'dateTo','') is null or a.created_at < ((f->>'dateTo')::date+1)) and (term='' or a.action ilike '%'||term||'%' or a.entity_type ilike '%'||term||'%' or a.reason ilike '%'||term||'%' or a.entity_id::text=term or a.order_id::text=term or a.payment_id::text=term or a.receipt_id::text=term)
  order by a.created_at desc,a.id desc limit safe_limit
 ) x),'[]'::jsonb);
end $$;
revoke all on function public.list_pos_audit_events(jsonb) from public, anon;
grant execute on function public.list_pos_audit_events(jsonb) to authenticated;
commit;
