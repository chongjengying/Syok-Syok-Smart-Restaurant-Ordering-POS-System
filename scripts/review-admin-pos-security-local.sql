\set ON_ERROR_STOP on
begin;
insert into public.companies(id,code,name,tax_type) values
 ('a0990000-0000-0000-0000-000000000001','QA_REVIEW_A','Review A','TAX_EXEMPT'),
 ('a0990000-0000-0000-0000-000000000002','QA_REVIEW_B','Review B','TAX_EXEMPT');
insert into public.branches(id,company_id,code,name) values
 ('a0990000-0000-0000-0000-000000000011','a0990000-0000-0000-0000-000000000001','QA_REVIEW_A','Review A'),
 ('a0990000-0000-0000-0000-000000000012','a0990000-0000-0000-0000-000000000002','QA_REVIEW_B','Review B');
insert into auth.users(id) values ('a0990000-0000-0000-0000-000000000021');
insert into public.profiles(id,name,role_id,role_name,company_id,branch_id,status)
select 'a0990000-0000-0000-0000-000000000021','Review fixture',id,name,
 'a0990000-0000-0000-0000-000000000001','a0990000-0000-0000-0000-000000000011','ACTIVE'
from public.roles where name='ADMIN'
on conflict(id) do update set role_id=excluded.role_id,role_name=excluded.role_name,
 company_id=excluded.company_id,branch_id=excluded.branch_id,status='ACTIVE';
insert into public.categories(id,name,company_id,branch_id) values
 ('a0990000-0000-0000-0000-000000000030','QA review category B','a0990000-0000-0000-0000-000000000002','a0990000-0000-0000-0000-000000000012');
insert into public.products(id,category_id,product_name,cost_price,sell_price,company_id,branch_id)
values('a0990000-0000-0000-0000-000000000031','a0990000-0000-0000-0000-000000000030','Review product B',1,10,
 'a0990000-0000-0000-0000-000000000002','a0990000-0000-0000-0000-000000000012');
insert into public.inventory_items(id,branch_id,product_id,stock_on_hand)
values('a0990000-0000-0000-0000-000000000040','a0990000-0000-0000-0000-000000000012','a0990000-0000-0000-0000-000000000031',42);
insert into public.promotions(id,name,promotion_type,discount_value,company_id)
values('a0990000-0000-0000-0000-000000000050','Review company B promotion','FIXED_AMOUNT_DISCOUNT',1,'a0990000-0000-0000-0000-000000000002');
select set_config('request.jwt.claims','{"sub":"a0990000-0000-0000-0000-000000000021","role":"authenticated","session_id":"a0990000-0000-0000-0000-000000000091"}',true);
select set_config('request.jwt.claim.sub','a0990000-0000-0000-0000-000000000021',true);
set local role authenticated;
select 'Initial fixture role',public.current_pos_role();
select 'Fixture inventory permission',public.has_pos_permission('inventory.view');
select 'Other-company inventory visible',count(*) from public.inventory_items where id='a0990000-0000-0000-0000-000000000040';
select 'Other-company branchless promotion visible',count(*) from public.promotions where id='a0990000-0000-0000-0000-000000000050';
update public.profiles set company_id='a0990000-0000-0000-0000-000000000002' where id=auth.uid();
select 'Self-profile company reassignment',public.current_user_company_id()='a0990000-0000-0000-0000-000000000002'::uuid;
select 'Other-company branch now accessible',public.can_access_branch('a0990000-0000-0000-0000-000000000012');
select public.set_role_permissions((select id from public.roles where name='CASHIER'),array['user.edit']);
select 'Global CASHIER role now permits staff editing',exists(select 1 from public.role_permissions rp join public.roles r on r.id=rp.role_id join public.permissions p on p.id=rp.permission_id where r.name='CASHIER' and p.code='user.edit');
update public.profiles set role_id=(select id from public.roles where name='CASHIER'),role_name='CASHIER' where id=auth.uid();
select 'Protected profile role field changed without privileged write marker',role_name from public.profiles where id=auth.uid();
rollback;
