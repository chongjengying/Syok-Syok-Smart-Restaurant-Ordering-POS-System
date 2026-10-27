begin;

-- Terminal staff selection must use the same branch-assignment rules as POS login.
create or replace function public.save_terminal_access(
  p_terminal_id uuid, p_access_mode text, p_allowed_roles text[], p_staff_ids uuid[]
) returns public.pos_terminals language plpgsql security definer set search_path=public as $$
declare
  t public.pos_terminals;
  mode text := upper(trim(p_access_mode));
  role_list text[] := coalesce(p_allowed_roles, array[]::text[]);
  staff_list uuid[] := coalesce(p_staff_ids, array[]::uuid[]);
begin
  if not public.has_pos_permission('terminal.update') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into t from public.pos_terminals where id = p_terminal_id for update;
  if not found or not public.can_access_branch(t.branch_id) then raise exception 'TERMINAL_NOT_FOUND'; end if;
  if mode not in ('ALL_BRANCH_STAFF', 'ROLE_RESTRICTED', 'STAFF_RESTRICTED') then raise exception 'INVALID_TERMINAL_ACCESS_MODE'; end if;
  if exists(select 1 from unnest(role_list) r where r not in ('ADMIN', 'MANAGER', 'WAITER', 'KITCHEN', 'CASHIER')) then raise exception 'INVALID_TERMINAL_ROLE'; end if;
  if mode = 'ROLE_RESTRICTED' and cardinality(role_list) = 0 then raise exception 'TERMINAL_ROLE_REQUIRED'; end if;
  if mode = 'STAFF_RESTRICTED' and cardinality(staff_list) = 0 then raise exception 'TERMINAL_STAFF_REQUIRED'; end if;
  if exists(
    select 1
    from public.staff s
    where s.id = any(staff_list)
      and (
        s.company_id <> t.company_id
        or not s.active
        or not (
          s.branch_id = t.branch_id
          or exists(
            select 1
            from public.staff_branch_assignments a
            where a.staff_id = s.legacy_profile_id
              and a.branch_id = t.branch_id
              and a.status = 'ACTIVE'
          )
        )
      )
  ) then raise exception 'STAFF_BRANCH_ACCESS_DENIED'; end if;
  update public.pos_terminals
    set access_mode = mode, allowed_roles = role_list, updated_at = now()
    where id = t.id
    returning * into t;
  delete from public.terminal_staff_access where terminal_id = t.id;
  if mode = 'STAFF_RESTRICTED' then
    insert into public.terminal_staff_access(terminal_id, staff_id)
    select t.id, unnest(staff_list);
  end if;
  perform public.write_pos_audit(
    'TERMINAL_ACCESS_UPDATED', 'TERMINAL', t.id, null,
    jsonb_build_object('accessMode', mode, 'allowedRoles', role_list, 'staffCount', cardinality(staff_list))
  );
  return t;
end $$;

create or replace function public.get_terminal_access_configuration(p_terminal_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  t public.pos_terminals;
  s jsonb;
begin
  select * into t from public.pos_terminals where id = p_terminal_id;
  if not found or not public.can_access_branch(t.branch_id) or not public.has_pos_permission('terminal.view') then
    raise exception 'TERMINAL_NOT_FOUND';
  end if;
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', st.id,
        'staffCode', st.staff_code,
        'name', st.name,
        'role', r.name,
        'active', st.active,
        'selected', exists(
          select 1 from public.terminal_staff_access a
          where a.terminal_id = t.id and a.staff_id = st.id
        )
      ) order by st.name
    ), '[]'::jsonb
  ) into s
  from public.staff st
  join public.roles r on r.id = st.role_id
  where st.company_id = t.company_id
    and st.active
    and (
      st.branch_id = t.branch_id
      or exists(
        select 1
        from public.staff_branch_assignments a
        where a.staff_id = st.legacy_profile_id
          and a.branch_id = t.branch_id
          and a.status = 'ACTIVE'
      )
    );
  return jsonb_build_object(
    'terminalId', t.id,
    'accessMode', t.access_mode,
    'allowedRoles', coalesce(t.allowed_roles, '{}'::text[]),
    'staff', s
  );
end $$;

revoke all on function public.get_terminal_access_configuration(uuid) from public, anon;
grant execute on function public.get_terminal_access_configuration(uuid) to authenticated;

commit;
