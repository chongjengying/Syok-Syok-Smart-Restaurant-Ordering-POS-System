begin;

create or replace function public.list_terminal_branch_staff(p_device_identifier text)
returns table(id uuid,name text,role text,pin_status text,pin_setup_required boolean,temporary_pin_required boolean)
language plpgsql stable security definer set search_path=public as $$
declare t public.pos_terminals;
begin
  if not public.is_active_pos_user() then raise exception 'ACTIVE_PROFILE_REQUIRED'; end if;
  select * into t from public.pos_terminals
  where device_identifier=p_device_identifier
    and status='ACTIVE' and registration_status='REGISTERED';
  if not found then raise exception 'TERMINAL_INVALID'; end if;
  if not exists(select 1 from public.branches b join public.companies c on c.id=b.company_id
    where b.id=t.branch_id and b.status='ACTIVE' and c.status='ACTIVE') then raise exception 'BRANCH_INACTIVE'; end if;

  return query
    select p.id,p.name::text,p.role_name::text,coalesce(sc.status,'SETUP_REQUIRED'),
      sc.user_id is null or sc.status='SETUP_REQUIRED',sc.status='TEMPORARY_RESET'
    from public.profiles p
    left join public.staff_pin_credentials sc on sc.user_id=p.id
    where p.branch_id=t.branch_id and p.status='ACTIVE'
      and public.can_use_terminal(t.id,p.id)
    order by case p.role_name when 'ADMIN' then 1 when 'MANAGER' then 2 when 'CASHIER' then 3 when 'WAITER' then 4 else 5 end,p.name;
end $$;
revoke all on function public.list_terminal_branch_staff(text) from public,anon;
grant execute on function public.list_terminal_branch_staff(text) to authenticated;

-- The PIN endpoint may use this function as a preflight, but the session
-- creation function remains the authoritative second check.
create or replace function public.resolve_registered_terminal(p_device_identifier text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare t public.pos_terminals; b public.branches; c public.companies;
begin
 select * into t from public.pos_terminals where device_identifier=p_device_identifier;
 if not found then return jsonb_build_object('ok',false,'code','TERMINAL_NOT_REGISTERED'); end if;
 select * into b from public.branches where id=t.branch_id; select * into c from public.companies where id=b.company_id;
 if t.status<>'ACTIVE' then return jsonb_build_object('ok',false,'code','TERMINAL_INACTIVE'); end if;
 if t.registration_status<>'REGISTERED' then return jsonb_build_object('ok',false,'code','TERMINAL_NOT_REGISTERED'); end if;
 if b.status<>'ACTIVE' then return jsonb_build_object('ok',false,'code','BRANCH_INACTIVE'); end if;
 if c.status<>'ACTIVE' then return jsonb_build_object('ok',false,'code','COMPANY_INACTIVE'); end if;
 update public.pos_terminals set last_seen_at=now() where id=t.id;
 return jsonb_build_object('ok',true,'companyId',c.id,'companyName',c.name,'branchId',b.id,'branchCode',b.code,'terminalId',t.id,'terminalCode',t.terminal_code,'terminalName',t.name,'terminalType',t.terminal_type,'accessMode',t.access_mode,'allowedRoles',t.allowed_roles);
end $$;
revoke all on function public.resolve_registered_terminal(text) from public,anon;
grant execute on function public.resolve_registered_terminal(text) to authenticated;
commit;
