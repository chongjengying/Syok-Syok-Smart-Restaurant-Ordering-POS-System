begin;

-- Branch Management must report the same credential state used by POS login.
-- The legacy profile table remains for compatibility, but PIN writes are made
-- against staff_pin_credentials_v2 keyed by the canonical staff record.
do $$
declare
  definition text;
begin
  select pg_get_functiondef('public.get_branch_management(uuid)'::regprocedure)
    into definition;

  definition := replace(
    definition,
    'left join public.staff_pin_credentials sc on sc.user_id=p.id',
    'left join public.staff st on st.legacy_profile_id=p.id left join public.staff_pin_credentials_v2 sc on sc.staff_id=st.id'
  );

  execute definition;
end $$;

commit;
