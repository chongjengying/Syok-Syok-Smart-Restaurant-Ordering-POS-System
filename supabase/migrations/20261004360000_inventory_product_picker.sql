begin;
create function public.list_inventory_products(p_branch_id uuid) returns table(id uuid,product_name text,product_code varchar)
language plpgsql stable security definer set search_path=public as $$
declare company uuid;
begin
 if not public.has_pos_permission('inventory.view') then raise exception 'INSUFFICIENT_PERMISSION' using errcode='42501'; end if;
 company:=public.require_inventory_branch(p_branch_id);
 return query select p.id,p.product_name,p.product_code from public.products p
 where p.company_id=company and p.status and (p.branch_id is null or p.branch_id=p_branch_id) order by p.product_name,p.id;
end $$;
revoke all on function public.list_inventory_products(uuid) from public,anon;
grant execute on function public.list_inventory_products(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
