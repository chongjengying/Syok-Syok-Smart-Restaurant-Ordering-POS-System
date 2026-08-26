-- Minimal idempotent catalog sample for staging verification.
do $$
declare
  seeded_category_id uuid;
  seeded_product_id uuid;
  seeded_group_id uuid;
begin
  select id into seeded_category_id
  from public.categories
  where name = 'Staging Sample Menu';

  if seeded_category_id is null then
    insert into public.categories (name, description, status)
    values ('Staging Sample Menu', 'Sample category for staging verification.', true)
    returning id into seeded_category_id;
  end if;

  select id into seeded_product_id
  from public.products
  where category_id = seeded_category_id
    and product_name = 'Staging Nasi Lemak';

  if seeded_product_id is null then
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
      seeded_category_id,
      'Staging Nasi Lemak',
      'Sample product for staging verification.',
      'plate',
      4.00,
      9.90,
      true,
      true
    )
    returning id into seeded_product_id;
  end if;

  select id into seeded_group_id
  from public.product_option_groups
  where product_id = seeded_product_id
    and name = 'Spice Level';

  if seeded_group_id is null then
    insert into public.product_option_groups (
      product_id,
      name,
      selection_type,
      is_required,
      min_selection,
      max_selection,
      sort_order
    )
    values (seeded_product_id, 'Spice Level', 'SINGLE', true, 1, 1, 1)
    returning id into seeded_group_id;
  end if;

  if not exists (
    select 1
    from public.product_options
    where option_group_id = seeded_group_id
      and name = 'Mild'
  ) then
    insert into public.product_options (
      option_group_id,
      name,
      price_adjustment,
      is_available,
      sort_order
    )
    values (seeded_group_id, 'Mild', 0.00, true, 1);
  end if;
end;
$$;
