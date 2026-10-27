begin;
create or replace function public.einvoice_profile_set_status(p_id uuid,p_status text) returns public.company_einvoice_profiles
language plpgsql security definer set search_path=public as $$
declare r public.company_einvoice_profiles; previous public.company_einvoice_profiles;
begin
 if not public.has_pos_permission('einvoice.company.manage') then raise exception 'INSUFFICIENT_PERMISSION' using errcode='42501'; end if;
 if p_status not in ('ACTIVE','DISABLED','SUSPENDED') or p_status is null then raise exception 'INVALID_STATUS'; end if;
 select * into previous from public.company_einvoice_profiles where id=p_id and company_id=public.current_user_company_id() for update;
 if not found then raise exception 'PROFILE_NOT_FOUND_OR_FORBIDDEN' using errcode='42501'; end if;
 update public.company_einvoice_profiles set status=p_status,updated_at=now() where id=previous.id and company_id=previous.company_id returning * into r;
 perform public.write_pos_audit_diff('COMPANY_EINVOICE_STATUS_CHANGED','EINVOICE_PROFILE',p_id,null,to_jsonb(previous),to_jsonb(r));
 return r;
end $$;
revoke all on function public.einvoice_profile_set_status(uuid,text) from public,anon;
grant execute on function public.einvoice_profile_set_status(uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
