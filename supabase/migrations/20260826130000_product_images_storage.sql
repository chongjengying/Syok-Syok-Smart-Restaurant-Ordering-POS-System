begin;

alter table public.products
  add column if not exists image_path text;
comment on column public.products.image_path is 'Portable object path in the product-images Storage bucket.';
comment on column public.products.image_url is 'Deprecated: do not write environment-specific image URLs; use image_path.';

grant insert, update on public.products to authenticated;

drop policy if exists management_insert_products on public.products;
create policy management_insert_products
on public.products for insert to authenticated
with check (public.current_pos_role() in ('ADMIN', 'MANAGER'));

drop policy if exists management_update_products on public.products;
create policy management_update_products
on public.products for update to authenticated
using (public.current_pos_role() in ('ADMIN', 'MANAGER'))
with check (public.current_pos_role() in ('ADMIN', 'MANAGER'));

alter table public.products
  drop constraint if exists products_image_path_format_check;
alter table public.products
  add constraint products_image_path_format_check check (
    image_path is null
    or image_path ~ '^products/[A-Z0-9][A-Z0-9-]{0,39}/[0-9a-f-]{36}\.webp$'
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.guard_product_image_path_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if ((tg_op = 'INSERT' and new.image_path is not null)
      or (tg_op = 'UPDATE' and new.image_path is distinct from old.image_path))
     and current_setting('app.product_image_path_write', true) <> 'allowed' then
    raise exception 'USE_PRODUCT_IMAGE_PATH_RPC';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_product_image_path_write on public.products;
create trigger trg_guard_product_image_path_write
before insert or update of image_path on public.products
for each row execute function public.guard_product_image_path_write();

create or replace function public.set_product_image_path(
  p_product_id uuid,
  p_image_path text
)
returns public.products
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text := public.current_pos_role();
  normalized_path text := nullif(btrim(coalesce(p_image_path, '')), '');
  product_row public.products%rowtype;
begin
  if caller_role not in ('ADMIN', 'MANAGER') then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;
  if normalized_path is null and caller_role <> 'ADMIN' then
    raise exception 'ADMIN_REQUIRED_TO_DELETE_PRODUCT_IMAGE';
  end if;
  if normalized_path is not null then
    if normalized_path !~ '^products/[A-Z0-9][A-Z0-9-]{0,39}/[0-9a-f-]{36}\.webp$' then
      raise exception 'INVALID_PRODUCT_IMAGE_PATH';
    end if;
    if not exists (
      select 1 from storage.objects
      where bucket_id = 'product-images' and name = normalized_path
    ) then
      raise exception 'PRODUCT_IMAGE_OBJECT_NOT_FOUND';
    end if;
  end if;

  select * into product_row from public.products where id = p_product_id for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;

  perform set_config('app.product_image_path_write', 'allowed', true);
  update public.products
  set image_path = normalized_path
  where id = p_product_id
  returning * into product_row;
  return product_row;
end;
$$;

revoke all on function public.guard_product_image_path_write() from public, anon, authenticated;
revoke all on function public.set_product_image_path(uuid, text) from public, anon;
grant execute on function public.set_product_image_path(uuid, text) to authenticated;

drop policy if exists product_images_authenticated_read on storage.objects;
create policy product_images_authenticated_read
on storage.objects for select to authenticated
using (
  bucket_id = 'product-images'
  and public.current_pos_role() in ('ADMIN', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN')
);

drop policy if exists product_images_management_insert on storage.objects;
create policy product_images_management_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'product-images'
  and public.current_pos_role() in ('ADMIN', 'MANAGER')
  and name ~ '^products/[A-Z0-9][A-Z0-9-]{0,39}/[0-9a-f-]{36}\.webp$'
);

drop policy if exists product_images_controlled_delete on storage.objects;
create policy product_images_controlled_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'product-images'
  and (
    public.current_pos_role() = 'ADMIN'
    or (
      public.current_pos_role() = 'MANAGER'
      and not exists (
        select 1 from public.products where image_path = storage.objects.name
      )
    )
  )
);

commit;
