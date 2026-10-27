begin;

-- New Auth users are provisioned as inactive profiles before an administrator
-- assigns their final branch. Keep that bootstrap valid when the company code
-- changes, while never accepting a company id from the browser.
create or replace function public.profile_company_default()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.company_id is null then
    new.company_id := coalesce(
      (select b.company_id from public.branches b where b.id = new.branch_id),
      (select c.id from public.companies c where c.status = 'ACTIVE' order by c.created_at asc limit 1)
    );
  end if;
  return new;
end;
$$;

commit;
