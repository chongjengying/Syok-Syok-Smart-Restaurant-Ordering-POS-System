begin;

create or replace function public.save_admin_product(p_product_id uuid, p_payload jsonb)
returns public.products
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.products%rowtype;
  prior public.products%rowtype;
  action_name text;
  v_product_name text := btrim(coalesce(p_payload->>'name', ''));
  v_price numeric;
  v_cost numeric;
  v_category_id uuid;
begin
  if p_product_id is null and not public.has_pos_permission('product.create') then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;
  if p_product_id is not null and not public.has_pos_permission('product.edit') then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;
  if char_length(v_product_name) not between 1 and 150 then
    raise exception 'INVALID_PRODUCT_NAME';
  end if;

  v_price := (p_payload->>'price')::numeric;
  v_cost := coalesce((p_payload->>'cost')::numeric, 0);
  v_category_id := (p_payload->>'categoryId')::uuid;
  if v_price < 0 or v_cost < 0 then
    raise exception 'INVALID_PRODUCT_PRICE';
  end if;

  perform 1
  from public.categories as category
  where category.id = v_category_id;
  if not found then
    raise exception 'CATEGORY_NOT_FOUND';
  end if;

  if p_product_id is null then
    insert into public.products (
      category_id,
      product_name,
      description,
      unit,
      cost_price,
      sell_price,
      status,
      is_available
    )
    values (
      v_category_id,
      v_product_name,
      nullif(left(btrim(coalesce(p_payload->>'description', '')), 1000), ''),
      nullif(left(btrim(coalesce(p_payload->>'unit', '')), 20), ''),
      v_cost,
      v_price,
      coalesce((p_payload->>'isActive')::boolean, true),
      coalesce((p_payload->>'isAvailable')::boolean, true)
    )
    returning * into result;
    action_name := 'PRODUCT_CREATED';
  else
    select product.*
    into prior
    from public.products as product
    where product.id = p_product_id
    for update;
    if not found then
      raise exception 'PRODUCT_NOT_FOUND';
    end if;
    if prior.status
       and coalesce((p_payload->>'isActive')::boolean, prior.status) = false
       and not public.has_pos_permission('product.deactivate') then
      raise exception 'INSUFFICIENT_PERMISSION';
    end if;

    update public.products as product
    set category_id = v_category_id,
        product_name = v_product_name,
        description = nullif(left(btrim(coalesce(p_payload->>'description', '')), 1000), ''),
        unit = nullif(left(btrim(coalesce(p_payload->>'unit', '')), 20), ''),
        cost_price = v_cost,
        sell_price = v_price,
        status = coalesce((p_payload->>'isActive')::boolean, product.status),
        is_available = coalesce((p_payload->>'isAvailable')::boolean, product.is_available)
    where product.id = p_product_id
    returning product.* into result;
    action_name := case
      when prior.sell_price is distinct from result.sell_price then 'PRODUCT_PRICE_CHANGED'
      else 'PRODUCT_UPDATED'
    end;
  end if;

  perform public.write_pos_audit(
    action_name,
    'PRODUCT',
    result.id,
    null,
    jsonb_build_object('productCode', result.product_code, 'price', result.sell_price)
  );
  return result;
exception
  when invalid_text_representation then
    raise exception 'INVALID_PRODUCT_INPUT';
end;
$$;

revoke all on function public.save_admin_product(uuid, jsonb) from public, anon;
grant execute on function public.save_admin_product(uuid, jsonb) to authenticated;

commit;
