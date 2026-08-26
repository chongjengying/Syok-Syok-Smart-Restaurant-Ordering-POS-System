insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('payment-qr','payment-qr',true,5242880,array['image/png','image/jpeg','image/webp']) on conflict(id) do update set public=true,file_size_limit=5242880,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists payment_qr_admin_upload on storage.objects;
create policy payment_qr_admin_upload on storage.objects for insert to authenticated with check (bucket_id='payment-qr' and public.current_pos_role()='ADMIN');
