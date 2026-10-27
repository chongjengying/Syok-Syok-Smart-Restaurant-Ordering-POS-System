\set ON_ERROR_STOP on
begin;
insert into public.companies(id,code,name,tax_type) values
 ('a0510000-0000-0000-0000-000000000001','QA_DISC_A','Discount A','TAX_EXEMPT'),
 ('a0510000-0000-0000-0000-000000000002','QA_DISC_B','Discount B','TAX_EXEMPT');
insert into public.branches(id,company_id,code,name) values
 ('a0510000-0000-0000-0000-000000000011','a0510000-0000-0000-0000-000000000001','QA_DISC_A','Discount A'),
 ('a0510000-0000-0000-0000-000000000012','a0510000-0000-0000-0000-000000000002','QA_DISC_B','Discount B');
insert into auth.users(id) values('a0510000-0000-0000-0000-000000000021'),('a0510000-0000-0000-0000-000000000022');
insert into public.profiles(id,name,company_id,branch_id,role_id,role_name,status)
select 'a0510000-0000-0000-0000-000000000021','Discount QA',company_id,'a0510000-0000-0000-0000-000000000011',id,name,'ACTIVE'
from public.roles where company_id='a0510000-0000-0000-0000-000000000001' and name='ADMIN'
on conflict(id) do update set company_id=excluded.company_id,branch_id=excluded.branch_id,role_id=excluded.role_id,role_name=excluded.role_name,status='ACTIVE';
insert into public.profiles(id,name,company_id,branch_id,role_id,role_name,status)
select 'a0510000-0000-0000-0000-000000000022','Foreign storage QA',company_id,'a0510000-0000-0000-0000-000000000012',id,name,'ACTIVE'
from public.roles where company_id='a0510000-0000-0000-0000-000000000002' and name='ADMIN'
on conflict(id) do update set company_id=excluded.company_id,branch_id=excluded.branch_id,role_id=excluded.role_id,role_name=excluded.role_name,status='ACTIVE';
insert into storage.objects(id,bucket_id,name,owner,owner_id) values
 ('a0510000-0000-0000-0000-000000000071','product-images','products/PRD-999991/a0510000-0000-0000-0000-000000000071.webp','a0510000-0000-0000-0000-000000000021','a0510000-0000-0000-0000-000000000021'),
 ('a0510000-0000-0000-0000-000000000072','product-images','products/PRD-999992/a0510000-0000-0000-0000-000000000072.webp','a0510000-0000-0000-0000-000000000022','a0510000-0000-0000-0000-000000000022');
insert into public.promotions(id,name,promotion_type,discount_value,company_id) values
 ('a0510000-0000-0000-0000-000000000031','Own promotion','FIXED_AMOUNT_DISCOUNT',1,'a0510000-0000-0000-0000-000000000001'),
 ('a0510000-0000-0000-0000-000000000032','Foreign promotion','FIXED_AMOUNT_DISCOUNT',1,'a0510000-0000-0000-0000-000000000002');
insert into public.promotion_targets(promotion_id,target_type) values('a0510000-0000-0000-0000-000000000032','ORDER');
insert into public.categories(id,name,company_id,branch_id) values('a0510000-0000-0000-0000-000000000051','Foreign target category','a0510000-0000-0000-0000-000000000002','a0510000-0000-0000-0000-000000000012');
insert into public.company_einvoice_profiles(id,company_id,legal_name,tin,registration_number) values
 ('a0510000-0000-0000-0000-000000000061','a0510000-0000-0000-0000-000000000001','Own QA Tax Profile','QA-TIN-A','QA-REG-A'),
 ('a0510000-0000-0000-0000-000000000062','a0510000-0000-0000-0000-000000000002','Foreign QA Tax Profile','QA-TIN-B','QA-REG-B');
insert into public.role_permissions(role_id,permission_id) select r.id,p.id from public.roles r cross join public.permissions p where r.company_id='a0510000-0000-0000-0000-000000000001' and r.name='ADMIN' and p.code='einvoice.company.manage' on conflict do nothing;
insert into public.vouchers(id,code,name,voucher_type,value,min_spend,status,starts_at,expires_at,company_id) values
 ('a0510000-0000-0000-0000-000000000041','QA-DISC-A','Own voucher','FIXED',1,0,'ACTIVE',now()-interval '1 day',now()+interval '1 day','a0510000-0000-0000-0000-000000000001'),
 ('a0510000-0000-0000-0000-000000000042','QA-DISC-B','Foreign voucher','FIXED',1,0,'ACTIVE',now()-interval '1 day',now()+interval '1 day','a0510000-0000-0000-0000-000000000002');
select set_config('request.jwt.claims','{"sub":"a0510000-0000-0000-0000-000000000021","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','a0510000-0000-0000-0000-000000000021',true);
-- Controlled rollback fixture simulates the Storage API's internal deletion flag.
select set_config('storage.allow_delete_query','true',true);
set local role authenticated;
do $$ declare affected integer; begin
 delete from storage.objects where id='a0510000-0000-0000-0000-000000000072';
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'FOREIGN_STORAGE_DELETE_ALLOWED'; end if;
 delete from storage.objects where id='a0510000-0000-0000-0000-000000000071';
 get diagnostics affected=row_count;
 if affected<>1 then raise exception 'Own image cleanup failed'; end if;
 if exists(select 1 from public.promotions where company_id='a0510000-0000-0000-0000-000000000002') then raise exception 'FOREIGN_PROMOTION_VISIBLE'; end if;
 if exists(select 1 from public.vouchers where company_id='a0510000-0000-0000-0000-000000000002') then raise exception 'FOREIGN_VOUCHER_VISIBLE'; end if;
 if exists(select 1 from public.promotion_targets where promotion_id='a0510000-0000-0000-0000-000000000032') then raise exception 'FOREIGN_TARGET_VISIBLE'; end if;
 begin perform public.archive_promotion_admin('a0510000-0000-0000-0000-000000000032'); raise exception 'Foreign archive accepted'; exception when insufficient_privilege then null; end;
 begin perform public.delete_voucher_admin('a0510000-0000-0000-0000-000000000042'); raise exception 'Foreign voucher delete accepted'; exception when insufficient_privilege then null; end;
 begin perform public.validate_voucher('QA-DISC-B',10,null); raise exception 'Foreign voucher validation accepted'; exception when insufficient_privilege then null; end;
 if public.validate_voucher('QA-DISC-A',10,null)->>'code'<>'QA-DISC-A' then raise exception 'Own voucher validation failed'; end if;
 begin insert into public.promotion_targets(promotion_id,target_type,category_id) values('a0510000-0000-0000-0000-000000000031','CATEGORY','a0510000-0000-0000-0000-000000000051'); raise exception 'Foreign target assignment accepted'; exception when raise_exception then if sqlerrm<>'DISCOUNT_TARGET_COMPANY_MISMATCH' then raise; end if; end;
 begin perform public.einvoice_profile_set_status('a0510000-0000-0000-0000-000000000062','DISABLED'); raise exception 'Foreign e-invoice mutation accepted'; exception when insufficient_privilege then null; end;
 perform public.einvoice_profile_set_status('a0510000-0000-0000-0000-000000000061','DISABLED');
 begin insert into public.promotions(name,promotion_type,discount_value,company_id) values('Spoof','FIXED_AMOUNT_DISCOUNT',1,'a0510000-0000-0000-0000-000000000002'); raise exception 'Company spoof accepted'; exception when insufficient_privilege then null; end;
 perform public.archive_promotion_admin('a0510000-0000-0000-0000-000000000031');
 perform public.delete_voucher_admin('a0510000-0000-0000-0000-000000000041');
 raise notice 'VERIFIED PASS: branchless discount/target RLS, IDOR archive/delete/validation, company spoof and own lifecycle';
end $$;
reset role;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$ begin
 begin perform public.validate_voucher('QA-DISC-B',10,null); raise exception 'Anonymous voucher metadata exposed'; exception when insufficient_privilege then null; end;
 if has_function_privilege('anon','public.write_kitchen_ticket_event(public.order_item_batches,text,text,jsonb)','EXECUTE') then raise exception 'Anonymous internal event writer exposed'; end if;
 raise notice 'VERIFIED PASS: anonymous voucher access and internal event writer denied';
end $$;
reset role;
do $$ begin
 if not exists(select 1 from public.promotions where id='a0510000-0000-0000-0000-000000000032') or not exists(select 1 from public.vouchers where id='a0510000-0000-0000-0000-000000000042') then raise exception 'Foreign records changed'; end if;
end $$;
rollback;
