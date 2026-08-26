begin;

create or replace function public.create_admin_role(p_name text, p_description text default null)
returns public.roles
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_name text := upper(btrim(coalesce(p_name, '')));
  normalized_description text := nullif(btrim(coalesce(p_description, '')), '');
  created_role public.roles%rowtype;
begin
  if not public.has_pos_permission('role.edit') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if normalized_name !~ '^[A-Z][A-Z0-9_]{1,49}$' then raise exception 'INVALID_ROLE_NAME'; end if;
  if char_length(coalesce(normalized_description, '')) > 500 then raise exception 'INVALID_ROLE_DESCRIPTION'; end if;
  insert into public.roles(name, description) values (normalized_name, normalized_description) returning * into created_role;
  perform public.write_pos_audit('ROLE_CREATED', 'ROLE', created_role.id, null, jsonb_build_object('name', created_role.name, 'description', created_role.description));
  return created_role;
exception when unique_violation then raise exception 'ROLE_ALREADY_EXISTS';
end;
$$;

revoke all on function public.create_admin_role(text, text) from public, anon;
grant execute on function public.create_admin_role(text, text) to authenticated;

commit;
