begin;
create function public.can_manage_storage_owner(p_owner text) returns boolean
language sql stable security definer set search_path=public as $$
 select public.current_user_company_id() is not null and (
  p_owner=auth.uid()::text or exists(select 1 from public.profiles p where p.id::text=p_owner and p.company_id=public.current_user_company_id())
 )
$$;
revoke all on function public.can_manage_storage_owner(text) from public,anon;
grant execute on function public.can_manage_storage_owner(text) to authenticated;
-- Existing permission/bucket policies still apply. Legacy ownerless objects
-- require controlled ownership reconciliation, never a permissive fallback.
create policy tenant_media_delete_boundary on storage.objects as restrictive for delete to authenticated
 using(bucket_id not in ('product-images','payment-qr','restaurant-assets') or public.can_manage_storage_owner(coalesce(owner_id,owner::text)));
create policy tenant_media_update_boundary on storage.objects as restrictive for update to authenticated
 using(bucket_id not in ('product-images','payment-qr','restaurant-assets') or public.can_manage_storage_owner(coalesce(owner_id,owner::text)))
 with check(bucket_id not in ('product-images','payment-qr','restaurant-assets') or (coalesce(owner_id,owner::text)=auth.uid()::text and public.current_user_company_id() is not null));
create policy tenant_media_insert_boundary on storage.objects as restrictive for insert to authenticated
 with check(bucket_id not in ('product-images','payment-qr','restaurant-assets') or (coalesce(owner_id,owner::text)=auth.uid()::text and public.current_user_company_id() is not null));
commit;
