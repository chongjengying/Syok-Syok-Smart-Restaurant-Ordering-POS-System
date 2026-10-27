begin;

-- Apply the querying user's assignment RLS instead of the view owner's privileges.
alter view public.staff_branch_access set (security_invoker = true);
grant select (staff_id, branch_id, status) on public.staff_branch_assignments to authenticated;

commit;
