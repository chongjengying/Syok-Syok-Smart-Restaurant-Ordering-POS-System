begin;

create or replace function public.admin_reset_staff_pin(p_staff_id uuid)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare
  caller public.profiles;
  target public.staff;
  temporary_pin text;
begin
  if not public.has_pos_permission('user.edit') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into caller from public.profiles where id = auth.uid() and status = 'ACTIVE';
  if not found then raise exception 'ADMIN_PROFILE_REQUIRED'; end if;
  select * into target from public.staff where id = p_staff_id and company_id = caller.company_id for update;
  if not found or not target.active then raise exception 'STAFF_NOT_FOUND'; end if;

  temporary_pin := lpad((floor(random() * 1000000))::int::text, 6, '0');
  insert into public.staff_pin_credentials_v2(staff_id, pin_hash, status, failed_attempts, locked_until, changed_by)
  values (target.id, crypt(temporary_pin, gen_salt('bf', 12)), 'TEMPORARY_RESET', 0, null, auth.uid())
  on conflict (staff_id) do update set
    pin_hash = excluded.pin_hash,
    status = 'TEMPORARY_RESET',
    failed_attempts = 0,
    locked_until = null,
    changed_at = now(),
    changed_by = auth.uid();
  perform public.write_pos_audit(
    'STAFF_PIN_RESET_REQUIRED', 'STAFF', target.id, null,
    jsonb_build_object('credentialStatus', 'TEMPORARY_RESET', 'branchId', target.branch_id)
  );
  return jsonb_build_object('staffId', target.id, 'staffCode', target.staff_code, 'temporaryPin', temporary_pin);
end;
$$;

revoke all on function public.admin_reset_staff_pin(uuid) from public, anon;
grant execute on function public.admin_reset_staff_pin(uuid) to authenticated;

commit;
