begin;

-- Terminal access belongs to the current staff records. Older rows used the
-- legacy profile id, so migrate those links before changing the foreign key.
alter table public.terminal_staff_access drop constraint if exists terminal_staff_access_staff_id_fkey;
update public.terminal_staff_access a
set staff_id=s.id
from public.staff s
where s.legacy_profile_id=a.staff_id;
alter table public.terminal_staff_access
  add constraint terminal_staff_access_staff_id_fkey foreign key (staff_id) references public.staff(id) on delete cascade;

create or replace function public.save_terminal_access(
  p_terminal_id uuid, p_access_mode text, p_allowed_roles text[], p_staff_ids uuid[]
) returns public.pos_terminals language plpgsql security definer set search_path=public as $$
declare t public.pos_terminals; mode text:=upper(trim(p_access_mode)); role_list text[]:=coalesce(p_allowed_roles,array[]::text[]); staff_list uuid[]:=coalesce(p_staff_ids,array[]::uuid[]);
begin
  if not public.has_pos_permission('terminal.update') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into t from public.pos_terminals where id=p_terminal_id for update;
  if not found or not public.can_access_branch(t.branch_id) then raise exception 'TERMINAL_NOT_FOUND'; end if;
  if mode not in ('ALL_BRANCH_STAFF','ROLE_RESTRICTED','STAFF_RESTRICTED') then raise exception 'INVALID_TERMINAL_ACCESS_MODE'; end if;
  if exists(select 1 from unnest(role_list) r where r not in ('ADMIN','MANAGER','WAITER','KITCHEN','CASHIER')) then raise exception 'INVALID_TERMINAL_ROLE'; end if;
  if mode='ROLE_RESTRICTED' and cardinality(role_list)=0 then raise exception 'TERMINAL_ROLE_REQUIRED'; end if;
  if mode='STAFF_RESTRICTED' and cardinality(staff_list)=0 then raise exception 'TERMINAL_STAFF_REQUIRED'; end if;
  if exists(select 1 from public.staff s where s.id=any(staff_list) and (s.company_id<>t.company_id or s.branch_id<>t.branch_id or not s.active)) then raise exception 'STAFF_BRANCH_ACCESS_DENIED'; end if;
  update public.pos_terminals set access_mode=mode,allowed_roles=role_list,updated_at=now() where id=t.id returning * into t;
  delete from public.terminal_staff_access where terminal_id=t.id;
  if mode='STAFF_RESTRICTED' then insert into public.terminal_staff_access(terminal_id,staff_id) select t.id,unnest(staff_list); end if;
  perform public.write_pos_audit('TERMINAL_ACCESS_UPDATED','TERMINAL',t.id,null,jsonb_build_object('accessMode',mode,'allowedRoles',role_list,'staffCount',cardinality(staff_list)));
  return t;
end $$;

create or replace function public.get_terminal_access_configuration(p_terminal_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare t public.pos_terminals; s jsonb;
begin
  select * into t from public.pos_terminals where id=p_terminal_id;
  if not found or not public.can_access_branch(t.branch_id) or not public.has_pos_permission('terminal.view') then raise exception 'TERMINAL_NOT_FOUND'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',st.id,'staffCode',st.staff_code,'name',st.name,'role',r.name,'active',st.active,'selected',exists(select 1 from public.terminal_staff_access a where a.terminal_id=t.id and a.staff_id=st.id)) order by st.name),'[]'::jsonb)
    into s from public.staff st join public.roles r on r.id=st.role_id where st.company_id=t.company_id and st.branch_id=t.branch_id;
  return jsonb_build_object('terminalId',t.id,'accessMode',t.access_mode,'allowedRoles',coalesce(t.allowed_roles,'{}'::text[]),'staff',s);
end $$;
revoke all on function public.get_terminal_access_configuration(uuid) from public,anon;
grant execute on function public.get_terminal_access_configuration(uuid) to authenticated;

drop function if exists public.list_authenticated_terminal_staff();
create function public.list_authenticated_terminal_staff()
returns table(id uuid, staff_code text, name text, role text, pin_status text, pin_setup_required boolean, temporary_pin_required boolean)
language sql stable security definer set search_path=public as $$
  select st.id,st.staff_code,st.name,r.name,coalesce(pc.status,'SETUP_REQUIRED'),pc.staff_id is null or pc.status='SETUP_REQUIRED',pc.status='TEMPORARY_RESET'
  from public.pos_terminals t join public.staff st on st.company_id=t.company_id and st.branch_id=t.branch_id and st.active
  join public.roles r on r.id=st.role_id left join public.staff_pin_credentials_v2 pc on pc.staff_id=st.id
  where t.auth_user_id=auth.uid() and t.status='ACTIVE' and t.registration_status='REGISTERED'
    and (t.access_mode='ALL_BRANCH_STAFF' or (t.access_mode='ROLE_RESTRICTED' and r.name=any(t.allowed_roles)) or (t.access_mode='STAFF_RESTRICTED' and exists(select 1 from public.terminal_staff_access a where a.terminal_id=t.id and a.staff_id=st.id)))
  order by st.name;
$$;
revoke all on function public.list_authenticated_terminal_staff() from public,anon;
grant execute on function public.list_authenticated_terminal_staff() to authenticated;

commit;
