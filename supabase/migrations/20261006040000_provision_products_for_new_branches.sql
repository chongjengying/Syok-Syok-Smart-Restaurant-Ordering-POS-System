begin;

-- Product creation already provisions every existing company branch. Apply
-- the same rule when a branch is created after its company products.
create function public.provision_company_products_to_branch()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.branch_products(company_id, branch_id, product_id, available, sold_out)
  select new.company_id, new.id, p.id, true, not p.is_available
  from public.products p where p.company_id = new.company_id
  on conflict (branch_id, product_id) do nothing;
  return new;
end;
$$;
revoke all on function public.provision_company_products_to_branch() from public, anon, authenticated;
create trigger branch_product_provisioning
after insert on public.branches
for each row execute function public.provision_company_products_to_branch();

-- Fill only missing assignments; preserve explicit branch availability,
-- sold-out state, and price overrides already chosen by administrators.
insert into public.branch_products(company_id, branch_id, product_id, available, sold_out)
select b.company_id, b.id, p.id, true, not p.is_available
from public.branches b join public.products p on p.company_id = b.company_id
on conflict (branch_id, product_id) do nothing;

commit;
