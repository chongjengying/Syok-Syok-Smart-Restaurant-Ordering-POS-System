begin;
create or replace function public.verify_own_terminal_lock_pin(p_pin text) returns boolean
language plpgsql security definer set search_path=public as $$
declare t public.pos_terminals; s public.terminal_staff_sessions; result jsonb;
begin
 select * into t from public.pos_terminals where auth_user_id=auth.uid() for update;
 if public.terminal_device_access_reason(t.id) is not null then return false; end if;
 select * into s from public.terminal_staff_sessions where terminal_id=t.id and auth_session_id=nullif(auth.jwt()->>'session_id','')::uuid and status='LOCKED' for update;
 if not found then return false; end if;
 result:=public.verify_authenticated_terminal_staff_pin(s.staff_record_id,p_pin);
 if not coalesce((result->>'ok')::boolean,false) or coalesce((result->>'pinResetRequired')::boolean,false) then return false; end if;
 update public.terminal_staff_sessions set status='ACTIVE',last_activity_at=now(),updated_at=now() where id=s.id;
 if (public.current_terminal_staff_session()).id is null then raise exception 'TERMINAL_SESSION_REJECTED'; end if;
 perform public.write_pos_audit('STAFF_SESSION_UNLOCKED','STAFF_SESSION',s.id,null,jsonb_build_object('deviceAssignmentId',s.device_assignment_id));
 return true;
end $$;
notify pgrst,'reload schema';
commit;
