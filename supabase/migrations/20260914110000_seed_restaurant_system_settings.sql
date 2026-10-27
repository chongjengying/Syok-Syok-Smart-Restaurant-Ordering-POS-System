begin;
-- The application expects one global settings row as the base for effective
-- branch settings. Restore it for installations where the row was removed.
insert into public.restaurant_system_settings (id, restaurant_info)
values (
  true,
  jsonb_build_object(
    'restaurantName', 'Syok Syok Restaurant',
    'branchName', 'Main Branch',
    'branchCode', 'MAIN',
    'country', 'Malaysia'
  )
)
on conflict (id) do nothing;
commit;
