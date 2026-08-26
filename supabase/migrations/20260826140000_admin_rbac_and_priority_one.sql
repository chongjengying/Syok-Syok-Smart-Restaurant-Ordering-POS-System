begin;

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  code varchar(80) not null unique,
  module varchar(40) not null,
  description text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references public.profiles(id) on delete set null,
  primary key (role_id, permission_id)
);

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(), code varchar(30) not null unique, name varchar(150) not null,
  status varchar(20) not null default 'ACTIVE' check(status in ('ACTIVE','INACTIVE')), created_at timestamptz not null default now()
);
insert into public.branches(code,name) values('MAIN','Main Branch') on conflict(code) do nothing;
alter table public.profiles add column if not exists branch_id uuid references public.branches(id) on delete restrict;
update public.profiles set branch_id=(select id from public.branches where code='MAIN') where branch_id is null;

alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.branches enable row level security;
revoke all on public.permissions, public.role_permissions, public.branches from public, anon, authenticated;
grant select on public.permissions, public.role_permissions, public.branches to authenticated;
grant all on public.permissions, public.role_permissions, public.branches to service_role;

insert into public.permissions(code, module, description) values
  ('dashboard.view','dashboard','View the administration dashboard'),
  ('product.view','catalog','View all products'),
  ('product.create','catalog','Create products'),
  ('product.edit','catalog','Edit products and availability'),
  ('product.manage_image','catalog','Upload and replace product images'),
  ('product.deactivate','catalog','Deactivate products'),
  ('category.view','catalog','View all categories'),
  ('category.create','catalog','Create categories'),
  ('category.edit','catalog','Edit categories and display order'),
  ('user.view','identity','View staff accounts'),
  ('user.create','identity','Invite staff accounts'),
  ('user.edit','identity','Edit and activate staff accounts'),
  ('user.assign_role','identity','Assign staff roles'),
  ('role.view','identity','View roles and permission assignments'),
  ('role.edit','identity','Change role permission assignments'),
  ('order.view','operations','View all orders'),
  ('order.manage','operations','Manage exceptional order transitions'),
  ('payment.view','finance','View payments'),
  ('payment.refund','finance','Refund eligible paid orders'),
  ('table.view','operations','View all restaurant tables'),
  ('table.manage','operations','Create and edit restaurant tables'),
  ('report.view','reporting','View business reports'),
  ('audit.view','security','View append-only audit events'),
  ('settings.manage','security','Manage protected system settings')
on conflict (code) do update set module = excluded.module, description = excluded.description;

insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id from public.roles role cross join public.permissions permission
where role.name = 'ADMIN'
on conflict do nothing;

insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id
from public.roles role join public.permissions permission on permission.code = any(array[
  'dashboard.view','product.view','product.create','product.edit','product.manage_image','product.deactivate',
  'category.view','category.create','category.edit','order.view','order.manage','payment.view','payment.refund',
  'table.view','table.manage','report.view','audit.view'
]) where role.name = 'MANAGER'
on conflict do nothing;

insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id
from public.roles role join public.permissions permission on permission.code = any(
  case role.name
    when 'CASHIER' then array['product.view','category.view','order.view','payment.view','table.view']
    when 'WAITER' then array['product.view','category.view','order.view','table.view']
    when 'KITCHEN' then array['product.view','category.view','order.view','table.view']
    else array[]::text[]
  end
) where role.name in ('CASHIER','WAITER','KITCHEN')
on conflict do nothing;

create or replace function public.has_pos_permission(p_permission text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles profile
    join public.roles role on role.id = profile.role_id
    join public.role_permissions assignment on assignment.role_id = role.id
    join public.permissions permission on permission.id = assignment.permission_id
    where profile.id = auth.uid() and profile.status = 'ACTIVE' and permission.code = p_permission
  )
$$;

create or replace function public.get_my_permissions()
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(permission.code order by permission.code), array[]::text[])
  from public.profiles profile
  join public.role_permissions assignment on assignment.role_id = profile.role_id
  join public.permissions permission on permission.id = assignment.permission_id
  where profile.id = auth.uid() and profile.status = 'ACTIVE'
$$;

revoke all on function public.has_pos_permission(text), function public.get_my_permissions() from public, anon;
grant execute on function public.has_pos_permission(text), function public.get_my_permissions() to authenticated;

create policy active_staff_read_permission_catalog on public.permissions for select to authenticated
using (
  public.has_pos_permission('role.view')
  or exists (
    select 1 from public.profiles profile join public.role_permissions assignment on assignment.role_id=profile.role_id
    where profile.id=auth.uid() and profile.status='ACTIVE' and assignment.permission_id=permissions.id
  )
);
create policy permitted_staff_read_role_permissions on public.role_permissions for select to authenticated
using (public.has_pos_permission('role.view') or role_id = (select role_id from public.profiles where id = auth.uid()));
create policy active_staff_read_branches on public.branches for select to authenticated using(public.current_pos_role() is not null);

create or replace function public.guard_profile_privilege_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('app.admin_profile_write',true)<>'allowed' and auth.uid() is not null and (
    new.id is distinct from old.id or new.role_id is distinct from old.role_id or new.role_name is distinct from old.role_name
    or new.email is distinct from old.email or new.password_hash is distinct from old.password_hash or new.status is distinct from old.status
    or new.login_attempt is distinct from old.login_attempt or new.created_at is distinct from old.created_at or new.branch_id is distinct from old.branch_id
  ) then raise exception 'PROTECTED_PROFILE_FIELD'; end if;
  return new;
end;
$$;
revoke all on function public.guard_profile_privilege_fields() from public,anon,authenticated;

alter table public.categories add column if not exists display_order integer not null default 0;
alter table public.categories drop constraint if exists categories_display_order_check;
alter table public.categories add constraint categories_display_order_check check(display_order>=0);
create index if not exists idx_categories_display_order on public.categories(display_order, name);

alter table public.audit_logs
  add column if not exists old_value jsonb,
  add column if not exists new_value jsonb,
  add column if not exists request_id text,
  add column if not exists device_context jsonb not null default '{}'::jsonb,
  add column if not exists branch_id uuid;

drop policy if exists management_read_audit_logs on public.audit_logs;
create policy permitted_read_audit_logs on public.audit_logs for select to authenticated
using (public.has_pos_permission('audit.view'));

create or replace function public.save_admin_category(p_category_id uuid, p_payload jsonb)
returns public.categories language plpgsql security definer set search_path = public as $$
declare result public.categories%rowtype; action_name text; category_name text := btrim(coalesce(p_payload->>'name',''));
begin
  if p_category_id is null and not public.has_pos_permission('category.create') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if p_category_id is not null and not public.has_pos_permission('category.edit') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if char_length(category_name) not between 1 and 150 then raise exception 'INVALID_CATEGORY_NAME'; end if;
  if coalesce((p_payload->>'displayOrder')::integer,0)<0 then raise exception 'INVALID_DISPLAY_ORDER'; end if;
  if p_category_id is null then
    insert into public.categories(name, description, status, display_order)
    values(category_name, nullif(left(btrim(coalesce(p_payload->>'description','')),1000),''), coalesce((p_payload->>'status')::boolean,true), coalesce((p_payload->>'displayOrder')::integer,0))
    returning * into result; action_name := 'CATEGORY_CREATED';
  else
    update public.categories set name=category_name, description=nullif(left(btrim(coalesce(p_payload->>'description','')),1000),''),
      status=coalesce((p_payload->>'status')::boolean,status), display_order=coalesce((p_payload->>'displayOrder')::integer,display_order)
    where id=p_category_id returning * into result; if not found then raise exception 'CATEGORY_NOT_FOUND'; end if; action_name := 'CATEGORY_UPDATED';
  end if;
  perform public.write_pos_audit(action_name,'CATEGORY',result.id,null,jsonb_build_object('categoryCode',result.category_code,'name',result.name));
  return result;
exception when invalid_text_representation then raise exception 'INVALID_CATEGORY_INPUT';
end;
$$;

create or replace function public.save_admin_product(p_product_id uuid, p_payload jsonb)
returns public.products language plpgsql security definer set search_path = public as $$
declare result public.products%rowtype; prior public.products%rowtype; action_name text; product_name text := btrim(coalesce(p_payload->>'name',''));
  price numeric; cost numeric; category_id uuid;
begin
  if p_product_id is null and not public.has_pos_permission('product.create') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if p_product_id is not null and not public.has_pos_permission('product.edit') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if char_length(product_name) not between 1 and 150 then raise exception 'INVALID_PRODUCT_NAME'; end if;
  price := (p_payload->>'price')::numeric; cost := coalesce((p_payload->>'cost')::numeric,0); category_id := (p_payload->>'categoryId')::uuid;
  if price < 0 or cost < 0 then raise exception 'INVALID_PRODUCT_PRICE'; end if;
  perform 1 from public.categories where id=category_id; if not found then raise exception 'CATEGORY_NOT_FOUND'; end if;
  if p_product_id is null then
    insert into public.products(category_id,product_name,description,unit,cost_price,sell_price,status,is_available)
    values(category_id,product_name,nullif(left(btrim(coalesce(p_payload->>'description','')),1000),''),nullif(left(btrim(coalesce(p_payload->>'unit','')),20),''),cost,price,
      coalesce((p_payload->>'isActive')::boolean,true),coalesce((p_payload->>'isAvailable')::boolean,true)) returning * into result;
    action_name := 'PRODUCT_CREATED';
  else
    select * into prior from public.products where id=p_product_id for update; if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
    if prior.status and coalesce((p_payload->>'isActive')::boolean,prior.status)=false and not public.has_pos_permission('product.deactivate') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
    update public.products set category_id=category_id,product_name=product_name,description=nullif(left(btrim(coalesce(p_payload->>'description','')),1000),''),
      unit=nullif(left(btrim(coalesce(p_payload->>'unit','')),20),''),cost_price=cost,sell_price=price,
      status=coalesce((p_payload->>'isActive')::boolean,status),is_available=coalesce((p_payload->>'isAvailable')::boolean,is_available)
    where id=p_product_id returning * into result; action_name := case when prior.sell_price is distinct from result.sell_price then 'PRODUCT_PRICE_CHANGED' else 'PRODUCT_UPDATED' end;
  end if;
  perform public.write_pos_audit(action_name,'PRODUCT',result.id,null,jsonb_build_object('productCode',result.product_code,'price',result.sell_price));
  return result;
exception when invalid_text_representation then raise exception 'INVALID_PRODUCT_INPUT';
end;
$$;

create or replace function public.set_role_permissions(p_role_id uuid, p_permission_codes text[])
returns text[] language plpgsql security definer set search_path = public as $$
declare role_name text; normalized text[]; unknown_count integer;
begin
  if not public.has_pos_permission('role.edit') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select name into role_name from public.roles where id=p_role_id for update; if not found then raise exception 'ROLE_NOT_FOUND'; end if;
  select coalesce(array_agg(distinct requested.permission_code order by requested.permission_code),array[]::text[]) into normalized
  from unnest(coalesce(p_permission_codes,array[]::text[])) requested(permission_code);
  select count(*) into unknown_count from unnest(normalized) requested(permission_code)
  left join public.permissions p on p.code=requested.permission_code where p.id is null;
  if unknown_count>0 then raise exception 'UNKNOWN_PERMISSION'; end if;
  if role_name='ADMIN' and not (array['role.edit','user.assign_role','settings.manage'] <@ normalized) then raise exception 'ADMIN_CORE_PERMISSIONS_REQUIRED'; end if;
  delete from public.role_permissions where role_id=p_role_id;
  insert into public.role_permissions(role_id,permission_id,granted_by) select p_role_id,id,auth.uid() from public.permissions where code=any(normalized);
  perform public.write_pos_audit('PERMISSION_CHANGED','ROLE',p_role_id,null,jsonb_build_object('role',role_name,'permissions',normalized));
  return normalized;
end;
$$;

create or replace function public.admin_update_staff(p_user_id uuid,p_payload jsonb)
returns public.profiles language plpgsql security definer set search_path = public as $$
declare target public.profiles%rowtype; requested_role text; requested_status text; requested_role_id uuid; requested_branch_id uuid; active_admins integer;
begin
  if not public.has_pos_permission('user.edit') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into target from public.profiles where id=p_user_id for update; if not found then raise exception 'USER_NOT_FOUND'; end if;
  requested_role := upper(coalesce(nullif(btrim(p_payload->>'role'),''),target.role_name));
  requested_status := upper(coalesce(nullif(btrim(p_payload->>'status'),''),target.status));
  if requested_status not in ('ACTIVE','INACTIVE','LOCKED') then raise exception 'INVALID_USER_STATUS'; end if;
  if p_payload ? 'username' and nullif(btrim(p_payload->>'username'),'') is not null and lower(btrim(p_payload->>'username')) !~ '^[a-z0-9._-]{3,50}$' then raise exception 'INVALID_USERNAME'; end if;
  select id into requested_role_id from public.roles where name=requested_role; if not found then raise exception 'INVALID_ROLE'; end if;
  requested_branch_id := coalesce(nullif(p_payload->>'branchId','')::uuid,target.branch_id,(select id from public.branches where code='MAIN'));
  perform 1 from public.branches where id=requested_branch_id and status='ACTIVE'; if not found then raise exception 'INVALID_BRANCH'; end if;
  if requested_role is distinct from target.role_name and not public.has_pos_permission('user.assign_role') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if target.role_name='ADMIN' and target.status='ACTIVE' and (requested_role<>'ADMIN' or requested_status<>'ACTIVE') then
    perform pg_advisory_xact_lock(hashtextextended('active-admin-roster',0));
    select count(*) into active_admins from public.profiles where role_name='ADMIN' and status='ACTIVE';
    if active_admins<=1 then raise exception 'LAST_ACTIVE_ADMIN_REQUIRED'; end if;
  end if;
  perform set_config('app.admin_profile_write','allowed',true);
  update public.profiles set
    name=coalesce(nullif(left(btrim(p_payload->>'name'),150),''),name),
    username=case when p_payload ? 'username' then nullif(left(lower(btrim(p_payload->>'username')),50),'') else username end,
    role_id=requested_role_id, role_name=requested_role, status=requested_status, branch_id=requested_branch_id
  where id=p_user_id returning * into target;
  return target;
end;
$$;

revoke all on function public.save_admin_category(uuid,jsonb), function public.save_admin_product(uuid,jsonb), function public.set_role_permissions(uuid,text[]), function public.admin_update_staff(uuid,jsonb) from public, anon;
grant execute on function public.save_admin_category(uuid,jsonb), function public.save_admin_product(uuid,jsonb), function public.set_role_permissions(uuid,text[]), function public.admin_update_staff(uuid,jsonb) to authenticated;

drop policy if exists admin_full_access_profiles on public.profiles;

drop policy if exists managers_manage_categories on public.categories;
drop policy if exists managers_manage_products on public.products;
drop policy if exists active_staff_read_categories on public.categories;
drop policy if exists active_staff_read_products on public.products;
drop policy if exists admin_full_access_categories on public.categories;
drop policy if exists admin_full_access_products on public.products;
drop policy if exists management_insert_products on public.products;
drop policy if exists management_update_products on public.products;
create policy permitted_catalog_category_read on public.categories for select to authenticated using (
  public.has_pos_permission('category.view') and (status=true or public.has_pos_permission('category.edit') or public.has_pos_permission('category.create'))
);
create policy permitted_catalog_product_read on public.products for select to authenticated using (
  public.has_pos_permission('product.view') and (status=true or public.has_pos_permission('product.edit') or public.has_pos_permission('product.create'))
);

-- Catalog writes are RPC-only so validation and audit cannot be bypassed.
revoke insert, update, delete on public.categories, public.products from authenticated;

drop policy if exists operational_staff_read_tables on public.restaurant_tables;
drop policy if exists admin_full_access_restaurant_tables on public.restaurant_tables;
create policy permitted_staff_read_tables on public.restaurant_tables for select to authenticated using(
  public.has_pos_permission('table.view') and (is_active=true or public.has_pos_permission('table.manage'))
);

drop policy if exists authorized_staff_read_orders on public.orders;
create policy permitted_staff_read_orders on public.orders for select to authenticated using(
  public.has_pos_permission('order.view') and public.can_read_pos_order(id)
);
drop policy if exists authorized_staff_read_order_items on public.order_items;
create policy permitted_staff_read_order_items on public.order_items for select to authenticated using(
  public.has_pos_permission('order.view') and public.can_read_pos_order(order_id)
  and (public.current_pos_role()<>'KITCHEN' or item_status in ('SUBMITTED','PREPARING','READY'))
);
drop policy if exists authorized_staff_read_order_item_options on public.order_item_options;
create policy permitted_staff_read_order_item_options on public.order_item_options for select to authenticated using(
  public.has_pos_permission('order.view') and exists(
    select 1 from public.order_items item where item.id=order_item_id and public.can_read_pos_order(item.order_id)
      and (public.current_pos_role()<>'KITCHEN' or item.item_status in ('SUBMITTED','PREPARING','READY'))
  )
);
drop policy if exists authorized_staff_read_order_history on public.order_status_history;
create policy permitted_staff_read_order_history on public.order_status_history for select to authenticated using(
  public.has_pos_permission('order.view') and public.can_read_pos_order(order_id)
);

drop policy if exists finance_staff_read_payments on public.payments;
create policy permitted_finance_read_payments on public.payments for select to authenticated using(public.has_pos_permission('payment.view'));

create or replace function public.set_product_image_path(p_product_id uuid,p_image_path text)
returns public.products language plpgsql security definer set search_path = public as $$
declare normalized_path text:=nullif(btrim(coalesce(p_image_path,'')),''); product_row public.products%rowtype;
begin
  if not public.has_pos_permission('product.manage_image') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if normalized_path is null and public.current_pos_role()<>'ADMIN' then raise exception 'ADMIN_REQUIRED_TO_DELETE_PRODUCT_IMAGE'; end if;
  select * into product_row from public.products where id=p_product_id for update; if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
  if normalized_path is not null then
    if normalized_path !~ ('^products/'||product_row.product_code||'/[0-9a-f-]{36}\.webp$') then raise exception 'INVALID_PRODUCT_IMAGE_PATH'; end if;
    if not exists(select 1 from storage.objects where bucket_id='product-images' and name=normalized_path) then raise exception 'PRODUCT_IMAGE_OBJECT_NOT_FOUND'; end if;
  end if;
  perform set_config('app.product_image_path_write','allowed',true);
  update public.products set image_path=normalized_path where id=p_product_id returning * into product_row;
  perform public.write_pos_audit(case when normalized_path is null then 'PRODUCT_IMAGE_REMOVED' else 'PRODUCT_IMAGE_CHANGED' end,'PRODUCT',p_product_id,null,jsonb_build_object('imagePath',normalized_path));
  return product_row;
end;
$$;
revoke all on function public.set_product_image_path(uuid,text) from public,anon;
grant execute on function public.set_product_image_path(uuid,text) to authenticated;

drop policy if exists product_images_management_insert on storage.objects;
create policy product_images_permission_insert on storage.objects for insert to authenticated with check(
  bucket_id='product-images' and public.has_pos_permission('product.manage_image') and name~'^products/PRD-[0-9]{6}/[0-9a-f-]{36}\.webp$');
drop policy if exists product_images_controlled_delete on storage.objects;
create policy product_images_permission_delete on storage.objects for delete to authenticated using(
  bucket_id='product-images' and public.has_pos_permission('product.manage_image') and (
    public.current_pos_role()='ADMIN' or not exists(select 1 from public.products where image_path=storage.objects.name)
  )
);

create or replace function public.get_admin_dashboard()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare start_at timestamptz := date_trunc('day',now() at time zone 'Asia/Kuala_Lumpur') at time zone 'Asia/Kuala_Lumpur'; result jsonb;
begin
  if not public.has_pos_permission('dashboard.view') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select jsonb_build_object(
    'todaySales',coalesce((select sum(amount) from public.payments where status='PAID' and coalesce(paid_at,created_at)>=start_at),0),
    'todayOrders',(select count(*) from public.orders where created_at>=start_at),
    'averageOrderValue',coalesce((select avg(total) from public.orders where payment_status='PAID' and created_at>=start_at),0),
    'dineInOrders',(select count(*) from public.orders where created_at>=start_at and dining_mode='dine-in'),
    'takeawayOrders',(select count(*) from public.orders where created_at>=start_at and dining_mode='takeaway'),
    'paymentMethods',coalesce((select jsonb_object_agg(payment_method,total) from (select payment_method,sum(amount) total from public.payments where status='PAID' and coalesce(paid_at,created_at)>=start_at group by payment_method)m),'{}'::jsonb),
    'activeOrders',(select count(*) from public.orders where status not in ('COMPLETED','CANCELLED','REFUNDED')),
    'completedOrders',(select count(*) from public.orders where created_at>=start_at and status='COMPLETED'),
    'cancelledOrders',(select count(*) from public.orders where created_at>=start_at and status='CANCELLED'),
    'topProducts',coalesce((select jsonb_agg(to_jsonb(t)) from (select oi.product_name_snapshot name,sum(oi.quantity) quantity,sum(oi.subtotal) sales from public.order_items oi join public.orders o on o.id=oi.order_id where o.created_at>=start_at and o.status not in ('CANCELLED','REFUNDED') group by oi.product_name_snapshot order by quantity desc limit 5)t),'[]'::jsonb),
    'recentActivities',coalesce((select jsonb_agg(to_jsonb(a)) from (select id,action,entity_type,entity_id,actor_id,created_at from public.audit_logs order by created_at desc limit 8)a),'[]'::jsonb),
    'salesTrend',coalesce((select jsonb_agg(to_jsonb(s) order by day) from (select d::date day,coalesce(sum(p.amount),0) sales from generate_series((start_at-interval '6 day')::date,start_at::date,interval '1 day')d left join public.payments p on coalesce(p.paid_at,p.created_at)::date=d::date and p.status='PAID' group by d)s),'[]'::jsonb),
    'hasInventory',false,'lowStockProducts','[]'::jsonb
  ) into result;
  return result;
end;
$$;
revoke all on function public.get_admin_dashboard() from public,anon;
grant execute on function public.get_admin_dashboard() to authenticated;

commit;
