begin;

-- The effective branch settings RPC reads this singleton. Keep a valid default
-- available even when an older local database was created before its seed ran.
insert into public.restaurant_system_settings (id, restaurant_info)
values (
  true,
  jsonb_build_object(
    'restaurantName', 'Restaurant',
    'branchName', 'Main Branch',
    'branchCode', 'MAIN',
    'country', 'Malaysia'
  )
)
on conflict (id) do nothing;

commit;
