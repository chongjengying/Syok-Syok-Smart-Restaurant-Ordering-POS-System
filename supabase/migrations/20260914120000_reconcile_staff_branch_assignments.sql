begin;
-- Reconcile legacy staff.branch_id records into the authoritative assignment
-- table used by branch management and staff assignment views.
insert into public.staff_branch_assignments (
  staff_id, branch_id, is_primary, status, assigned_by
)
select s.legacy_profile_id, s.branch_id, true, 'ACTIVE',
       (select p.id from public.profiles p where p.role_name = 'ADMIN' and p.status = 'ACTIVE' order by p.created_at limit 1)
from public.staff s
join public.branches b on b.id = s.branch_id and b.status = 'ACTIVE'
where s.active = true
on conflict (staff_id, branch_id) do update
set is_primary = true,
    status = 'ACTIVE',
    removed_at = null,
    updated_at = now();
commit;
