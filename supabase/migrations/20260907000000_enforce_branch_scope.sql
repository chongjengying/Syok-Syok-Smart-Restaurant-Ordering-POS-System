-- Give every operational/configurable POS entity an explicit branch scope.
alter table public.categories add column if not exists branch_id uuid references public.branches(id) on delete restrict;
alter table public.products add column if not exists branch_id uuid references public.branches(id) on delete restrict;
alter table public.restaurant_tables add column if not exists branch_id uuid references public.branches(id) on delete restrict;
alter table public.vouchers add column if not exists branch_id uuid references public.branches(id) on delete restrict;
update public.categories set branch_id=(select id from public.branches where code='MAIN') where branch_id is null;
update public.products set branch_id=(select id from public.branches where code='MAIN') where branch_id is null;
update public.restaurant_tables set branch_id=(select id from public.branches where code='MAIN') where branch_id is null;
update public.vouchers set branch_id=(select id from public.branches where code='MAIN') where branch_id is null;
create index if not exists categories_branch_idx on public.categories(branch_id);
create index if not exists products_branch_idx on public.products(branch_id);
create index if not exists tables_branch_idx on public.restaurant_tables(branch_id);
create index if not exists vouchers_branch_idx on public.vouchers(branch_id);

create or replace function public.assign_user_branch(p_user_id uuid, p_branch_id uuid)
returns public.profiles language plpgsql security definer set search_path=public as $$
declare result public.profiles%rowtype;
begin
  if not public.has_pos_permission('user.edit') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if not exists(select 1 from public.branches where id=p_branch_id and status='ACTIVE') then raise exception 'INVALID_BRANCH'; end if;
  update public.profiles set branch_id=p_branch_id, updated_at=now() where id=p_user_id returning * into result;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  perform public.write_pos_audit_diff('USER_BRANCH_ASSIGNED','PROFILE',p_user_id,null,null,jsonb_build_object('branchId',p_branch_id));
  return result;
end $$;
grant execute on function public.assign_user_branch(uuid,uuid) to authenticated;
