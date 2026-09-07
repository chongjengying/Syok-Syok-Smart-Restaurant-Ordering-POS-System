begin;

insert into public.permissions(code,module,description) values
  ('order.edit','operations','Edit draft items on an active POS order')
on conflict(code) do update set module=excluded.module,description=excluded.description;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.code='order.edit'
where r.name in ('ADMIN','MANAGER','WAITER','CASHIER') on conflict do nothing;

-- Products/categories are company master data. Branch-specific commercial
-- state lives in branch_products instead of duplicating product rows.
alter table public.categories add column if not exists company_id uuid references public.companies(id) on delete restrict;
alter table public.products add column if not exists company_id uuid references public.companies(id) on delete restrict;
update public.categories c set company_id=coalesce((select b.company_id from public.branches b where b.id=c.branch_id),(select id from public.companies where code='SYOK')) where c.company_id is null;
update public.products p set company_id=coalesce((select b.company_id from public.branches b where b.id=p.branch_id),(select c.company_id from public.categories c where c.id=p.category_id),(select id from public.companies where code='SYOK')) where p.company_id is null;
do $$ begin
 if exists(select 1 from public.categories where company_id is null) or exists(select 1 from public.products where company_id is null) then
  raise exception 'CATALOG_COMPANY_BACKFILL_REQUIRED';
 end if;
end $$;
alter table public.categories alter column company_id set not null;
alter table public.products alter column company_id set not null;

create table if not exists public.branch_products(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  selling_enabled boolean not null default true,
  available boolean not null default true,
  sold_out boolean not null default false,
  price_override numeric(12,2) check(price_override is null or price_override>=0),
  tax_enabled_override boolean,
  tax_name_override varchar(40),
  tax_rate_override numeric(7,4) check(tax_rate_override is null or tax_rate_override between 0 and 100),
  service_charge_enabled_override boolean,
  service_charge_rate_override numeric(7,4) check(service_charge_rate_override is null or service_charge_rate_override between 0 and 100),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(branch_id,product_id)
);
insert into public.branch_products(company_id,branch_id,product_id,available,sold_out)
select b.company_id,b.id,p.id,true,not p.is_available
from public.branches b join public.products p on p.company_id=b.company_id
on conflict(branch_id,product_id) do nothing;

create table if not exists public.branch_product_options(
  branch_id uuid not null references public.branches(id) on delete cascade,
  product_option_id uuid not null references public.product_options(id) on delete cascade,
  available boolean not null default true,
  sold_out boolean not null default false,
  price_override numeric(12,2) check(price_override is null or price_override>=0),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key(branch_id,product_option_id)
);
create index if not exists branch_products_menu_idx on public.branch_products(branch_id,selling_enabled,available,sold_out,product_id);

create or replace function public.validate_branch_catalog_context() returns trigger language plpgsql security definer set search_path=public as $$
declare branch_company uuid;product_company uuid;
begin
 select company_id into branch_company from public.branches where id=new.branch_id;
 if tg_table_name='branch_products' then select company_id into product_company from public.products where id=new.product_id;
 else select p.company_id into product_company from public.product_options o join public.product_option_groups g on g.id=o.option_group_id join public.products p on p.id=g.product_id where o.id=new.product_option_id;end if;
 if branch_company is null or product_company is null or branch_company<>product_company then raise exception 'CATALOG_COMPANY_MISMATCH';end if;
 if tg_table_name='branch_products' then new.company_id:=branch_company;end if;return new;
end $$;
drop trigger if exists a_branch_product_context on public.branch_products;
create trigger a_branch_product_context before insert or update on public.branch_products for each row execute function public.validate_branch_catalog_context();
drop trigger if exists a_branch_option_context on public.branch_product_options;
create trigger a_branch_option_context before insert or update on public.branch_product_options for each row execute function public.validate_branch_catalog_context();

create or replace function public.assign_catalog_company_context() returns trigger
language plpgsql security definer set search_path=public as $$
declare resolved_company uuid;
begin
  if tg_table_name='categories' then
    resolved_company:=coalesce((select company_id from public.branches where id=new.branch_id),public.current_user_company_id());
  else
    select company_id into resolved_company from public.categories where id=new.category_id;
  end if;
  if resolved_company is null then raise exception 'COMPANY_CONTEXT_REQUIRED'; end if;
  if new.company_id is not null and new.company_id<>resolved_company then raise exception 'COMPANY_CONTEXT_MISMATCH'; end if;
  new.company_id:=resolved_company; return new;
end $$;
drop trigger if exists a_category_company_context on public.categories;
create trigger a_category_company_context before insert or update of company_id,branch_id on public.categories for each row execute function public.assign_catalog_company_context();
drop trigger if exists a_product_company_context on public.products;
create trigger a_product_company_context before insert or update of company_id,category_id on public.products for each row execute function public.assign_catalog_company_context();

create or replace function public.provision_product_to_company_branches() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.branch_products(company_id,branch_id,product_id)
  select new.company_id,b.id,new.id from public.branches b where b.company_id=new.company_id
  on conflict(branch_id,product_id) do nothing; return new;
end $$;
drop trigger if exists product_branch_provisioning on public.products;
create trigger product_branch_provisioning after insert on public.products for each row execute function public.provision_product_to_company_branches();
create or replace function public.route_legacy_product_availability() returns trigger language plpgsql security definer set search_path=public as $$
declare target_branch uuid;
begin
 if old.is_available is distinct from new.is_available then
  target_branch:=coalesce((public.current_terminal_staff_session()).branch_id,(select branch_id from public.profiles where id=auth.uid()),new.branch_id);
  update public.branch_products set sold_out=not new.is_available,updated_by=auth.uid(),updated_at=now() where branch_id=target_branch and product_id=new.id;
 end if;return new;
end $$;
drop trigger if exists product_legacy_availability_route on public.products;
create trigger product_legacy_availability_route after update of is_available on public.products for each row execute function public.route_legacy_product_availability();

alter table public.branch_products enable row level security;
alter table public.branch_product_options enable row level security;
create policy branch_product_read on public.branch_products for select to authenticated using(public.can_access_branch(branch_id));
create policy branch_product_manage on public.branch_products for all to authenticated
  using(public.can_access_branch(branch_id) and public.has_pos_permission('product.edit'))
  with check(public.can_access_branch(branch_id) and company_id=public.current_user_company_id() and public.has_pos_permission('product.edit'));
create policy branch_option_read on public.branch_product_options for select to authenticated using(public.can_access_branch(branch_id));
create policy branch_option_manage on public.branch_product_options for all to authenticated
  using(public.can_access_branch(branch_id) and public.has_pos_permission('product.edit'))
  with check(public.can_access_branch(branch_id) and public.has_pos_permission('product.edit'));
grant select on public.branch_products,public.branch_product_options to authenticated;
grant all on public.branch_products,public.branch_product_options to service_role;
create policy product_company_scope on public.products as restrictive for all to authenticated using(company_id=public.current_user_company_id()) with check(company_id=public.current_user_company_id());
create policy category_company_scope on public.categories as restrictive for all to authenticated using(company_id=public.current_user_company_id()) with check(company_id=public.current_user_company_id());
create policy option_group_company_scope on public.product_option_groups as restrictive for all to authenticated
 using(exists(select 1 from public.products p where p.id=product_id and p.company_id=public.current_user_company_id()))
 with check(exists(select 1 from public.products p where p.id=product_id and p.company_id=public.current_user_company_id()));
create policy option_company_scope on public.product_options as restrictive for all to authenticated
 using(exists(select 1 from public.product_option_groups g join public.products p on p.id=g.product_id where g.id=option_group_id and p.company_id=public.current_user_company_id()))
 with check(exists(select 1 from public.product_option_groups g join public.products p on p.id=g.product_id where g.id=option_group_id and p.company_id=public.current_user_company_id()));

create or replace function public.save_branch_product(p_product_id uuid,p_branch_id uuid,p_patch jsonb)
returns public.branch_products language plpgsql security definer set search_path=public as $$
declare old_row public.branch_products; result public.branch_products;
begin
  if not public.has_pos_permission('product.edit') or not public.can_access_branch(p_branch_id) then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into old_row from public.branch_products where branch_id=p_branch_id and product_id=p_product_id for update;
  if not found then raise exception 'BRANCH_PRODUCT_NOT_FOUND'; end if;
  update public.branch_products set
    selling_enabled=coalesce((p_patch->>'sellingEnabled')::boolean,selling_enabled),
    available=coalesce((p_patch->>'available')::boolean,available), sold_out=coalesce((p_patch->>'soldOut')::boolean,sold_out),
    price_override=case when p_patch?'priceOverride' then nullif(p_patch->>'priceOverride','')::numeric else price_override end,
    tax_enabled_override=case when p_patch?'taxEnabledOverride' then nullif(p_patch->>'taxEnabledOverride','')::boolean else tax_enabled_override end,
    tax_name_override=case when p_patch?'taxNameOverride' then nullif(trim(p_patch->>'taxNameOverride'),'') else tax_name_override end,
    tax_rate_override=case when p_patch?'taxRateOverride' then nullif(p_patch->>'taxRateOverride','')::numeric else tax_rate_override end,
    service_charge_enabled_override=case when p_patch?'serviceChargeEnabledOverride' then nullif(p_patch->>'serviceChargeEnabledOverride','')::boolean else service_charge_enabled_override end,
    service_charge_rate_override=case when p_patch?'serviceChargeRateOverride' then nullif(p_patch->>'serviceChargeRateOverride','')::numeric else service_charge_rate_override end,
    updated_by=auth.uid(),updated_at=now() where id=old_row.id returning * into result;
  perform public.write_pos_audit('BRANCH_PRODUCT_UPDATED','BRANCH_PRODUCT',result.id,null,
    jsonb_build_object('branchId',p_branch_id,'productId',p_product_id,'priceChanged',old_row.price_override is distinct from result.price_override,'availabilityChanged',(old_row.available,old_row.sold_out,old_row.selling_enabled) is distinct from (result.available,result.sold_out,result.selling_enabled)));
  return result;
end $$;

create or replace function public.save_branch_product_option(p_product_option_id uuid,p_branch_id uuid,p_patch jsonb)
returns public.branch_product_options language plpgsql security definer set search_path=public as $$
declare old_row public.branch_product_options;result public.branch_product_options;
begin
 if not public.has_pos_permission('product.edit') or not public.can_access_branch(p_branch_id) then raise exception 'INSUFFICIENT_PERMISSION';end if;
 insert into public.branch_product_options(branch_id,product_option_id,available,sold_out,price_override,updated_by)
 values(p_branch_id,p_product_option_id,coalesce((p_patch->>'available')::boolean,true),coalesce((p_patch->>'soldOut')::boolean,false),nullif(p_patch->>'priceOverride','')::numeric,auth.uid())
 on conflict(branch_id,product_option_id) do update set
  available=case when p_patch?'available' then (p_patch->>'available')::boolean else public.branch_product_options.available end,
  sold_out=case when p_patch?'soldOut' then (p_patch->>'soldOut')::boolean else public.branch_product_options.sold_out end,
  price_override=case when p_patch?'priceOverride' then nullif(p_patch->>'priceOverride','')::numeric else public.branch_product_options.price_override end,
  updated_by=auth.uid(),updated_at=now()
 returning * into result;
 perform public.write_pos_audit('BRANCH_PRODUCT_OPTION_UPDATED','BRANCH_PRODUCT_OPTION',result.product_option_id,null,jsonb_build_object('branchId',p_branch_id,'available',result.available,'soldOut',result.sold_out,'priceOverride',result.price_override));
 return result;
end $$;

create or replace function public.branch_modifier_configuration_valid(p_product_id uuid,p_branch_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select not exists(
  select 1 from public.product_option_groups g
  where g.product_id=p_product_id and (
   greatest(g.min_selection,case when g.is_required then 1 else 0 end) > (
    select count(*) from public.product_options o
    left join public.branch_product_options bpo on bpo.product_option_id=o.id and bpo.branch_id=p_branch_id
    where o.option_group_id=g.id and o.is_available and coalesce(bpo.available,true) and not coalesce(bpo.sold_out,false)
   )
   or g.max_selection<g.min_selection
   or (g.selection_type='SINGLE' and g.max_selection<>1)
  )
 )
$$;
revoke all on function public.branch_modifier_configuration_valid(uuid,uuid) from public,anon,authenticated;

-- Both menu display and order-item creation use this resolver.
create or replace function public.resolve_branch_product(p_product_id uuid,p_branch_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare p public.products; c public.categories; bp public.branch_products; b public.branches; cfg jsonb; resolved_price numeric;
begin
  select * into b from public.branches where id=p_branch_id and status='ACTIVE'; if not found then raise exception 'BRANCH_INACTIVE'; end if;
  select * into p from public.products where id=p_product_id and company_id=b.company_id and status=true;
  if not found then raise exception 'PRODUCT_NOT_AVAILABLE'; end if;
  select * into c from public.categories where id=p.category_id and company_id=b.company_id and status=true;
  if not found then raise exception 'CATEGORY_NOT_AVAILABLE'; end if;
  select * into bp from public.branch_products where branch_id=b.id and product_id=p.id;
  if not found or not bp.selling_enabled or not bp.available then raise exception 'PRODUCT_NOT_AVAILABLE_AT_BRANCH'; end if;
  if bp.sold_out then raise exception 'PRODUCT_SOLD_OUT'; end if;
  resolved_price:=coalesce(bp.price_override,p.sell_price);
  if resolved_price is null or resolved_price<0 then raise exception 'INVALID_BRANCH_PRICE'; end if;
  if not public.branch_modifier_configuration_valid(p.id,b.id) then raise exception 'INVALID_MODIFIER_CONFIGURATION';end if;
  cfg:=public.effective_branch_settings(b.id);
  return jsonb_build_object('productId',p.id,'productCode',p.product_code,'productName',p.product_name,'categoryId',c.id,'categoryName',c.name,
    'price',round(resolved_price,2),'priceSource',case when bp.price_override is null then 'COMPANY_DEFAULT' else 'BRANCH_OVERRIDE' end,
    'taxEnabled',coalesce(bp.tax_enabled_override,(cfg->>'tax_enabled')::boolean,true),'taxName',coalesce(bp.tax_name_override,cfg->>'tax_name','SST'),
    'taxRate',case when coalesce(bp.tax_enabled_override,(cfg->>'tax_enabled')::boolean,true) then coalesce(bp.tax_rate_override,(cfg->>'tax_rate')::numeric,0) else 0 end,
    'taxMode',coalesce(cfg->>'tax_mode','EXCLUSIVE'),'serviceChargeEnabled',coalesce(bp.service_charge_enabled_override,(cfg->>'service_charge_enabled')::boolean,true),'serviceChargeOverridden',bp.service_charge_enabled_override is not null or bp.service_charge_rate_override is not null,
    'serviceChargeRate',case when coalesce(bp.service_charge_enabled_override,(cfg->>'service_charge_enabled')::boolean,true) then coalesce(bp.service_charge_rate_override,(cfg->>'service_charge_rate')::numeric,0) else 0 end);
end $$;
revoke all on function public.resolve_branch_product(uuid,uuid) from public,anon,authenticated;

create or replace function public.get_current_branch_menu(p_category_id uuid default null,p_search text default null,p_limit integer default 100,p_offset integer default 0,p_product_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare s public.terminal_staff_sessions; rows jsonb; total bigint; safe_search text:=replace(replace(trim(coalesce(p_search,'')),'%',''),'_','');
begin
  s:=public.require_terminal_staff_session(); if not public.has_pos_permission('product.view') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if p_limit not between 1 and 200 or p_offset not between 0 and 10000 then raise exception 'INVALID_PAGINATION'; end if;
  select count(*) into total from public.products p join public.categories c on c.id=p.category_id and c.status=true
    join public.branch_products bp on bp.product_id=p.id and bp.branch_id=s.branch_id
    where p.company_id=s.company_id and p.status=true and bp.selling_enabled and bp.available
      and coalesce(bp.price_override,p.sell_price) is not null and coalesce(bp.price_override,p.sell_price)>=0
      and public.branch_modifier_configuration_valid(p.id,s.branch_id)
      and (p_category_id is null or p.category_id=p_category_id) and (p_product_id is null or p.id=p_product_id)
      and (safe_search='' or p.product_name ilike '%'||safe_search||'%' or p.product_code ilike '%'||safe_search||'%');
  select coalesce(jsonb_agg(item order by item->>'name'),'[]') into rows from (
    select jsonb_build_object('id',p.id,'code',p.product_code,'categoryId',c.id,'categoryName',c.name,'name',p.product_name,'description',coalesce(p.description,''),'unit',coalesce(p.unit,''),
      'price',round(coalesce(bp.price_override,p.sell_price),2),'priceSource',case when bp.price_override is null then 'COMPANY_DEFAULT' else 'BRANCH_OVERRIDE' end,
      'isActive',true,'isAvailable',not bp.sold_out,'soldOut',bp.sold_out,'imagePath',p.image_path,
      'optionGroups',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'selectionType',g.selection_type,'isRequired',g.is_required,'minSelection',g.min_selection,'maxSelection',g.max_selection,'sortOrder',g.sort_order,
        'options',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'priceAdjustment',round(coalesce(bpo.price_override,o.price_adjustment),2),'isAvailable',true) order by o.sort_order)
          from public.product_options o left join public.branch_product_options bpo on bpo.product_option_id=o.id and bpo.branch_id=s.branch_id where o.option_group_id=g.id and o.is_available and coalesce(bpo.available,true) and not coalesce(bpo.sold_out,false)),'[]')) order by g.sort_order)
        from public.product_option_groups g where g.product_id=p.id),'[]')) item
    from public.products p join public.categories c on c.id=p.category_id and c.status=true join public.branch_products bp on bp.product_id=p.id and bp.branch_id=s.branch_id
    where p.company_id=s.company_id and p.status=true and bp.selling_enabled and bp.available
      and coalesce(bp.price_override,p.sell_price) is not null and coalesce(bp.price_override,p.sell_price)>=0
      and public.branch_modifier_configuration_valid(p.id,s.branch_id)
      and (p_category_id is null or p.category_id=p_category_id) and (p_product_id is null or p.id=p_product_id)
      and (safe_search='' or p.product_name ilike '%'||safe_search||'%' or p.product_code ilike '%'||safe_search||'%')
    order by p.product_name limit p_limit offset p_offset
  ) q;
  return jsonb_build_object('products',rows,'pagination',jsonb_build_object('total',total,'limit',p_limit,'offset',p_offset),'branchId',s.branch_id);
end $$;

create or replace function public.get_current_branch_menu_categories()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare s public.terminal_staff_sessions;
begin
  s:=public.require_terminal_staff_session(); if not public.has_pos_permission('category.view') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'code',c.category_code,'name',c.name,'description',coalesce(c.description,''),'displayOrder',c.display_order) order by c.display_order,c.name)
    from public.categories c where c.company_id=s.company_id and c.status=true and exists(select 1 from public.products p join public.branch_products bp on bp.product_id=p.id and bp.branch_id=s.branch_id where p.category_id=c.id and p.status=true and bp.selling_enabled and bp.available and coalesce(bp.price_override,p.sell_price) is not null and coalesce(bp.price_override,p.sell_price)>=0 and public.branch_modifier_configuration_valid(p.id,s.branch_id))),'[]');
end $$;
revoke all on function public.get_current_branch_menu(uuid,text,integer,integer,uuid),public.get_current_branch_menu_categories(),public.save_branch_product(uuid,uuid,jsonb),public.save_branch_product_option(uuid,uuid,jsonb) from public,anon;
grant execute on function public.get_current_branch_menu(uuid,text,integer,integer,uuid),public.get_current_branch_menu_categories(),public.save_branch_product(uuid,uuid,jsonb),public.save_branch_product_option(uuid,uuid,jsonb) to authenticated;

-- Transaction snapshots. Existing unit_price remains base+modifier per unit so
-- kitchen/payment/report compatibility is preserved.
alter table public.order_items
  add column if not exists product_code_snapshot text,
  add column if not exists base_unit_price numeric(12,2),
  add column if not exists modifier_total numeric(12,2) not null default 0,
  add column if not exists gross_amount numeric(12,2),
  add column if not exists discount_amount numeric(12,2) not null default 0,
  add column if not exists tax_name_snapshot text,
  add column if not exists tax_rate numeric(7,4) not null default 0,
  add column if not exists tax_mode_snapshot text not null default 'EXCLUSIVE' check(tax_mode_snapshot in ('INCLUSIVE','EXCLUSIVE')),
  add column if not exists tax_amount numeric(12,2) not null default 0,
  add column if not exists service_charge_rate numeric(7,4) not null default 0,
  add column if not exists service_charge_amount numeric(12,2) not null default 0,
  add column if not exists line_subtotal numeric(12,2),
  add column if not exists line_total numeric(12,2),
  add column if not exists created_by_staff_id uuid references public.profiles(id) on delete restrict,
  add column if not exists pricing_source text,
  add column if not exists price_snapshot_at timestamptz;
alter table public.order_item_options add column if not exists unit_price numeric(12,2),add column if not exists quantity integer not null default 1,add column if not exists total_price numeric(12,2);
update public.order_items oi set product_code_snapshot=p.product_code,base_unit_price=oi.unit_price,modifier_total=0,gross_amount=oi.subtotal,line_subtotal=oi.subtotal,line_total=oi.subtotal,tax_name_snapshot=o.tax_name,tax_rate=o.tax_rate,tax_mode_snapshot=o.tax_mode,service_charge_rate=o.service_charge_rate,
  created_by_staff_id=o.created_by_staff_id,pricing_source='LEGACY_SNAPSHOT',price_snapshot_at=oi.created_at
from public.products p,public.orders o where p.id=oi.product_id and o.id=oi.order_id and oi.price_snapshot_at is null;
update public.order_item_options set unit_price=price_adjustment,total_price=price_adjustment*quantity where unit_price is null or total_price is null;

-- Order-level financial configuration is resolved once from the trusted branch
-- at INSERT; subsequent recalculation uses that immutable snapshot.
create or replace function public.apply_order_financial_configuration() returns trigger language plpgsql security definer set search_path=public as $$
declare cfg jsonb;raw_total numeric(12,4);rounded_total numeric(12,2);increment numeric;base numeric(12,2);has_lines boolean;
begin
 if tg_op='INSERT' then
  cfg:=public.effective_branch_settings(new.branch_id); new.tax_name:=coalesce(cfg->>'tax_name','SST');
  new.tax_rate:=case when coalesce((cfg->>'tax_enabled')::boolean,true) then coalesce((cfg->>'tax_rate')::numeric,0) else 0 end;
  new.tax_mode:=coalesce(cfg->>'tax_mode','EXCLUSIVE');new.service_charge_name:=coalesce(cfg->>'service_charge_name','Service Charge');
  new.service_charge_rate:=case when coalesce((cfg->>'service_charge_enabled')::boolean,true) and upper(replace(new.dining_mode,'-','_'))=any(coalesce(array(select jsonb_array_elements_text(cfg->'service_charge_order_types')),array['DINE_IN'])) then coalesce((cfg->>'service_charge_rate')::numeric,0) else 0 end;
  new.currency_code:=coalesce((select currency_code from public.branches where id=new.branch_id),(select currency_code from public.companies where id=new.company_id),'MYR');
 end if;
 if tg_op='INSERT' or new.subtotal is distinct from old.subtotal or new.discount is distinct from old.discount or new.tax is distinct from old.tax or new.service_charge is distinct from old.service_charge or new.total is distinct from old.total then
  base:=greatest(new.subtotal-coalesce(new.discount,0),0);
  select exists(select 1 from public.order_items where order_id=new.id and item_status<>'VOIDED') into has_lines;
  if has_lines then
   update public.order_items set discount_amount=case when new.subtotal>0 then round(new.discount*line_subtotal/new.subtotal,2) else 0 end where order_id=new.id and item_status<>'VOIDED';
   update public.order_items set
    tax_amount=round(case when tax_mode_snapshot='INCLUSIVE' then greatest(line_subtotal-discount_amount,0)*tax_rate/(100+tax_rate) else greatest(line_subtotal-discount_amount,0)*tax_rate/100 end,2),
    service_charge_amount=round(greatest(line_subtotal-discount_amount,0)*service_charge_rate/100,2),
    line_total=round(greatest(line_subtotal-discount_amount,0)+case when tax_mode_snapshot='EXCLUSIVE' then greatest(line_subtotal-discount_amount,0)*tax_rate/100 else 0 end+greatest(line_subtotal-discount_amount,0)*service_charge_rate/100,2)
   where order_id=new.id and item_status<>'VOIDED';
   select coalesce(sum(tax_amount),0),coalesce(sum(service_charge_amount),0) into new.tax,new.service_charge from public.order_items where order_id=new.id and item_status<>'VOIDED';
  else
   if new.tax_mode='INCLUSIVE' then new.tax:=round(base*new.tax_rate/(100+new.tax_rate),2);else new.tax:=round(base*new.tax_rate/100,2);end if;
   new.service_charge:=round(base*new.service_charge_rate/100,2);
  end if;
  raw_total:=base+coalesce((select sum(case when tax_mode_snapshot='EXCLUSIVE' then tax_amount else 0 end) from public.order_items where order_id=new.id and item_status<>'VOIDED'),case when new.tax_mode='EXCLUSIVE' then new.tax else 0 end)+new.service_charge;
  cfg:=public.effective_branch_settings(new.branch_id);increment:=case coalesce(cfg->>'rounding_rule','NONE') when '0.05' then .05 when '0.10' then .10 else .01 end;
  rounded_total:=round(raw_total/increment)*increment;new.rounding:=round(rounded_total-raw_total,2);new.total:=round(rounded_total,2);
 end if;return new;
end $$;

create or replace function public.replace_pos_draft_items(p_order_id uuid,p_items jsonb,p_expected_version bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.terminal_staff_sessions;ord public.orders;item jsonb;resolved jsonb;new_item public.order_items;ids jsonb;option_total numeric(12,2);base_price numeric(12,2);unit numeric(12,2);qty int;
 selected_count int;distinct_count int;group_count int;grp record;mode text;created_ids uuid[]:='{}';existing_item public.order_items;requested_id uuid;tax_amount numeric(12,2);service_amount numeric(12,2);
begin
 s:=public.require_terminal_staff_session();if not public.has_pos_permission('order.edit') then raise exception 'INSUFFICIENT_PERMISSION';end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>100 then raise exception 'INVALID_ORDER_ITEMS';end if;
 if p_expected_version is null or p_expected_version<0 then raise exception 'DRAFT_VERSION_REQUIRED';end if;
 select * into ord from public.orders where id=p_order_id for update;if not found then raise exception 'ORDER_NOT_FOUND';end if;
 if ord.company_id<>s.company_id or ord.branch_id<>s.branch_id then raise exception 'ORDER_BRANCH_MISMATCH';end if;
 if ord.draft_version<>p_expected_version then raise exception 'STALE_DRAFT_VERSION';end if;
 if ord.status not in ('DRAFT','CONFIRMED','PREPARING','READY','SERVED') then raise exception 'ORDER_NOT_EDITABLE';end if;
 if ord.payment_status not in ('PENDING','UNPAID') then raise exception 'ORDER_ALREADY_PAID';end if;
 for item in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(item)<>'object' or coalesce(item->>'quantity','')!~'^[0-9]+$' or (item->>'quantity')::int not between 1 and 99 then raise exception 'INVALID_ITEM_QUANTITY';end if;qty:=(item->>'quantity')::int;
  begin requested_id:=nullif(item->>'orderItemId','')::uuid;exception when invalid_text_representation then raise exception 'INVALID_ORDER_ITEM_ID';end;
  existing_item:=null;if requested_id is not null then select * into existing_item from public.order_items where id=requested_id and order_id=ord.id and item_status='DRAFT' for update;end if;
  ids:=coalesce(item->'optionIds','[]');if jsonb_typeof(ids)<>'array' then raise exception 'INVALID_OPTION_IDS';end if;
  -- An unchanged persisted line keeps its commercial snapshot. Availability is
  -- rechecked only when quantity increases or configuration changes.
  if existing_item.id is not null and existing_item.product_id::text=item->>'productId'
    and (select coalesce(jsonb_agg(product_option_id::text order by product_option_id::text),'[]') from public.order_item_options where order_item_id=existing_item.id)
      =(select coalesce(jsonb_agg(value order by value),'[]') from jsonb_array_elements_text(ids)) then
    if qty>existing_item.quantity then perform public.resolve_branch_product(existing_item.product_id,ord.branch_id);end if;
    mode:=upper(coalesce(item->>'serviceMode',existing_item.service_mode));if mode not in('DINE_IN','TAKEAWAY') or (ord.dining_mode='takeaway' and mode<>'TAKEAWAY') then raise exception 'INVALID_SERVICE_MODE';end if;
    update public.order_items set quantity=qty,special_request=nullif(left(item->>'specialRequest',1000),''),service_mode=mode,
      gross_amount=round(unit_price*qty,2),subtotal=round(unit_price*qty,2),line_subtotal=round(unit_price*qty,2),
      tax_amount=round(case when tax_mode_snapshot='INCLUSIVE' then unit_price*qty*tax_rate/(100+tax_rate) else unit_price*qty*tax_rate/100 end,2),
      service_charge_amount=round(unit_price*qty*service_charge_rate/100,2),
      line_total=round(unit_price*qty+case when tax_mode_snapshot='EXCLUSIVE' then unit_price*qty*tax_rate/100 else 0 end+unit_price*qty*service_charge_rate/100,2)
    where id=existing_item.id returning * into new_item;
    update public.order_item_options set quantity=qty,total_price=round(unit_price*qty,2) where order_item_id=new_item.id;
    if existing_item.quantity<>qty or existing_item.special_request is distinct from new_item.special_request or existing_item.service_mode<>new_item.service_mode then
      perform public.write_pos_audit('ORDER_ITEM_UPDATED','ORDER_ITEM',new_item.id,null,jsonb_build_object('orderId',ord.id,'quantityFrom',existing_item.quantity,'quantityTo',qty));
    end if;
    created_ids:=array_append(created_ids,new_item.id);continue;
  end if;
  resolved:=public.resolve_branch_product((item->>'productId')::uuid,ord.branch_id);base_price:=(resolved->>'price')::numeric;
  select count(*),count(distinct x.id),coalesce(sum(coalesce(bpo.price_override,po.price_adjustment)),0) into selected_count,distinct_count,option_total
    from jsonb_array_elements_text(ids)x(id) join public.product_options po on po.id::text=x.id and po.is_available
    join public.product_option_groups pog on pog.id=po.option_group_id and pog.product_id=(resolved->>'productId')::uuid
    left join public.branch_product_options bpo on bpo.product_option_id=po.id and bpo.branch_id=ord.branch_id
    where coalesce(bpo.available,true) and not coalesce(bpo.sold_out,false);
  if selected_count<>jsonb_array_length(ids) or distinct_count<>selected_count then raise exception 'OPTION_NOT_AVAILABLE';end if;
  for grp in select * from public.product_option_groups where product_id=(resolved->>'productId')::uuid loop
    select count(*) into group_count from jsonb_array_elements_text(ids)x(id) join public.product_options po on po.id::text=x.id where po.option_group_id=grp.id;
    if group_count<grp.min_selection or group_count>grp.max_selection or (grp.is_required and group_count=0) then raise exception 'INVALID_OPTION_SELECTION_COUNT';end if;
  end loop;
  mode:=upper(coalesce(item->>'serviceMode',case when ord.dining_mode='takeaway' then 'TAKEAWAY' else 'DINE_IN' end));if mode not in('DINE_IN','TAKEAWAY') or (ord.dining_mode='takeaway' and mode<>'TAKEAWAY') then raise exception 'INVALID_SERVICE_MODE';end if;
  unit:=round(base_price+option_total,2);tax_amount:=round(case when resolved->>'taxMode'='INCLUSIVE' then unit*qty*(resolved->>'taxRate')::numeric/(100+(resolved->>'taxRate')::numeric) else unit*qty*(resolved->>'taxRate')::numeric/100 end,2);service_amount:=round(unit*qty*case when (resolved->>'serviceChargeOverridden')::boolean then (resolved->>'serviceChargeRate')::numeric else ord.service_charge_rate end/100,2);
  insert into public.order_items(order_id,product_id,quantity,base_unit_price,modifier_total,unit_price,gross_amount,discount_amount,subtotal,line_subtotal,tax_name_snapshot,tax_rate,tax_mode_snapshot,tax_amount,service_charge_rate,service_charge_amount,line_total,product_code_snapshot,product_name_snapshot,created_by_staff_id,pricing_source,price_snapshot_at,special_request,sent_at,service_mode,item_status)
  values(ord.id,(resolved->>'productId')::uuid,qty,base_price,option_total,unit,round(unit*qty,2),0,round(unit*qty,2),round(unit*qty,2),resolved->>'taxName',(resolved->>'taxRate')::numeric,resolved->>'taxMode',tax_amount,case when (resolved->>'serviceChargeOverridden')::boolean then (resolved->>'serviceChargeRate')::numeric else ord.service_charge_rate end,service_amount,round(unit*qty+case when resolved->>'taxMode'='EXCLUSIVE' then tax_amount else 0 end+service_amount,2),resolved->>'productCode',resolved->>'productName',s.staff_id,resolved->>'priceSource',now(),nullif(left(item->>'specialRequest',1000),''),null,mode,'DRAFT') returning * into new_item;
  insert into public.order_item_options(order_item_id,product_option_id,option_group_name,option_name,price_adjustment,unit_price,quantity,total_price)
    select new_item.id,po.id,pog.name,po.name,coalesce(bpo.price_override,po.price_adjustment),coalesce(bpo.price_override,po.price_adjustment),qty,round(coalesce(bpo.price_override,po.price_adjustment)*qty,2)
    from jsonb_array_elements_text(ids)x(id) join public.product_options po on po.id::text=x.id join public.product_option_groups pog on pog.id=po.option_group_id left join public.branch_product_options bpo on bpo.product_option_id=po.id and bpo.branch_id=ord.branch_id;
  created_ids:=array_append(created_ids,new_item.id);perform public.write_pos_audit('ORDER_ITEM_ADDED','ORDER_ITEM',new_item.id,null,jsonb_build_object('orderId',ord.id,'productId',new_item.product_id,'quantity',qty,'unitPrice',unit));
 end loop;
 for existing_item in select * from public.order_items where order_id=ord.id and item_status='DRAFT' and not(id=any(created_ids)) loop
   perform public.write_pos_audit('ORDER_ITEM_REMOVED','ORDER_ITEM',existing_item.id,null,jsonb_build_object('orderId',ord.id,'productId',existing_item.product_id,'quantity',existing_item.quantity));
 end loop;
 delete from public.order_items where order_id=ord.id and item_status='DRAFT' and not(id=any(created_ids));
 ord:=public.recalculate_pos_order(ord.id);update public.orders set draft_version=draft_version+1 where id=ord.id returning * into ord;
 return jsonb_build_object('id',ord.id,'subtotal',ord.subtotal,'discount',ord.discount,'tax',ord.tax,'service_charge',ord.service_charge,'total',ord.total,'status',ord.status,'draft_version',ord.draft_version);
end $$;
revoke all on function public.replace_pos_draft_items(uuid,jsonb,bigint) from public,anon;grant execute on function public.replace_pos_draft_items(uuid,jsonb,bigint) to authenticated;

-- Submission revalidates current branch eligibility and modifier rules, but it
-- never rewrites the commercial snapshot captured when the line was added.
create or replace function public.submit_pos_order(p_order_id uuid,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.terminal_staff_sessions;key text;ord public.orders;prior public.order_submissions;submitted uuid[];draft_item record;grp record;group_count int;new_batch public.order_item_batches;
begin
 s:=public.require_terminal_staff_session();if not public.has_pos_permission('order.edit') then raise exception 'INSUFFICIENT_PERMISSION';end if;
 key:=nullif(left(trim(coalesce(p_idempotency_key,'')),128),'');if key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended(s.staff_id::text||':'||key,0));
 select * into prior from public.order_submissions where user_id=s.staff_id and idempotency_key=key;
 if found then
  if prior.order_id<>p_order_id then raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST';end if;
  select * into ord from public.orders where id=p_order_id;select * into new_batch from public.order_item_batches where user_id=s.staff_id and idempotency_key=key;
  return jsonb_build_object('id',ord.id,'status',ord.status,'submittedItemIds',prior.submitted_item_ids,'batchId',new_batch.id,'batchNo',new_batch.batch_no);
 end if;
 select * into ord from public.orders where id=p_order_id for update;if not found then raise exception 'ORDER_NOT_FOUND';end if;
 if ord.company_id<>s.company_id or ord.branch_id<>s.branch_id then raise exception 'ORDER_BRANCH_MISMATCH';end if;
 if ord.payment_status<>'UNPAID' then raise exception 'ORDER_ALREADY_PAID';end if;
 if ord.status not in('DRAFT','CONFIRMED','PREPARING','READY','SERVED') then raise exception 'ORDER_NOT_EDITABLE';end if;
 for draft_item in select * from public.order_items where order_id=ord.id and item_status='DRAFT' for update loop
  perform public.resolve_branch_product(draft_item.product_id,ord.branch_id);
  if exists(select 1 from public.order_item_options oio join public.product_options po on po.id=oio.product_option_id
    left join public.branch_product_options bpo on bpo.product_option_id=po.id and bpo.branch_id=ord.branch_id
    where oio.order_item_id=draft_item.id and (not po.is_available or not coalesce(bpo.available,true) or coalesce(bpo.sold_out,false))) then raise exception 'OPTION_NOT_AVAILABLE';end if;
  for grp in select * from public.product_option_groups where product_id=draft_item.product_id loop
   select count(*) into group_count from public.order_item_options oio join public.product_options po on po.id=oio.product_option_id where oio.order_item_id=draft_item.id and po.option_group_id=grp.id;
   if group_count<grp.min_selection or group_count>grp.max_selection or (grp.is_required and group_count=0) then raise exception 'INVALID_OPTION_SELECTION_COUNT';end if;
  end loop;
 end loop;
 select array_agg(id order by created_at) into submitted from public.order_items where order_id=ord.id and item_status='DRAFT';if submitted is null then raise exception 'NO_DRAFT_ITEMS';end if;
 insert into public.order_item_batches(order_id,user_id,idempotency_key,request_items,status)
 select ord.id,s.staff_id,key,jsonb_agg(jsonb_build_object('orderItemId',id) order by created_at),'PENDING' from public.order_items where id=any(submitted) returning * into new_batch;
 update public.order_items set item_status='SUBMITTED',sent_at=clock_timestamp(),batch_id=new_batch.id where id=any(submitted);
 perform set_config('app.status_change_notes','Kitchen batch '||new_batch.batch_no||' submitted',true);
 update public.orders set status=case when status='DRAFT' then 'CONFIRMED' else status end,submitted_at=coalesce(submitted_at,now()) where id=ord.id returning * into ord;
 insert into public.order_submissions(order_id,user_id,idempotency_key,submitted_item_ids) values(ord.id,s.staff_id,key,submitted);
 perform public.write_pos_audit('ORDER_ITEMS_SUBMITTED','ORDER',ord.id,null,jsonb_build_object('batchId',new_batch.id,'itemIds',to_jsonb(submitted)));
 return jsonb_build_object('id',ord.id,'status',ord.status,'submittedItemIds',submitted,'batchId',new_batch.id,'batchNo',new_batch.batch_no);
end $$;
revoke all on function public.submit_pos_order(uuid,text) from public,anon;grant execute on function public.submit_pos_order(uuid,text) to authenticated;

-- Sent kitchen lines are immutable. A manager can only cancel them through
-- this audited workflow; drafts continue to be edited by replacement above.
create or replace function public.void_submitted_order_item(p_order_id uuid,p_order_item_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.terminal_staff_sessions;ord public.orders;line public.order_items;reason text;result public.orders;
begin
 s:=public.require_terminal_staff_session();
 if not public.has_pos_permission('order.manage') then raise exception 'INSUFFICIENT_PERMISSION';end if;
 reason:=nullif(left(trim(coalesce(p_reason,'')),500),'');if reason is null or length(reason)<3 then raise exception 'VOID_REASON_REQUIRED';end if;
 select * into ord from public.orders where id=p_order_id for update;if not found then raise exception 'ORDER_NOT_FOUND';end if;
 if ord.company_id<>s.company_id or ord.branch_id<>s.branch_id then raise exception 'ORDER_BRANCH_MISMATCH';end if;
 if ord.payment_status<>'UNPAID' then raise exception 'ORDER_ALREADY_PAID';end if;
 if ord.status not in('CONFIRMED','PREPARING','READY') then raise exception 'ORDER_NOT_EDITABLE';end if;
 select * into line from public.order_items where id=p_order_item_id and order_id=ord.id for update;
 if not found then raise exception 'ORDER_ITEM_NOT_FOUND';end if;
 if line.item_status not in('SUBMITTED','PREPARING','READY') then raise exception 'ORDER_ITEM_NOT_VOIDABLE';end if;
 update public.order_items set item_status='VOIDED',void_reason=reason,voided_by=s.staff_id,voided_at=now() where id=line.id;
 if line.batch_id is not null and not exists(select 1 from public.order_items where batch_id=line.batch_id and item_status<>'VOIDED') then
  update public.order_item_batches set status='CANCELLED' where id=line.batch_id and status<>'SERVED';
 end if;
 result:=public.recalculate_pos_order(ord.id);
 perform public.write_pos_audit('SUBMITTED_ORDER_ITEM_VOIDED','ORDER_ITEM',line.id,null,jsonb_build_object('orderId',ord.id,'batchId',line.batch_id,'productId',line.product_id,'quantity',line.quantity,'reason',reason));
 return jsonb_build_object('id',line.id,'orderId',ord.id,'status','VOIDED','subtotal',result.subtotal,'tax',result.tax,'serviceCharge',result.service_charge,'total',result.total);
end $$;
revoke all on function public.void_submitted_order_item(uuid,uuid,text) from public,anon;
grant execute on function public.void_submitted_order_item(uuid,uuid,text) to authenticated;

alter table public.branch_products replica identity full;alter table public.branch_product_options replica identity full;
do $$ begin
 begin alter publication supabase_realtime add table public.branch_products;exception when duplicate_object then null;end;
 begin alter publication supabase_realtime add table public.branch_product_options;exception when duplicate_object then null;end;
end $$;
commit;
