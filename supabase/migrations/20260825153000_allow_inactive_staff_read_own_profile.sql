-- A newly registered staff member must be able to read only their own profile
-- so the UI can explain that administrator activation is still pending.
-- Operational tables remain restricted to ACTIVE staff by their own policies.
drop policy if exists staff_read_own_profile on public.profiles;

create policy staff_read_own_profile
on public.profiles
for select
to authenticated
using (id = auth.uid());

