begin;
create or replace function public.require_company_role(p_role_id uuid) returns public.roles
language plpgsql security definer set search_path=public as $$
declare r public.roles;
begin
 if not public.has_pos_permission('role.edit') then raise exception 'INSUFFICIENT_PERMISSION' using errcode='42501'; end if;
 select * into r from public.roles where id=p_role_id and scope='COMPANY'
 and company_id=public.current_user_company_id() for update;
 if not found then raise exception 'ROLE_NOT_FOUND_OR_FORBIDDEN' using errcode='42501'; end if;
 if r.is_system_locked then raise exception 'ROLE_PROTECTED' using errcode='42501'; end if;
 return r;
end $$;
notify pgrst,'reload schema';
commit;
