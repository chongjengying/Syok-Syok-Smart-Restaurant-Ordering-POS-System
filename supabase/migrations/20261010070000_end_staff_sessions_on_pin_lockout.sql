begin;

create or replace function public.current_terminal_staff_session()
returns public.terminal_staff_sessions language sql stable security definer set search_path=public as $$
 select s from public.terminal_staff_sessions s
 join public.pos_terminals t on t.id=s.terminal_id
 join public.terminal_device_assignments d on d.assignment_id=s.device_assignment_id
   and d.terminal_id=t.id and d.status='ACTIVE'
 join public.staff_pin_credentials_v2 pc on pc.staff_id=s.staff_record_id
 where s.auth_session_id=nullif(auth.jwt()->>'session_id','')::uuid and t.auth_user_id=auth.uid()
   and s.status='ACTIVE' and s.branch_id=t.branch_id and s.company_id=t.company_id
   and (pc.locked_until is null or pc.locked_until<=now())
   and public.terminal_device_access_reason(t.id) is null
   and public.terminal_staff_access_reason(t.id,s.staff_record_id) is null;
$$;

create or replace function public.end_locked_pin_staff_sessions()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.locked_until is not null and new.locked_until>now()
   and (old.locked_until is null or old.locked_until<=now()) then
   update public.terminal_staff_sessions
   set status='ENDED',ended_at=coalesce(ended_at,now()),updated_at=now()
   where staff_record_id=new.staff_id and status in ('ACTIVE','LOCKED');
 end if;
 return new;
end $$;
create trigger staff_pin_lockout_ends_sessions after update of locked_until
on public.staff_pin_credentials_v2 for each row execute function public.end_locked_pin_staff_sessions();
revoke all on function public.end_locked_pin_staff_sessions() from public,anon,authenticated;

commit;
