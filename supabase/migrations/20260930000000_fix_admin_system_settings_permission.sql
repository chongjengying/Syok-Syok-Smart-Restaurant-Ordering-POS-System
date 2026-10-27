begin;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code = 'settings.view'
where r.name = 'ADMIN'
  and not exists (
    select 1 from public.role_permissions rp
    where rp.role_id = r.id and rp.permission_id = p.id
  )
on conflict do nothing;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code = 'settings.manage'
where r.name = 'ADMIN'
  and not exists (
    select 1 from public.role_permissions rp
    where rp.role_id = r.id and rp.permission_id = p.id
  )
on conflict do nothing;

create or replace function public.set_role_permissions(p_role_id uuid, p_permission_codes text[])
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  role_name text;
  normalized text[];
  unknown_count integer;
begin
  if not public.has_pos_permission('role.edit') then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;

  select name into role_name
  from public.roles
  where id = p_role_id
  for update;

  if not found then
    raise exception 'ROLE_NOT_FOUND';
  end if;

  select coalesce(array_agg(distinct requested.permission_code order by requested.permission_code), array[]::text[])
  into normalized
  from unnest(coalesce(p_permission_codes, array[]::text[])) requested(permission_code);

  select count(*) into unknown_count
  from unnest(normalized) requested(permission_code)
  left join public.permissions p on p.code = requested.permission_code
  where p.id is null;

  if unknown_count > 0 then
    raise exception 'UNKNOWN_PERMISSION';
  end if;

  if role_name = 'ADMIN' and not (array['role.edit','user.assign_role','settings.view','settings.manage'] <@ normalized) then
    raise exception 'ADMIN_CORE_PERMISSIONS_REQUIRED';
  end if;

  delete from public.role_permissions where role_id = p_role_id;
  insert into public.role_permissions(role_id, permission_id, granted_by)
  select p_role_id, id, auth.uid()
  from public.permissions
  where code = any(normalized);

  perform public.write_pos_audit('PERMISSION_CHANGED','ROLE',p_role_id,null,
    jsonb_build_object('role', role_name, 'permissions', normalized));

  return normalized;
end;
$$;

revoke all on function public.set_role_permissions(uuid, text[]) from public, anon;
grant execute on function public.set_role_permissions(uuid, text[]) to authenticated;

commit;
