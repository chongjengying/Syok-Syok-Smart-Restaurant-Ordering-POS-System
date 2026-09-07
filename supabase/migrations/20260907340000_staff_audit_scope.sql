begin;

create or replace function public.attribute_pos_audit()
returns trigger language plpgsql security definer set search_path=public as $$
declare s public.terminal_staff_sessions;
begin
  s:=public.current_terminal_staff_session();
  new.actor_auth_user_id:=coalesce(s.actor_auth_user_id,auth.uid(),new.actor_id);
  new.actor_staff_id:=s.staff_id;
  new.terminal_id:=s.terminal_id;
  if s.id is not null then new.branch_id:=s.branch_id;
  elsif new.entity_type='BRANCH' then new.branch_id:=new.entity_id;
  elsif new.entity_type='TERMINAL' then select branch_id into new.branch_id from public.pos_terminals where id=new.entity_id;
  elsif new.entity_type='PROFILE' then select branch_id into new.branch_id from public.profiles where id=new.entity_id;
  elsif new.entity_type='STAFF_BRANCH_ASSIGNMENT' then select branch_id into new.branch_id from public.staff_branch_assignments where id=new.entity_id;
  elsif new.entity_type='ORDER' then select branch_id into new.branch_id from public.orders where id=new.entity_id;
  elsif new.entity_type='PAYMENT' then select branch_id into new.branch_id from public.payments where id=new.entity_id;
  elsif new.entity_type='REFUND' then select o.branch_id into new.branch_id from public.refunds r join public.orders o on o.id=r.order_id where r.id=new.entity_id;
  elsif new.entity_type='RECEIPT' then select branch_id into new.branch_id from public.receipts where id=new.entity_id;
  end if;
  if new.entity_type='COMPANY' then new.company_id:=new.entity_id; new.branch_id:=null;
  else select company_id into new.company_id from public.branches where id=new.branch_id;
  end if;
  return new;
end $$;
commit;
