create table if not exists public.companies (
 id uuid primary key default gen_random_uuid(), code varchar(30) not null unique, name varchar(150) not null,
 registration_no text, currency_code char(3) not null default 'MYR', timezone text not null default 'Asia/Kuala_Lumpur',
 status text not null default 'ACTIVE' check(status in ('ACTIVE','INACTIVE')), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into public.companies(code,name) values('SYOK','Syok Syok Restaurant') on conflict(code) do nothing;
alter table public.branches add column if not exists company_id uuid references public.companies(id) on delete restrict;
update public.branches set company_id=(select id from public.companies where code='SYOK') where company_id is null;
alter table public.pos_terminals add column if not exists company_id uuid references public.companies(id) on delete restrict;
update public.pos_terminals t set company_id=b.company_id from public.branches b where t.branch_id=b.id and t.company_id is null;
alter table public.pos_terminals add column if not exists terminal_type text not null default 'POS' check(terminal_type in ('POS','KDS'));
create unique index if not exists branches_company_code_idx on public.branches(company_id,code);
create index if not exists terminals_company_branch_idx on public.pos_terminals(company_id,branch_id);
insert into public.permissions(code,module,description) values
('company.view','organization','View company setup'),('company.update','organization','Update company setup'),
('branch.view','organization','View branches'),('branch.create','organization','Create branches'),('branch.update','organization','Update branches'),('branch.deactivate','organization','Deactivate branches'),
('terminal.view','organization','View terminals'),('terminal.create','organization','Create terminals'),('terminal.update','organization','Update terminals'),('terminal.deactivate','organization','Deactivate terminals') on conflict(code) do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.name in ('ADMIN','OWNER') and p.module='organization' on conflict do nothing;
create or replace function public.save_company(p_payload jsonb) returns public.companies language plpgsql security definer set search_path=public as $$ declare r public.companies; begin if not public.has_pos_permission('company.update') then raise exception 'INSUFFICIENT_PERMISSION'; end if; update public.companies set name=coalesce(nullif(p_payload->>'name',''),name),registration_no=nullif(p_payload->>'registrationNo',''),currency_code=coalesce(nullif(p_payload->>'currencyCode',''),currency_code),timezone=coalesce(nullif(p_payload->>'timezone',''),timezone),updated_at=now() where code=coalesce(nullif(p_payload->>'code',''),code) returning * into r; if not found then raise exception 'COMPANY_NOT_FOUND'; end if; return r; end $$;
grant execute on function public.save_company(jsonb) to authenticated;
create or replace function public.create_branch(p_code text,p_name text,p_company_id uuid) returns public.branches language plpgsql security definer set search_path=public as $$ declare r public.branches; begin if not public.has_pos_permission('branch.create') then raise exception 'INSUFFICIENT_PERMISSION'; end if; if not exists(select 1 from public.companies where id=p_company_id and status='ACTIVE') then raise exception 'INVALID_COMPANY'; end if; insert into public.branches(code,name,company_id) values(upper(trim(p_code)),trim(p_name),p_company_id) returning * into r; return r; end $$;
grant execute on function public.create_branch(text,text,uuid) to authenticated;
