-- Role and account-status changes alter POS authorization and must be
-- attributable even when performed through the Data API instead of a UI.
create or replace function public.audit_profile_permission_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role_id is distinct from old.role_id
     or new.role_name is distinct from old.role_name
     or new.status is distinct from old.status then
    insert into public.audit_logs (
      actor_id,
      action,
      entity_type,
      entity_id,
      metadata
    ) values (
      auth.uid(),
      'PROFILE_PERMISSION_CHANGED',
      'PROFILE',
      new.id,
      jsonb_build_object(
        'previousRoleId', old.role_id,
        'newRoleId', new.role_id,
        'previousRole', old.role_name,
        'newRole', new.role_name,
        'previousStatus', old.status,
        'newStatus', new.status
      )
    );
  end if;

  return new;
end;
$$;

revoke all on function public.audit_profile_permission_change()
from public, anon, authenticated;

drop trigger if exists trg_audit_profile_permission_change on public.profiles;
create trigger trg_audit_profile_permission_change
after update of role_id, role_name, status on public.profiles
for each row execute function public.audit_profile_permission_change();
