begin;

-- Keep the database rule aligned with the six-digit POS keypad and reject
-- predictable repeated/sequential PINs at the authoritative write boundary.
create or replace function public.is_strong_staff_pin(p_pin text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select p_pin ~ '^[0-9]{6}$'
    and p_pin !~ '^([0-9])\1{5}$'
    and p_pin not in (
      '012345', '123456', '234567', '345678', '456789', '567890',
      '987654', '876543', '765432', '654321', '543210'
    );
$$;

revoke all on function public.is_strong_staff_pin(text) from public, anon, authenticated;

commit;
