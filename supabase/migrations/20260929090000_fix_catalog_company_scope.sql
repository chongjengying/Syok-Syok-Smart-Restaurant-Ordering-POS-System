begin;

create or replace function public.save_admin_category(p_category_id uuid,p_payload jsonb)
returns public.categories
language plpgsql security definer set search_path=public as $$
declare
  result public.categories%rowtype;
  previous public.categories%rowtype;
  action_name text;
  category_name text:=btrim(coalesce(p_payload->>'name',''));
  v_company_id uuid:=public.current_user_company_id();
begin
  if p_category_id is null and not public.has_pos_permission('category.create') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if p_category_id is not null and not public.has_pos_permission('category.edit') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if v_company_id is null then raise exception 'COMPANY_ACCESS_DENIED'; end if;
  if char_length(category_name) not between 1 and 150 then raise exception 'INVALID_CATEGORY_NAME'; end if;
  if coalesce((p_payload->>'displayOrder')::integer,0)<0 then raise exception 'INVALID_DISPLAY_ORDER'; end if;
  if p_category_id is null then
    insert into public.categories(company_id,name,description,status,display_order)
    values(v_company_id,category_name,nullif(left(btrim(coalesce(p_payload->>'description','')),1000),''),coalesce((p_payload->>'status')::boolean,true),coalesce((p_payload->>'displayOrder')::integer,0))
    returning * into result;
    action_name:='CATEGORY_CREATED';
  else
    select c.* into previous from public.categories c where c.id=p_category_id and c.company_id=v_company_id for update;
    if not found then raise exception 'CATEGORY_NOT_FOUND'; end if;
    update public.categories c
    set name=category_name,description=nullif(left(btrim(coalesce(p_payload->>'description','')),1000),''),status=coalesce((p_payload->>'status')::boolean,c.status),display_order=coalesce((p_payload->>'displayOrder')::integer,c.display_order),updated_at=now()
    where c.id=p_category_id and c.company_id=v_company_id returning c.* into result;
    action_name:=case when previous.status is distinct from result.status then 'CATEGORY_STATUS_CHANGED' else 'CATEGORY_UPDATED' end;
  end if;
  perform public.write_pos_audit_diff(action_name,'CATEGORY',result.id,null,to_jsonb(previous),to_jsonb(result));
  return result;
exception when invalid_text_representation then raise exception 'INVALID_CATEGORY_INPUT';
end;
$$;

create or replace function public.save_admin_product(p_product_id uuid,p_payload jsonb)
returns public.products
language plpgsql security definer set search_path=public as $$
declare
  result public.products%rowtype;
  previous public.products%rowtype;
  action_name text;
  requested_product_name text:=btrim(coalesce(p_payload->>'name',''));
  requested_price numeric;
  requested_cost numeric;
  requested_category_id uuid;
  v_company_id uuid:=public.current_user_company_id();
begin
  if p_product_id is null and not public.has_pos_permission('product.create') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if p_product_id is not null and not public.has_pos_permission('product.edit') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if v_company_id is null then raise exception 'COMPANY_ACCESS_DENIED'; end if;
  if char_length(requested_product_name) not between 1 and 150 then raise exception 'INVALID_PRODUCT_NAME'; end if;
  requested_price:=(p_payload->>'price')::numeric;
  requested_cost:=coalesce((p_payload->>'cost')::numeric,0);
  requested_category_id:=(p_payload->>'categoryId')::uuid;
  if requested_price<0 or requested_cost<0 then raise exception 'INVALID_PRODUCT_PRICE'; end if;
  if not exists(select 1 from public.categories c where c.id=requested_category_id and c.company_id=v_company_id) then raise exception 'CATEGORY_NOT_FOUND'; end if;
  if p_product_id is null then
    insert into public.products(company_id,category_id,product_name,description,unit,cost_price,sell_price,status,is_available)
    values(v_company_id,requested_category_id,requested_product_name,nullif(left(btrim(coalesce(p_payload->>'description','')),1000),''),nullif(left(btrim(coalesce(p_payload->>'unit','')),20),''),requested_cost,requested_price,coalesce((p_payload->>'isActive')::boolean,true),coalesce((p_payload->>'isAvailable')::boolean,true))
    returning * into result;
    action_name:='PRODUCT_CREATED';
  else
    select p.* into previous from public.products p where p.id=p_product_id and p.company_id=v_company_id for update;
    if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
    if previous.status and coalesce((p_payload->>'isActive')::boolean,previous.status)=false and not public.has_pos_permission('product.deactivate') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
    update public.products p
    set category_id=requested_category_id,product_name=requested_product_name,description=nullif(left(btrim(coalesce(p_payload->>'description','')),1000),''),unit=nullif(left(btrim(coalesce(p_payload->>'unit','')),20),''),cost_price=requested_cost,sell_price=requested_price,status=coalesce((p_payload->>'isActive')::boolean,p.status),is_available=coalesce((p_payload->>'isAvailable')::boolean,p.is_available),updated_at=now()
    where p.id=p_product_id and p.company_id=v_company_id returning p.* into result;
    action_name:=case when previous.sell_price is distinct from result.sell_price then 'PRODUCT_PRICE_CHANGED' when previous.category_id is distinct from result.category_id then 'PRODUCT_CATEGORY_CHANGED' else 'PRODUCT_UPDATED' end;
  end if;
  perform public.write_pos_audit_diff(action_name,'PRODUCT',result.id,null,to_jsonb(previous),to_jsonb(result));
  return result;
exception when invalid_text_representation then raise exception 'INVALID_PRODUCT_INPUT';
end;
$$;

revoke all on function public.save_admin_category(uuid,jsonb),public.save_admin_product(uuid,jsonb) from public,anon;
grant execute on function public.save_admin_category(uuid,jsonb),public.save_admin_product(uuid,jsonb) to authenticated;

commit;
