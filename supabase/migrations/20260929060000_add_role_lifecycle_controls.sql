begin;

alter table public.roles
  add column if not exists is_active boolean not null default true;

create or replace function public.has_pos_permission(p_permission text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1
    from public.profiles profile
    join public.roles role on role.id=profile.role_id and role.is_active
    join public.role_permissions assignment on assignment.role_id=role.id
    join public.permissions permission on permission.id=assignment.permission_id
    where profile.id=auth.uid() and profile.status='ACTIVE'
      and permission.code=p_permission
  )
$$;

create or replace function public.get_my_permissions()
returns text[] language sql stable security definer set search_path=public as $$
  select coalesce(array_agg(permission.code order by permission.code),array[]::text[])
  from public.profiles profile
  join public.roles role on role.id=profile.role_id and role.is_active
  join public.role_permissions assignment on assignment.role_id=role.id
  join public.permissions permission on permission.id=assignment.permission_id
  where profile.id=auth.uid() and profile.status='ACTIVE'
$$;

drop function if exists public.list_admin_roles_with_counts();
create function public.list_admin_roles_with_counts()
returns table(
  id uuid,name varchar,description text,created_at timestamptz,updated_at timestamptz,
  staff_count bigint,permission_count bigint,is_active boolean
)
language plpgsql stable security definer set search_path=public as $$
declare actor_company uuid;
begin
  select company_id into actor_company from public.profiles
  where profiles.id=auth.uid() and status='ACTIVE';
  if actor_company is null or not public.has_pos_permission('role.view') then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;
  return query
  select r.id,r.name,r.description,r.created_at,r.updated_at,
    (select count(*) from public.staff s where s.role_id=r.id and s.company_id=actor_company),
    (select count(*) from public.role_permissions rp where rp.role_id=r.id),
    r.is_active
  from public.roles r
  order by case r.name when 'ADMIN' then 0 when 'MANAGER' then 1 else 2 end,r.name;
end; $$;

create or replace function public.deactivate_admin_role(p_role_id uuid)
returns public.roles
language plpgsql security definer set search_path=public as $$
declare result public.roles%rowtype;
begin
  if not public.has_pos_permission('role.edit') then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;
  update public.roles
  set is_active=false,updated_at=now()
  where id=p_role_id and name<>'ADMIN'
  returning * into result;
  if not found then raise exception 'ROLE_NOT_FOUND_OR_PROTECTED'; end if;
  perform public.write_pos_audit('ROLE_DEACTIVATED','ROLE',result.id,null,
    jsonb_build_object('name',result.name));
  return result;
end; $$;

create or replace function public.activate_admin_role(p_role_id uuid)
returns public.roles
language plpgsql security definer set search_path=public as $$
declare result public.roles%rowtype;
begin
  if not public.has_pos_permission('role.edit') then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;
  update public.roles set is_active=true,updated_at=now()
  where id=p_role_id and name<>'ADMIN'
  returning * into result;
  if not found then raise exception 'ROLE_NOT_FOUND_OR_PROTECTED'; end if;
  perform public.write_pos_audit('ROLE_ACTIVATED','ROLE',result.id,null,
    jsonb_build_object('name',result.name));
  return result;
end; $$;

revoke all on function public.list_admin_roles_with_counts(),public.deactivate_admin_role(uuid),public.activate_admin_role(uuid) from public,anon;
grant execute on function public.list_admin_roles_with_counts(),public.deactivate_admin_role(uuid),public.activate_admin_role(uuid) to authenticated;

commit;
