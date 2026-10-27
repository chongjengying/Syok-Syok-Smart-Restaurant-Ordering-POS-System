begin;

alter table public.pos_terminals add column if not exists retired_at timestamptz;
alter table public.pos_terminals add column if not exists retired_by uuid references public.profiles(id) on delete set null;
alter table public.pos_terminals add column if not exists retirement_reason text;
alter table public.pos_terminals drop constraint if exists pos_terminals_status_check;
alter table public.pos_terminals add constraint pos_terminals_status_check check(status in ('CREATED','ACTIVE','INACTIVE','ARCHIVED','RETIRED'));

do $$
declare definition text;
begin
  select pg_get_functiondef('public.transition_pos_terminal(uuid,text,text)'::regprocedure) into definition;
  definition := replace(definition, 'if t.status=''ARCHIVED'' then raise exception ''TERMINAL_RETIRED''; end if;', 'if t.status in (''ARCHIVED'',''RETIRED'') then raise exception ''TERMINAL_RETIRED''; end if;');
  definition := replace(definition, 'set status=''ARCHIVED'',', 'set status=''RETIRED'', retired_at=now(), retired_by=auth.uid(), retirement_reason=nullif(btrim(coalesce(p_device_identifier,'''')),''''),');
  definition := replace(definition, 'if t.registration_status=''REVOKED'' or t.status=''ARCHIVED'' then raise exception ''TERMINAL_RETIRED_OR_REVOKED''; end if;', 'if t.registration_status=''REVOKED'' or t.status in (''ARCHIVED'',''RETIRED'') then raise exception ''TERMINAL_RETIRED_OR_REVOKED''; end if;');
  execute definition;
end $$;

do $$
declare definition text;
begin
  select pg_get_functiondef('public.create_terminal_activation_code(uuid,boolean)'::regprocedure) into definition;
  definition := replace(definition, 'if t.status=''ARCHIVED'' or t.registration_status=''REVOKED'' then', 'if t.status=''RETIRED'' then raise exception ''TERMINAL_RETIRED''; end if; if t.status=''ARCHIVED'' or t.registration_status=''REVOKED'' then');
  execute definition;
end $$;

do $$
declare definition text;
begin
  select pg_get_functiondef('public.activate_terminal_with_code(text,text)'::regprocedure) into definition;
  definition := replace(definition, 'if t.status=''ARCHIVED'' or t.registration_status=''REVOKED'' then', 'if t.status in (''ARCHIVED'',''RETIRED'') or t.registration_status=''REVOKED'' then');
  execute definition;
end $$;

create or replace function public.sync_terminal_device_assignment()
returns trigger language plpgsql security definer set search_path=public as $$
declare reason text;
begin
  if new.device_identifier is distinct from old.device_identifier or new.registration_status is distinct from old.registration_status or new.status is distinct from old.status then
    if old.device_identifier is not null and (new.device_identifier is distinct from old.device_identifier or new.registration_status in ('REVOKED','UNREGISTERED') or new.status in ('RETIRED','ARCHIVED')) then
      reason := case when new.status in ('RETIRED','ARCHIVED') then 'TERMINAL_RETIRED' when new.registration_status='REVOKED' then 'TERMINAL_REVOKED' else 'DEVICE_REASSIGNED' end;
      update public.terminal_device_assignments set status='REVOKED', revoked_at=coalesce(revoked_at,now()), revoked_by=coalesce(auth.uid(),revoked_by), revoke_reason=coalesce(revoke_reason,reason) where terminal_id=old.id and status='ACTIVE';
    end if;
    if new.device_identifier is not null and new.registration_status='REGISTERED' and new.status not in ('RETIRED','ARCHIVED') and not exists (select 1 from public.terminal_device_assignments where terminal_id=new.id and status='ACTIVE') then
      insert into public.terminal_device_assignments(terminal_id,device_identifier,assigned_at,activated_at,status) values(new.id,new.device_identifier,coalesce(new.registered_at,now()),coalesce(new.activated_at,new.registered_at,now()),'ACTIVE');
    end if;
  end if;
  return new;
end $$;

commit;
