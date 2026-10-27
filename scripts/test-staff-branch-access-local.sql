\set ON_ERROR_STOP on
begin;

insert into public.companies (id, code, name, tax_type) values
  ('a0400000-0000-0000-0000-000000000001', 'QA_VIEW_A', 'View RLS A', 'TAX_EXEMPT'),
  ('a0400000-0000-0000-0000-000000000002', 'QA_VIEW_B', 'View RLS B', 'TAX_EXEMPT');
insert into public.branches (id, company_id, code, name) values
  ('a0400000-0000-0000-0000-000000000011', 'a0400000-0000-0000-0000-000000000001', 'QA_VIEW_A', 'View A'),
  ('a0400000-0000-0000-0000-000000000012', 'a0400000-0000-0000-0000-000000000002', 'QA_VIEW_B', 'View B');
insert into auth.users (id) values
  ('a0400000-0000-0000-0000-000000000021'),
  ('a0400000-0000-0000-0000-000000000022');
insert into public.profiles (id, name, role_id, role_name, company_id, branch_id)
select fixture.id, 'View RLS fixture', r.id, r.name, fixture.company_id, fixture.branch_id
from (values
  ('a0400000-0000-0000-0000-000000000021'::uuid, 'a0400000-0000-0000-0000-000000000001'::uuid, 'a0400000-0000-0000-0000-000000000011'::uuid),
  ('a0400000-0000-0000-0000-000000000022'::uuid, 'a0400000-0000-0000-0000-000000000002'::uuid, 'a0400000-0000-0000-0000-000000000012'::uuid)
) fixture(id, company_id, branch_id)
join public.roles r on r.name = 'CASHIER'
on conflict (id) do update set name=excluded.name, role_id=excluded.role_id,
  role_name=excluded.role_name, company_id=excluded.company_id, branch_id=excluded.branch_id;
insert into public.staff_branch_assignments (staff_id, branch_id, status) values
  ('a0400000-0000-0000-0000-000000000021', 'a0400000-0000-0000-0000-000000000011', 'ACTIVE'),
  ('a0400000-0000-0000-0000-000000000022', 'a0400000-0000-0000-0000-000000000012', 'INACTIVE');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0400000-0000-0000-0000-000000000021', true);
do $$
begin
  if not exists (select 1 from public.staff_branch_access where staff_id=auth.uid() and active) then
    raise exception 'Own active assignment is missing';
  end if;
  if exists (select 1 from public.staff_branch_access where branch_id='a0400000-0000-0000-0000-000000000012') then
    raise exception 'Cross-company assignment leaked';
  end if;
end;
$$;
select set_config('request.jwt.claim.sub', 'a0400000-0000-0000-0000-000000000022', true);
do $$
begin
  if not exists (select 1 from public.staff_branch_access where staff_id=auth.uid() and not active) then
    raise exception 'Inactive assignment mapping changed';
  end if;
  if exists (select 1 from public.staff_branch_access where branch_id='a0400000-0000-0000-0000-000000000011') then
    raise exception 'Reverse cross-company assignment leaked';
  end if;
end;
$$;
select set_config('request.jwt.claim.sub', 'a0400000-0000-0000-0000-000000000099', true);
do $$
begin
  if exists (select 1 from public.staff_branch_access) then
    raise exception 'Unrecognized identity can read assignments';
  end if;
end;
$$;
set local role anon;
do $$
begin
  begin
    perform 1 from public.staff_branch_access;
    raise exception 'Anonymous access unexpectedly allowed';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
rollback;
