begin;

-- Role creation is already protected inside the SECURITY DEFINER function by
-- role.edit. The later Phase 1 migration revoked the execute grant, which
-- made the existing admin UI action fail before that authorization check ran.
grant execute on function public.create_admin_role(text,text) to authenticated;

commit;
