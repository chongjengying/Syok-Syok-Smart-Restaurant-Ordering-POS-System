begin;
create extension if not exists pgcrypto with schema extensions;

alter table public.staff_pin_credentials alter column pin_hash drop not null;
alter table public.staff_pin_credentials add column if not exists status text not null default 'ACTIVE';
alter table public.staff_pin_credentials drop constraint if exists staff_pin_credentials_status_check;
alter table public.staff_pin_credentials add constraint staff_pin_credentials_status_check check(status in('SETUP_REQUIRED','TEMPORARY_RESET','ACTIVE'));

drop function if exists public.list_pos_staff();
create function public.list_pos_staff()
returns table(id uuid,name text,role text,pin_status text,pin_setup_required boolean,temporary_pin_required boolean)
language sql stable security definer set search_path=public as $$
 select p.id,p.name,r.name,c.status,c.status='SETUP_REQUIRED',c.status='TEMPORARY_RESET'
 from public.profiles p join public.roles r on r.id=p.role_id
 left join public.staff_pin_credentials c on c.user_id=p.id
 join auth.users u on u.id=p.id and u.email=p.email
 where public.is_active_pos_user() and p.status='ACTIVE' and p.email is not null
 and r.name in('ADMIN','MANAGER','WAITER','KITCHEN','CASHIER')
 order by case r.name when 'ADMIN' then 1 when 'MANAGER' then 2 when 'CASHIER' then 3 when 'WAITER' then 4 else 5 end,p.name
$$;

create or replace function public.require_staff_pin_setup(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare temporary_pin text; random_bytes bytea;
begin
 if not public.has_pos_permission('user.edit') then raise exception 'INSUFFICIENT_PERMISSION';end if;
 if not exists(select 1 from public.profiles where id=p_user_id and status<>'MISSING_PROFILE') then raise exception 'USER_NOT_FOUND';end if;
 random_bytes:=gen_random_bytes(4);
 temporary_pin:=lpad((((get_byte(random_bytes,0)::bigint<<24)+(get_byte(random_bytes,1)::bigint<<16)+(get_byte(random_bytes,2)::bigint<<8)+get_byte(random_bytes,3)::bigint)%1000000)::text,6,'0');
 insert into public.staff_pin_credentials(user_id,pin_hash,status,changed_by)
 values(p_user_id,crypt(temporary_pin,gen_salt('bf',12)),'TEMPORARY_RESET',auth.uid())
 on conflict(user_id) do update set pin_hash=excluded.pin_hash,status='TEMPORARY_RESET',failed_attempts=0,locked_until=null,changed_at=now(),changed_by=auth.uid();
 perform public.write_pos_audit('STAFF_PIN_RESET_REQUIRED','PROFILE',p_user_id,null,jsonb_build_object('credentialStatus','TEMPORARY_RESET'));
 return jsonb_build_object('temporaryPin',temporary_pin);
end $$;

create or replace function public.set_own_staff_pin(p_pin text) returns void
language plpgsql security definer set search_path=public,extensions as $$
begin
 if not public.is_active_pos_user() then raise exception 'ACTIVE_PROFILE_REQUIRED';end if;
 if not public.is_strong_staff_pin(p_pin) then raise exception 'INVALID_STAFF_PIN';end if;
 perform pg_advisory_xact_lock(hashtextextended('staff-pin-uniqueness',0));
 if exists(select 1 from public.staff_pin_credentials c where c.user_id<>auth.uid() and c.status='ACTIVE' and c.pin_hash is not null and c.pin_hash=crypt(p_pin,c.pin_hash)) then raise exception 'STAFF_PIN_ALREADY_IN_USE';end if;
 insert into public.staff_pin_credentials(user_id,pin_hash,status,changed_by) values(auth.uid(),crypt(p_pin,gen_salt('bf',12)),'ACTIVE',auth.uid())
 on conflict(user_id) do update set pin_hash=excluded.pin_hash,status='ACTIVE',failed_attempts=0,locked_until=null,changed_at=now(),changed_by=auth.uid();
 perform public.write_pos_audit('STAFF_PIN_CHANGED','PROFILE',auth.uid(),null,jsonb_build_object('credentialStatus','ACTIVE'));
end $$;

create or replace function public.verify_staff_pin_exchange(p_user_id uuid,p_pin text) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare c public.staff_pin_credentials%rowtype;p public.profiles%rowtype;n smallint;
begin
 if auth.role()<>'service_role' then raise exception 'INSUFFICIENT_PERMISSION';end if;
 if p_pin!~'^[0-9]{6}$' then return jsonb_build_object('ok',false,'code','INVALID_PIN');end if;
 perform pg_advisory_xact_lock(hashtextextended('staff-pin:'||p_user_id::text,0));
 select * into p from public.profiles where id=p_user_id;
 select * into c from public.staff_pin_credentials where user_id=p_user_id for update;
 if p.id is null or p.status<>'ACTIVE' then return jsonb_build_object('ok',false,'code','STAFF_UNAVAILABLE');end if;
 if c.user_id is null or c.status='SETUP_REQUIRED' or c.pin_hash is null then return jsonb_build_object('ok',false,'code','PIN_SETUP_REQUIRED');end if;
 if p.email is null or not exists(select 1 from auth.users u where u.id=p.id and u.email=p.email) then return jsonb_build_object('ok',false,'code','STAFF_AUTH_UNAVAILABLE');end if;
 if c.locked_until is not null and c.locked_until>now() then return jsonb_build_object('ok',false,'code','PIN_LOCKED');end if;
 if c.pin_hash<>crypt(p_pin,c.pin_hash) then
  n:=least(c.failed_attempts+1,20);update public.staff_pin_credentials set failed_attempts=n,locked_until=case when n>=5 then now()+interval '5 minutes' else null end where user_id=p_user_id;
  return jsonb_build_object('ok',false,'code',case when n>=5 then 'PIN_LOCKED' else 'INVALID_PIN' end);
 end if;
 update public.staff_pin_credentials set failed_attempts=0,locked_until=null where user_id=p_user_id;
 return jsonb_build_object('ok',true,'email',p.email,'pinResetRequired',c.status='TEMPORARY_RESET');
end $$;

revoke all on public.staff_pin_credentials from public,anon,authenticated;
grant all on public.staff_pin_credentials to service_role;
revoke all on function public.list_pos_staff(),public.require_staff_pin_setup(uuid),public.set_own_staff_pin(text),public.verify_staff_pin_exchange(uuid,text) from public,anon,authenticated;
grant execute on function public.list_pos_staff(),public.require_staff_pin_setup(uuid),public.set_own_staff_pin(text) to authenticated;
grant execute on function public.verify_staff_pin_exchange(uuid,text) to service_role;
commit;
