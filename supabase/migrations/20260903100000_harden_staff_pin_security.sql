begin;

-- Reject common weak PINs at the database boundary. PINs remain bcrypt-hashed.
create or replace function public.is_strong_staff_pin(p_pin text)
returns boolean language sql immutable
as $$
  select p_pin ~ '^[0-9]{4,6}$'
    and p_pin not in ('0000','1111','2222','3333','4444','5555','6666','7777','8888','9999','1234','4321','12345','54321','123456','654321')
    and p_pin !~ '^(012345|123456|234567|345678|456789|567890|987654|876543|765432|654321|543210)';
$$;

-- Keep the existing public API shape while hardening every PIN write path.
create or replace function public.set_own_staff_pin(p_pin text)
returns void language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not public.is_active_pos_user() then raise exception 'ACTIVE_PROFILE_REQUIRED'; end if;
  if not public.is_strong_staff_pin(p_pin) then raise exception 'INVALID_STAFF_PIN'; end if;
  perform pg_advisory_xact_lock(hashtextextended('staff-pin-uniqueness', 0));
  if exists (select 1 from public.staff_pin_credentials c where c.user_id <> auth.uid() and c.status = 'ACTIVE' and c.pin_hash is not null and c.pin_hash = crypt(p_pin, c.pin_hash)) then
    raise exception 'STAFF_PIN_ALREADY_IN_USE';
  end if;
  insert into public.staff_pin_credentials (user_id, pin_hash, status, changed_by)
  values (auth.uid(), crypt(p_pin, gen_salt('bf', 12)), 'ACTIVE', auth.uid())
  on conflict (user_id) do update set pin_hash=excluded.pin_hash,status='ACTIVE',failed_attempts=0,locked_until=null,changed_at=now(),changed_by=auth.uid();
  perform public.write_pos_audit('STAFF_PIN_CHANGED','PROFILE',auth.uid(),null,jsonb_build_object('credentialStatus','ACTIVE'));
end;
$$;

revoke all on function public.is_strong_staff_pin(text) from public, anon, authenticated;
revoke all on function public.set_own_staff_pin(text) from public, anon, authenticated;
grant execute on function public.set_own_staff_pin(text) to authenticated;
commit;
