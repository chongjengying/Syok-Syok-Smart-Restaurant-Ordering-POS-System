begin;
alter table public.terminal_staff_sessions add column if not exists actor_auth_user_id uuid references public.profiles(id) on delete restrict, add column if not exists auth_session_id uuid, add column if not exists role text, add column if not exists permissions text[] not null default '{}';
create unique index if not exists terminal_staff_auth_session_unique on public.terminal_staff_sessions(auth_session_id) where auth_session_id is not null;
create or replace function public.current_terminal_staff_session() returns public.terminal_staff_sessions language sql stable security definer set search_path=public as $$
 select s from public.terminal_staff_sessions s join public.profiles p on p.id=s.staff_id join public.pos_terminals t on t.id=s.terminal_id join public.branches b on b.id=s.branch_id join public.companies c on c.id=b.company_id
 where s.auth_session_id=nullif(auth.jwt()->>'session_id','')::uuid and s.staff_id=auth.uid() and s.status='ACTIVE' and p.status='ACTIVE' and p.branch_id=b.id and t.branch_id=b.id and t.status='ACTIVE' and t.registration_status='REGISTERED' and b.status='ACTIVE' and c.status='ACTIVE';
$$;
create or replace function public.require_terminal_staff_session() returns public.terminal_staff_sessions language plpgsql stable security definer set search_path=public as $$
declare s public.terminal_staff_sessions;
begin s:=public.current_terminal_staff_session(); if s.id is null then raise exception 'ACTIVE_STAFF_SESSION_REQUIRED'; end if; return s; end $$;
create or replace function public.begin_terminal_staff_session(p_actor uuid,p_staff_id uuid,p_device_identifier text,p_auth_session_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare t public.pos_terminals; p public.profiles; s public.terminal_staff_sessions;
begin
 select * into t from public.pos_terminals where device_identifier=p_device_identifier and status='ACTIVE' and registration_status='REGISTERED' for update;
 if not found then raise exception 'TERMINAL_INVALID'; end if;
 select * into p from public.profiles where id=p_staff_id and status='ACTIVE' and branch_id=t.branch_id;
 if not found then raise exception 'STAFF_BRANCH_ACCESS_DENIED'; end if;
 if not exists(select 1 from auth.sessions where id=p_auth_session_id and user_id=p_staff_id) then raise exception 'INVALID_AUTH_SESSION'; end if;
 if not exists(select 1 from public.branches b join public.companies c on c.id=b.company_id where b.id=t.branch_id and b.status='ACTIVE' and c.status='ACTIVE') then raise exception 'BRANCH_OR_COMPANY_INACTIVE'; end if;
 update public.terminal_staff_sessions set status='ENDED',ended_at=now() where terminal_id=t.id and status in ('ACTIVE','LOCKED');
 insert into public.terminal_staff_sessions(company_id,branch_id,terminal_id,staff_id,actor_auth_user_id,auth_session_id,role,permissions)
 values(t.company_id,t.branch_id,t.id,p.id,p_actor,p_auth_session_id,p.role_name,array(select pm.code from public.role_permissions rp join public.permissions pm on pm.id=rp.permission_id where rp.role_id=p.role_id)) returning * into s;
 update public.pos_terminals set last_seen_at=now() where id=t.id;
 return to_jsonb(s);
end $$;
revoke all on function public.begin_terminal_staff_session(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.begin_terminal_staff_session(uuid,uuid,text,uuid) to service_role;
revoke all on function public.current_terminal_staff_session(),public.require_terminal_staff_session() from public,anon;
grant execute on function public.current_terminal_staff_session(),public.require_terminal_staff_session() to authenticated,service_role;

create or replace function public.end_terminal_staff_session() returns void language sql security definer set search_path=public as $$
 update public.terminal_staff_sessions set status='ENDED',ended_at=now() where auth_session_id=nullif(auth.jwt()->>'session_id','')::uuid and staff_id=auth.uid() and status in ('ACTIVE','LOCKED');
$$;
create or replace function public.lock_terminal_staff_session() returns void language sql security definer set search_path=public as $$
 update public.terminal_staff_sessions set status='LOCKED',last_activity_at=now() where auth_session_id=nullif(auth.jwt()->>'session_id','')::uuid and staff_id=auth.uid() and status='ACTIVE';
$$;
revoke all on function public.end_terminal_staff_session(),public.lock_terminal_staff_session() from public,anon;
grant execute on function public.end_terminal_staff_session(),public.lock_terminal_staff_session() to authenticated;
-- Keep PIN throttling from the existing verifier, and restore only this session.
do $migration$
declare definition text;
begin
 select pg_get_functiondef('public.verify_own_terminal_lock_pin(text)'::regprocedure) into definition;
 definition:=replace(definition,'return true;', 'update public.terminal_staff_sessions set status=''ACTIVE'',last_activity_at=now() where auth_session_id=nullif(auth.jwt()->>''session_id'','''')::uuid and staff_id=auth.uid() and status=''LOCKED''; return public.current_terminal_staff_session() is not null;');
 execute definition;
end $migration$;

-- Staff selector exposes only display and PIN status, never credential hashes.
drop function public.list_terminal_branch_staff(text);
create function public.list_terminal_branch_staff(p_device_identifier text) returns table(id uuid,name text,role text,pin_status text,pin_setup_required boolean,temporary_pin_required boolean) language plpgsql stable security definer set search_path=public as $$
declare t public.pos_terminals;
begin
 if not public.is_active_pos_user() then raise exception 'ACTIVE_PROFILE_REQUIRED'; end if;
 select * into t from public.pos_terminals where device_identifier=p_device_identifier and status='ACTIVE' and registration_status='REGISTERED';
 if not found or not exists(select 1 from public.branches b join public.companies c on c.id=b.company_id where b.id=t.branch_id and b.status='ACTIVE' and c.status='ACTIVE') then raise exception 'TERMINAL_INVALID'; end if;
 return query select p.id,p.name::text,p.role_name::text,coalesce(sc.status,'SETUP_REQUIRED'),sc.user_id is null or sc.status='SETUP_REQUIRED',sc.status='TEMPORARY_RESET' from public.profiles p left join public.staff_pin_credentials sc on sc.user_id=p.id where p.branch_id=t.branch_id and p.status='ACTIVE' order by p.name;
end $$;
revoke all on function public.list_terminal_branch_staff(text),public.resolve_registered_terminal(text),public.heartbeat_pos_terminal(uuid,text),public.verify_own_terminal_lock_pin(text) from public,anon;
grant execute on function public.list_terminal_branch_staff(text) to authenticated;
-- Legacy unscoped staff enumeration is no longer an operational entry point.
revoke execute on function public.list_pos_staff() from authenticated;

alter table public.orders add column if not exists terminal_id uuid references public.pos_terminals(id) on delete restrict, add column if not exists staff_session_id uuid references public.terminal_staff_sessions(id) on delete restrict;
alter table public.payments add column if not exists terminal_id uuid references public.pos_terminals(id) on delete restrict, add column if not exists staff_session_id uuid references public.terminal_staff_sessions(id) on delete restrict;
create index if not exists orders_branch_created_idx on public.orders(branch_id,created_at desc);
create index if not exists payments_branch_created_idx on public.payments(branch_id,created_at desc);
-- Existing user_id is the staff identity; company is resolved through branch.
-- Historical terminal attribution stays NULL rather than inventing a device.
create or replace function public.assign_order_branch_id() returns trigger language plpgsql security definer set search_path=public as $$
declare s public.terminal_staff_sessions; cfg jsonb;
begin
 s:=public.require_terminal_staff_session();
 new.branch_id:=s.branch_id; new.terminal_id:=s.terminal_id; new.staff_session_id:=s.id; new.user_id:=s.staff_id;
 if (select terminal_type from public.pos_terminals where id=s.terminal_id)<>'POS' then raise exception 'POS_TERMINAL_REQUIRED'; end if;
 if new.restaurant_table_id is not null and not exists(select 1 from public.restaurant_tables where id=new.restaurant_table_id and branch_id=s.branch_id and is_active) then raise exception 'TABLE_BRANCH_MISMATCH'; end if;
 cfg:=public.effective_branch_settings(s.branch_id);
 if new.dining_mode='dine-in' and coalesce((cfg#>>'{pos,dineInEnabled}')::boolean,true)=false then raise exception 'DINE_IN_DISABLED'; end if;
 if new.dining_mode='takeaway' and coalesce((cfg#>>'{pos,takeawayEnabled}')::boolean,true)=false then raise exception 'TAKEAWAY_DISABLED'; end if;
 return new;
end $$;
-- Enforce context before financial snapshot triggers (trigger names sort).
drop trigger if exists trg_assign_order_branch_id on public.orders;
create trigger a_order_operational_context before insert on public.orders for each row execute function public.assign_order_branch_id();
create or replace function public.assign_payment_branch_id() returns trigger language plpgsql security definer set search_path=public as $$
declare s public.terminal_staff_sessions; order_branch uuid; cfg jsonb;
begin
 s:=public.require_terminal_staff_session();
 select branch_id into order_branch from public.orders where id=new.order_id;
 if order_branch is distinct from s.branch_id then raise exception 'ORDER_BRANCH_MISMATCH'; end if;
 new.branch_id:=order_branch;new.terminal_id:=s.terminal_id;new.staff_session_id:=s.id;new.user_id:=s.staff_id;
 cfg:=public.effective_branch_settings(s.branch_id);
 if new.status in ('PAID','SUCCESS') then
  if new.payment_method='CASH' and not coalesce((cfg#>>'{payment,cashEnabled}')::boolean,true) or new.payment_method='CARD' and not coalesce((cfg#>>'{payment,cardEnabled}')::boolean,true) or new.payment_method='QR' and not coalesce((cfg#>>'{payment,qrEnabled}')::boolean,true) then raise exception 'PAYMENT_METHOD_DISABLED'; end if;
  if coalesce((cfg#>>'{payment,referenceRequired}')::boolean,false) and new.payment_method<>'CASH' and nullif(trim(coalesce(new.optional_reference_no,new.transaction_reference,new.reference)), '') is null then raise exception 'PAYMENT_REFERENCE_REQUIRED'; end if;
  if coalesce(new.split_type,'FULL')<>'FULL' and (not coalesce((cfg#>>'{pos,splitPaymentEnabled}')::boolean,true) or not coalesce((cfg#>>'{payment,splitPaymentEnabled}')::boolean,true)) then raise exception 'SPLIT_PAYMENT_DISABLED'; end if;
 end if;
 return new;
end $$;
-- Update paths include pending QR becoming paid; reuse the same authority.
drop trigger if exists trg_assign_payment_branch_id on public.payments;
create trigger a_payment_operational_context before insert or update of status on public.payments for each row execute function public.assign_payment_branch_id();

create or replace function public.can_read_pos_order(p_order_id uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.orders o where o.id=p_order_id and public.can_access_branch(o.branch_id) and (public.current_pos_role() in ('ADMIN','MANAGER','WAITER') or public.current_pos_role()='KITCHEN' and (o.status in ('CONFIRMED','PREPARING','READY') or exists(select 1 from public.order_items i where i.order_id=o.id and i.item_status in ('SUBMITTED','PREPARING','READY')))));
$$;
create policy branch_payment_scope on public.payments as restrictive for select to authenticated using(public.can_access_branch(branch_id));
create policy branch_table_scope on public.restaurant_tables as restrictive for all to authenticated using(public.can_access_branch(branch_id)) with check(public.can_access_branch(branch_id));
create policy branch_audit_scope on public.audit_logs as restrictive for select to authenticated using(public.can_access_branch(branch_id));

-- Guard all existing order mutations, including security-definer RPCs that bypass RLS.
create or replace function public.guard_order_branch_mutation() returns trigger language plpgsql security definer set search_path=public as $$
declare s public.terminal_staff_sessions;
begin
 if auth.uid() is null then return new; end if;
 s:=public.require_terminal_staff_session();
 if old.branch_id is distinct from s.branch_id then raise exception 'ORDER_BRANCH_MISMATCH'; end if;
 if new.branch_id is distinct from old.branch_id or new.terminal_id is distinct from old.terminal_id or new.staff_session_id is distinct from old.staff_session_id or new.user_id is distinct from old.user_id then raise exception 'ORDER_CONTEXT_IMMUTABLE'; end if;
 return new;
end $$;
create trigger a_order_branch_guard before update on public.orders for each row execute function public.guard_order_branch_mutation();
commit;
