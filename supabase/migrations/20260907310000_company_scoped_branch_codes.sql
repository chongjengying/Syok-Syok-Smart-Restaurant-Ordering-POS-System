begin;

-- Branch codes are identifiers inside a company, not globally across all
-- tenants. Keep the existing company-qualified index as the single rule.
alter table public.branches drop constraint if exists branches_code_key;
drop index if exists public.branches_company_code_idx;
create unique index if not exists branches_company_code_unique on public.branches(company_id,code);
alter table public.branches drop constraint if exists branches_code_uppercase;
alter table public.branches add constraint branches_code_uppercase check(code=upper(code));

-- Company codes are also case-insensitive identifiers.
alter table public.companies drop constraint if exists companies_code_key;
create unique index if not exists companies_code_unique on public.companies(upper(code));
alter table public.companies drop constraint if exists companies_code_uppercase;
alter table public.companies add constraint companies_code_uppercase check(code=upper(code));

commit;
