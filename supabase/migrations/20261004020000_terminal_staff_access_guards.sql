begin;

create or replace function public.can_use_terminal(p_terminal_id uuid,p_staff_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.staff st where st.legacy_profile_id=p_staff_id
    and public.terminal_staff_access_reason(p_terminal_id,st.id) is null);
$$;

create or replace function public.validate_terminal_staff_assignment()
returns trigger language plpgsql security definer set search_path=public as $$
declare t public.pos_terminals;
begin
  select * into t from public.pos_terminals where id=new.terminal_id for update;
  if t.id is null or not public.staff_record_has_branch(new.staff_id,t.branch_id) then raise exception 'STAFF_BRANCH_ACCESS_DENIED'; end if;
  return new;
end $$;
create trigger terminal_staff_assignment_guard before insert or update on public.terminal_staff_access
for each row execute function public.validate_terminal_staff_assignment();

create or replace function public.revoke_removed_branch_staff_sessions()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  update public.terminal_staff_sessions set status='ENDED',ended_at=coalesce(ended_at,now()),updated_at=now()
  where staff_id=old.staff_id and branch_id=old.branch_id and status in ('ACTIVE','LOCKED')
    and not public.staff_record_has_branch(staff_record_id,branch_id);
  return null;
end $$;
create trigger removed_branch_staff_sessions after update or delete on public.staff_branch_assignments
for each row execute function public.revoke_removed_branch_staff_sessions();

create or replace function public.revoke_inactive_staff_sessions()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if not new.active then
    update public.terminal_staff_sessions set status='ENDED',ended_at=coalesce(ended_at,now()),updated_at=now()
    where staff_record_id=new.id and status in ('ACTIVE','LOCKED');
  end if;
  return new;
end $$;
create trigger inactive_staff_sessions after update of active on public.staff
for each row execute function public.revoke_inactive_staff_sessions();

revoke all on function public.validate_terminal_staff_assignment(),public.revoke_removed_branch_staff_sessions(),public.revoke_inactive_staff_sessions() from public,anon,authenticated;
commit;
