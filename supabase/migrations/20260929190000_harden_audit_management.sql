begin;

create or replace function public.sanitize_pos_audit() returns trigger
language plpgsql security definer set search_path=public as $$
declare blocked text[]:=array['password','password_hash','pin','pin_hash','temporaryPin','temporary_pin','activationCode','activation_code','secret','token','apiKey','api_key','accessToken','access_token'];
begin
  new.metadata:=coalesce(new.metadata,'{}'::jsonb)-blocked;
  new.old_value:=case when new.old_value is null then null else new.old_value-blocked end;
  new.new_value:=case when new.new_value is null then null else new.new_value-blocked end;
  new.device_context:=coalesce(new.device_context,'{}'::jsonb)-blocked;
  return new;
end;
$$;
revoke all on function public.sanitize_pos_audit() from public,anon,authenticated;
drop trigger if exists audit_logs_sanitize_sensitive_data on public.audit_logs;
create trigger audit_logs_sanitize_sensitive_data before insert on public.audit_logs for each row execute function public.sanitize_pos_audit();

create or replace function public.list_pos_audit_events(p_filters jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare f jsonb:=coalesce(p_filters,'{}'::jsonb); safe_limit integer:=least(greatest(coalesce(nullif(f->>'limit','')::integer,100),1),250); term text:=left(btrim(coalesce(f->>'search','')),100);
begin
  if not public.has_pos_permission('audit.view') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc) from (
    select a.id,a.action,a.entity_type,a.entity_id,a.reason,a.metadata,a.old_value,a.new_value,a.device_context,a.request_id,a.correlation_id,a.event_status,a.error_code,a.error_message,a.company_id,a.branch_id,a.terminal_id,a.staff_session_id,a.actor_auth_user_id,a.actor_staff_id,a.approved_by_staff_id,a.order_id,a.order_item_id,a.payment_id,a.receipt_id,a.created_at,coalesce(actor.name,'System') actor_name,actor.role_name actor_role,approver.name approved_by_name
    from public.audit_logs a left join public.profiles actor on actor.id=coalesce(a.actor_staff_id,a.actor_id) left join public.profiles approver on approver.id=a.approved_by_staff_id
    where ((a.branch_id is not null and public.can_access_branch(a.branch_id)) or (a.branch_id is null and a.company_id=public.current_user_company_id()))
      and (nullif(f->>'companyId','') is null or a.company_id=nullif(f->>'companyId','')::uuid) and (nullif(f->>'branchId','') is null or a.branch_id=nullif(f->>'branchId','')::uuid) and (nullif(f->>'terminalId','') is null or a.terminal_id=nullif(f->>'terminalId','')::uuid) and (nullif(f->>'staffId','') is null or coalesce(a.actor_staff_id,a.actor_id)=nullif(f->>'staffId','')::uuid) and (nullif(f->>'eventStatus','') is null or a.event_status=upper(f->>'eventStatus')) and (nullif(f->>'action','') is null or a.action=upper(f->>'action')) and (nullif(f->>'entityType','') is null or a.entity_type=upper(f->>'entityType')) and (nullif(f->>'dateFrom','') is null or a.created_at >= (f->>'dateFrom')::date) and (nullif(f->>'dateTo','') is null or a.created_at < ((f->>'dateTo')::date+1))
      and (term='' or a.action ilike '%'||term||'%' or a.entity_type ilike '%'||term||'%' or a.reason ilike '%'||term||'%' or a.entity_id::text=term or a.order_id::text=term or a.payment_id::text=term or a.receipt_id::text=term or actor.name ilike '%'||term||'%')
    order by a.created_at desc,a.id desc limit safe_limit
  ) x),'[]'::jsonb);
end;
$$;
revoke all on function public.list_pos_audit_events(jsonb) from public,anon;
grant execute on function public.list_pos_audit_events(jsonb) to authenticated;
commit;
