begin;

create or replace function public.resolve_authenticated_terminal(p_device_identifier text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare t public.pos_terminals; b public.branches; c public.companies;
begin
  select * into t from public.pos_terminals
  where auth_user_id=auth.uid()
     or (auth_user_id is null and device_identifier=p_device_identifier)
  order by (auth_user_id=auth.uid()) desc limit 1 for update;
  if not found then return jsonb_build_object('ok',false,'code','TERMINAL_AUTH_NOT_BOUND'); end if;
  select * into b from public.branches where id=t.branch_id;
  select * into c from public.companies where id=t.company_id;
  if c.id is null or c.status<>'ACTIVE' then return jsonb_build_object('ok',false,'code','COMPANY_INACTIVE'); end if;
  if b.id is null or b.company_id<>c.id or b.status<>'ACTIVE' then return jsonb_build_object('ok',false,'code','BRANCH_INACTIVE'); end if;
  if t.status<>'ACTIVE' or t.registration_status<>'REGISTERED' then return jsonb_build_object('ok',false,'code','TERMINAL_INACTIVE'); end if;
  if coalesce(t.lock_status,'UNLOCKED')='LOCKED' then return jsonb_build_object('ok',false,'code','TERMINAL_LOCKED'); end if;
  if t.auth_user_id is null then update public.pos_terminals set auth_user_id=auth.uid(),authenticated_at=now(),updated_at=now() where id=t.id returning * into t; end if;
  update public.pos_terminals set last_seen_at=now() where id=t.id;
  return jsonb_build_object('ok',true,'terminalId',t.id,'terminalCode',t.terminal_code,'terminalName',t.name,'terminalType',t.terminal_type,'branchId',b.id,'branchCode',b.code,'branchName',b.name,'companyId',c.id,'companyCode',c.code,'companyName',c.name,'lockStatus',t.lock_status);
end; $$;

create or replace function public.save_terminal_access(
  p_terminal_id uuid,p_access_mode text,p_allowed_roles text[],p_staff_ids uuid[]
) returns public.pos_terminals language plpgsql security definer set search_path=public as $$
declare t public.pos_terminals; mode text:=upper(trim(p_access_mode)); role_list text[]:=coalesce(p_allowed_roles,array[]::text[]); staff_list uuid[]:=coalesce(p_staff_ids,array[]::uuid[]);
begin
  if not public.has_pos_permission('terminal.update') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into t from public.pos_terminals where id=p_terminal_id for update;
  if not found or not public.can_access_branch(t.branch_id) then raise exception 'TERMINAL_NOT_FOUND'; end if;
  if mode not in ('ALL_BRANCH_STAFF','ROLE_RESTRICTED','STAFF_RESTRICTED') then raise exception 'INVALID_TERMINAL_ACCESS_MODE'; end if;
  if exists(select 1 from unnest(role_list) requested where not exists(select 1 from public.roles r where r.name=upper(trim(requested)) and r.name<>'ADMIN')) then raise exception 'INVALID_TERMINAL_ROLE'; end if;
  role_list:=array(select upper(trim(value)) from unnest(role_list) value);
  if mode='ROLE_RESTRICTED' and cardinality(role_list)=0 then raise exception 'TERMINAL_ROLE_REQUIRED'; end if;
  if mode='STAFF_RESTRICTED' and cardinality(staff_list)=0 then raise exception 'TERMINAL_STAFF_REQUIRED'; end if;
  if exists(select 1 from public.staff s where s.id=any(staff_list) and (s.company_id<>t.company_id or not s.active or not (s.branch_id=t.branch_id or exists(select 1 from public.staff_branch_assignments a where a.staff_id=s.legacy_profile_id and a.branch_id=t.branch_id and a.status='ACTIVE')))) then raise exception 'STAFF_BRANCH_ACCESS_DENIED'; end if;
  update public.pos_terminals set access_mode=mode,allowed_roles=role_list,updated_at=now() where id=t.id returning * into t;
  delete from public.terminal_staff_access where terminal_id=t.id;
  if mode='STAFF_RESTRICTED' then insert into public.terminal_staff_access(terminal_id,staff_id) select t.id,unnest(staff_list); end if;
  perform public.write_pos_audit('TERMINAL_ACCESS_UPDATED','TERMINAL',t.id,null,jsonb_build_object('accessMode',mode,'allowedRoles',role_list,'staffCount',cardinality(staff_list)));
  return t;
end; $$;

revoke all on function public.resolve_authenticated_terminal(text),public.save_terminal_access(uuid,text,text[],uuid[]) from public,anon;
grant execute on function public.resolve_authenticated_terminal(text),public.save_terminal_access(uuid,text,text[],uuid[]) to authenticated;

commit;
