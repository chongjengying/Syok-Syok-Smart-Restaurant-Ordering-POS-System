begin;

-- Management writes use validated Edge/RPC boundaries even for ADMIN.
revoke insert,update,delete on public.restaurant_tables,public.roles from authenticated;

create or replace function public.record_table_admin_action(p_table_id uuid,p_action text,p_details jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if not public.has_pos_permission('table.manage') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if upper(p_action) not in ('TABLE_CREATED','TABLE_UPDATED','TABLE_DEACTIVATED','TABLE_ACTIVATED') then raise exception 'INVALID_AUDIT_ACTION'; end if;
  return public.write_pos_audit(upper(p_action),'TABLE',p_table_id,null,coalesce(p_details,'{}'::jsonb));
end;
$$;
revoke all on function public.record_table_admin_action(uuid,text,jsonb) from public,anon;
grant execute on function public.record_table_admin_action(uuid,text,jsonb) to authenticated;

create or replace function public.record_user_admin_action(p_user_id uuid,p_action text)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if upper(p_action)='USER_CREATED' and not public.has_pos_permission('user.create') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if upper(p_action)='USER_PASSWORD_RESET_REQUESTED' and not public.has_pos_permission('user.edit') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if upper(p_action) not in ('USER_CREATED','USER_PASSWORD_RESET_REQUESTED') then raise exception 'INVALID_AUDIT_ACTION'; end if;
  return public.write_pos_audit(upper(p_action),'PROFILE',p_user_id,null,'{}'::jsonb);
end;
$$;

create or replace function public.record_my_login()
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if public.current_pos_role() is null then raise exception 'ACTIVE_PROFILE_REQUIRED'; end if;
  return public.write_pos_audit('LOGIN','PROFILE',auth.uid(),null,'{}'::jsonb);
end;
$$;
revoke all on function public.record_user_admin_action(uuid,text), function public.record_my_login() from public,anon;
grant execute on function public.record_user_admin_action(uuid,text), function public.record_my_login() to authenticated;

create or replace function public.enforce_admin_exception_permissions()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name='refunds' and auth.uid() is not null and not public.has_pos_permission('payment.refund') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if tg_table_name='orders' and new.status='CANCELLED' and new.status is distinct from old.status
     and public.current_pos_role() in ('ADMIN','MANAGER') and not public.has_pos_permission('order.manage') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  return new;
end;
$$;
revoke all on function public.enforce_admin_exception_permissions() from public,anon,authenticated;
drop trigger if exists trg_enforce_refund_permission on public.refunds;
create trigger trg_enforce_refund_permission before insert on public.refunds for each row execute function public.enforce_admin_exception_permissions();
drop trigger if exists trg_enforce_admin_cancel_permission on public.orders;
create trigger trg_enforce_admin_cancel_permission before update of status on public.orders for each row execute function public.enforce_admin_exception_permissions();

create or replace function public.audit_admin_business_exception()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name='orders' and new.status='CANCELLED' and new.status is distinct from old.status then
    insert into public.audit_logs(actor_id,action,entity_type,entity_id,old_value,new_value,reason)
    values(auth.uid(),'ORDER_CANCELLED','ORDER',new.id,to_jsonb(old),to_jsonb(new),nullif(current_setting('app.status_change_notes',true),''));
  elsif tg_table_name='refunds' then
    insert into public.audit_logs(actor_id,action,entity_type,entity_id,new_value,reason)
    values(new.requested_by,'PAYMENT_REFUNDED','PAYMENT',new.payment_id,to_jsonb(new),new.reason);
  end if; return new;
end;
$$;
revoke all on function public.audit_admin_business_exception() from public,anon,authenticated;
drop trigger if exists trg_audit_order_cancelled on public.orders;
create trigger trg_audit_order_cancelled after update of status on public.orders for each row execute function public.audit_admin_business_exception();
drop trigger if exists trg_audit_payment_refunded on public.refunds;
create trigger trg_audit_payment_refunded after insert on public.refunds for each row execute function public.audit_admin_business_exception();

create or replace function public.get_admin_report(p_report_type text,p_date_from date,p_date_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare report_type text:=lower(btrim(coalesce(p_report_type,''))); rows jsonb; from_at timestamptz; to_at timestamptz;
begin
  if not public.has_pos_permission('report.view') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if p_date_from is null or p_date_to is null or p_date_from>p_date_to then raise exception 'INVALID_REPORT_RANGE'; end if;
  if p_date_to-p_date_from>366 then raise exception 'REPORT_RANGE_TOO_LARGE'; end if;
  from_at:=p_date_from::timestamp at time zone 'Asia/Kuala_Lumpur';
  to_at:=(p_date_to+1)::timestamp at time zone 'Asia/Kuala_Lumpur';

  if report_type='daily' then
    select coalesce(jsonb_agg(to_jsonb(x) order by paid_at desc),'[]') into rows from (
      select coalesce(p.paid_at,p.created_at)::date report_date,p.order_id,o.order_number,o.user_id,o.status order_status,o.dining_mode,o.restaurant_table_id,
        p.id payment_id,p.payment_number,p.payment_method,coalesce(p.provider,'UNSPECIFIED') provider,p.transaction_reference,o.subtotal,o.tax,o.discount,p.amount amount_paid,o.total order_total,coalesce(p.paid_at,p.created_at) paid_at,o.service_charge
      from public.payments p join public.orders o on o.id=p.order_id where p.status='PAID' and coalesce(p.paid_at,p.created_at)>=from_at and coalesce(p.paid_at,p.created_at)<to_at)x;
  elsif report_type='products' then
    select coalesce(jsonb_agg(to_jsonb(x) order by gross_sales desc),'[]') into rows from (
      select p.id product_id,p.product_code,p.product_name,c.name category_name,sum(oi.quantity) quantity_sold,count(distinct o.id) order_count,
        case when sum(oi.quantity)>0 then sum(oi.subtotal)/sum(oi.quantity) else 0 end average_unit_price,sum(oi.subtotal) gross_sales
      from public.order_items oi join public.orders o on o.id=oi.order_id join public.products p on p.id=oi.product_id left join public.categories c on c.id=p.category_id
      where o.created_at>=from_at and o.created_at<to_at and o.status not in ('CANCELLED','REFUNDED') group by p.id,p.product_code,p.product_name,c.name)x;
  elsif report_type='monthly' then
    select coalesce(jsonb_agg(to_jsonb(x) order by period),'[]') into rows from (
      select to_char(coalesce(p.paid_at,p.created_at) at time zone 'Asia/Kuala_Lumpur','YYYY-MM') period,count(distinct p.order_id) total_orders,sum(p.amount) net_sales
      from public.payments p where p.status='PAID' and coalesce(p.paid_at,p.created_at)>=from_at and coalesce(p.paid_at,p.created_at)<to_at group by 1)x;
  elsif report_type='category' then
    select coalesce(jsonb_agg(to_jsonb(x) order by gross_sales desc),'[]') into rows from (
      select c.category_code,c.name category_name,sum(oi.quantity) quantity_sold,sum(oi.subtotal) gross_sales
      from public.order_items oi join public.orders o on o.id=oi.order_id join public.products p on p.id=oi.product_id join public.categories c on c.id=p.category_id
      where o.created_at>=from_at and o.created_at<to_at and o.status not in ('CANCELLED','REFUNDED') group by c.id,c.category_code,c.name)x;
  elsif report_type='payment-method' then
    select coalesce(jsonb_agg(to_jsonb(x) order by net_sales desc),'[]') into rows from (
      select payment_method,count(*) payment_count,sum(amount) net_sales from public.payments where status='PAID' and coalesce(paid_at,created_at)>=from_at and coalesce(paid_at,created_at)<to_at group by payment_method)x;
  elsif report_type='staff' then
    select coalesce(jsonb_agg(to_jsonb(x) order by net_sales desc),'[]') into rows from (
      select profile.id user_id,profile.name staff_name,count(distinct payment.order_id) total_orders,sum(payment.amount) net_sales
      from public.payments payment join public.profiles profile on profile.id=payment.user_id where payment.status='PAID' and coalesce(payment.paid_at,payment.created_at)>=from_at and coalesce(payment.paid_at,payment.created_at)<to_at group by profile.id,profile.name)x;
  elsif report_type='orders' then
    select coalesce(jsonb_agg(to_jsonb(x) order by created_at desc),'[]') into rows from (
      select order_number,dining_mode,status,payment_status,subtotal,discount,tax,service_charge,total,created_at from public.orders where created_at>=from_at and created_at<to_at limit 1000)x;
  elsif report_type='cancellations' then
    select coalesce(jsonb_agg(to_jsonb(x) order by created_at desc),'[]') into rows from (
      select o.order_number,o.total,o.created_at,h.notes reason,h.changed_by,h.changed_at from public.orders o left join lateral(select * from public.order_status_history where order_id=o.id and new_status='CANCELLED' order by changed_at desc limit 1)h on true where o.status='CANCELLED' and o.created_at>=from_at and o.created_at<to_at)x;
  elsif report_type='refunds' then
    select coalesce(jsonb_agg(to_jsonb(x) order by refunded_at desc),'[]') into rows from (
      select r.refund_number,o.order_number,r.amount,r.reason,r.status,r.requested_by,r.refunded_at from public.refunds r join public.orders o on o.id=r.order_id where r.refunded_at>=from_at and r.refunded_at<to_at)x;
  elsif report_type='discounts' then
    select coalesce(jsonb_agg(to_jsonb(x) order by discount desc),'[]') into rows from (
      select order_number,subtotal,discount,total,status,created_at from public.orders where discount>0 and created_at>=from_at and created_at<to_at)x;
  else raise exception 'UNSUPPORTED_REPORT_TYPE';
  end if;
  return rows;
end;
$$;
revoke all on function public.get_admin_report(text,date,date) from public,anon;
grant execute on function public.get_admin_report(text,date,date) to authenticated;
revoke execute on function public.get_daily_sales_report(date,date), function public.get_product_sales_report(date,date) from authenticated;
revoke select on public.daily_sales_report from authenticated;

create or replace function public.list_admin_orders(
  p_search text default null,p_status text default null,p_payment_status text default null,p_dining_mode text default null,
  p_date_from date default null,p_date_to date default null,p_limit integer default 25,p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare rows jsonb; total bigint; safe_limit integer:=least(greatest(coalesce(p_limit,25),1),100); safe_offset integer:=greatest(coalesce(p_offset,0),0);
begin
  if not public.has_pos_permission('order.view') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select count(*) into total from public.orders o left join public.restaurant_tables t on t.id=o.restaurant_table_id left join public.profiles staff on staff.id=o.user_id
  where (nullif(btrim(p_search),'') is null or o.order_number ilike '%'||btrim(p_search)||'%' or t.table_number ilike '%'||btrim(p_search)||'%' or staff.name ilike '%'||btrim(p_search)||'%')
    and (nullif(p_status,'') is null or o.status=upper(p_status)) and (nullif(p_payment_status,'') is null or o.payment_status=upper(p_payment_status))
    and (nullif(p_dining_mode,'') is null or o.dining_mode=lower(p_dining_mode)) and (p_date_from is null or o.created_at>=p_date_from::timestamp at time zone 'Asia/Kuala_Lumpur')
    and (p_date_to is null or o.created_at<(p_date_to+1)::timestamp at time zone 'Asia/Kuala_Lumpur');
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]') into rows from (
    select o.id,o.order_number,o.dining_mode,o.restaurant_table_id,o.user_id,o.status,o.payment_status,o.subtotal,o.discount,o.tax,o.service_charge,o.total,o.created_at,o.updated_at,t.table_number,staff.name staff_name
    from public.orders o left join public.restaurant_tables t on t.id=o.restaurant_table_id left join public.profiles staff on staff.id=o.user_id
    where (nullif(btrim(p_search),'') is null or o.order_number ilike '%'||btrim(p_search)||'%' or t.table_number ilike '%'||btrim(p_search)||'%' or staff.name ilike '%'||btrim(p_search)||'%')
      and (nullif(p_status,'') is null or o.status=upper(p_status)) and (nullif(p_payment_status,'') is null or o.payment_status=upper(p_payment_status))
      and (nullif(p_dining_mode,'') is null or o.dining_mode=lower(p_dining_mode)) and (p_date_from is null or o.created_at>=p_date_from::timestamp at time zone 'Asia/Kuala_Lumpur')
      and (p_date_to is null or o.created_at<(p_date_to+1)::timestamp at time zone 'Asia/Kuala_Lumpur') order by o.created_at desc limit safe_limit offset safe_offset)x;
  return jsonb_build_object('rows',rows,'total',total,'limit',safe_limit,'offset',safe_offset);
end;
$$;

create or replace function public.list_admin_payments(
  p_search text default null,p_method text default null,p_status text default null,p_date_from date default null,p_date_to date default null,
  p_limit integer default 25,p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare rows jsonb; total bigint; safe_limit integer:=least(greatest(coalesce(p_limit,25),1),100); safe_offset integer:=greatest(coalesce(p_offset,0),0);
begin
  if not public.has_pos_permission('payment.view') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select count(*) into total from public.payments p join public.orders o on o.id=p.order_id left join public.profiles staff on staff.id=p.user_id
  where (nullif(btrim(p_search),'') is null or p.payment_number ilike '%'||btrim(p_search)||'%' or o.order_number ilike '%'||btrim(p_search)||'%' or staff.name ilike '%'||btrim(p_search)||'%')
    and (nullif(p_method,'') is null or p.payment_method=upper(p_method)) and (nullif(p_status,'') is null or p.status=upper(p_status))
    and (p_date_from is null or coalesce(p.paid_at,p.created_at)>=p_date_from::timestamp at time zone 'Asia/Kuala_Lumpur') and (p_date_to is null or coalesce(p.paid_at,p.created_at)<(p_date_to+1)::timestamp at time zone 'Asia/Kuala_Lumpur');
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]') into rows from (
    select p.id,p.payment_number,p.order_id,p.user_id,p.payment_method,p.status,p.amount,p.provider,p.paid_at,p.created_at,o.order_number,staff.name staff_name
    from public.payments p join public.orders o on o.id=p.order_id left join public.profiles staff on staff.id=p.user_id
    where (nullif(btrim(p_search),'') is null or p.payment_number ilike '%'||btrim(p_search)||'%' or o.order_number ilike '%'||btrim(p_search)||'%' or staff.name ilike '%'||btrim(p_search)||'%')
      and (nullif(p_method,'') is null or p.payment_method=upper(p_method)) and (nullif(p_status,'') is null or p.status=upper(p_status))
      and (p_date_from is null or coalesce(p.paid_at,p.created_at)>=p_date_from::timestamp at time zone 'Asia/Kuala_Lumpur') and (p_date_to is null or coalesce(p.paid_at,p.created_at)<(p_date_to+1)::timestamp at time zone 'Asia/Kuala_Lumpur') order by p.created_at desc limit safe_limit offset safe_offset)x;
  return jsonb_build_object('rows',rows,'total',total,'limit',safe_limit,'offset',safe_offset);
end;
$$;
revoke all on function public.list_admin_orders(text,text,text,text,date,date,integer,integer), function public.list_admin_payments(text,text,text,date,date,integer,integer) from public,anon;
grant execute on function public.list_admin_orders(text,text,text,text,date,date,integer,integer), function public.list_admin_payments(text,text,text,date,date,integer,integer) to authenticated;

create or replace function public.audit_profile_permission_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role_id is distinct from old.role_id or new.role_name is distinct from old.role_name or new.status is distinct from old.status
     or new.name is distinct from old.name or new.username is distinct from old.username or new.branch_id is distinct from old.branch_id then
    insert into public.audit_logs(actor_id,action,entity_type,entity_id,old_value,new_value,metadata)
    values(auth.uid(),case when new.role_name is distinct from old.role_name then 'USER_ROLE_CHANGED' when new.status is distinct from old.status then 'USER_STATUS_CHANGED' else 'USER_UPDATED' end,'PROFILE',new.id,
      jsonb_build_object('name',old.name,'username',old.username,'role',old.role_name,'status',old.status,'branchId',old.branch_id),jsonb_build_object('name',new.name,'username',new.username,'role',new.role_name,'status',new.status,'branchId',new.branch_id),'{}');
  end if; return new;
end;
$$;
revoke all on function public.audit_profile_permission_change() from public,anon,authenticated;
drop trigger if exists trg_audit_profile_permission_change on public.profiles;
create trigger trg_audit_profile_permission_change after update of name,username,role_id,role_name,status,branch_id on public.profiles
for each row execute function public.audit_profile_permission_change();

commit;
