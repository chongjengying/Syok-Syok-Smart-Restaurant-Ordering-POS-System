begin;
create or replace view public.staff_branch_access as
select staff_id, branch_id, (status='ACTIVE') as active
from public.staff_branch_assignments;
grant select on public.staff_branch_access to authenticated;
commit;
