\set ON_ERROR_STOP on
begin;
set transaction read only;
select 'public_rls_tables' check_name,count(*) total,count(*) filter(where relrowsecurity) protected
from pg_class where relnamespace='public'::regnamespace and relkind='r';
select 'function_exposure' check_name,count(*) total,count(*) filter(where prosecdef) definers,
 count(*) filter(where prosecdef and proconfig is null) missing_search_path,
 count(*) filter(where prosecdef and has_function_privilege('anon',oid,'EXECUTE')) anon_definers
from pg_proc where pronamespace='public'::regnamespace;
select 'constraint_not_validated' check_name,conrelid::regclass relation,conname from pg_constraint where connamespace='public'::regnamespace and not convalidated;
do $$ declare fk record; condition text; nonnull text; orphans bigint; checked integer:=0; failures integer:=0;
begin
 for fk in select * from pg_constraint where connamespace='public'::regnamespace and contype='f' loop
  select string_agg(format('child.%I=parent.%I',a.attname,b.attname),' and ' order by keys.n),
   string_agg(format('child.%I is not null',a.attname),' and ' order by keys.n)
  into condition,nonnull
  from unnest(fk.conkey,fk.confkey) with ordinality keys(child_key,parent_key,n)
  join pg_attribute a on a.attrelid=fk.conrelid and a.attnum=keys.child_key
  join pg_attribute b on b.attrelid=fk.confrelid and b.attnum=keys.parent_key;
  execute format('select count(*) from %s child where %s and not exists(select 1 from %s parent where %s)',fk.conrelid::regclass,nonnull,fk.confrelid::regclass,condition) into orphans;
  checked:=checked+1;
  if orphans>0 then failures:=failures+1; raise notice 'VERIFIED FAIL: orphan FK % on % count %',fk.conname,fk.conrelid::regclass,orphans; end if;
 end loop;
 raise notice 'Foreign keys checked %, failing relationships %',checked,failures;
 if failures>0 then raise exception 'DATABASE_RELATIONSHIP_INTEGRITY_FAILED'; end if;
end $$;
do $$ declare issue record; begin
if exists(select 1 from pg_class where relnamespace='public'::regnamespace and relkind='r' and not relrowsecurity)
  or exists(select 1 from pg_proc where pronamespace='public'::regnamespace and prosecdef and proconfig is null) then
 raise exception 'DATABASE_SECURITY_CONFIGURATION_FAILED';
end if;
for issue in select 'terminal_branch_company' check_name,count(*) invalid from pos_terminals t join branches b on b.id=t.branch_id where t.company_id is distinct from b.company_id
union all select 'staff_role_company',count(*) from staff s join roles r on r.id=s.role_id where s.company_id is distinct from r.company_id
union all select 'profile_role_company',count(*) from profiles s join roles r on r.id=s.role_id where s.company_id is distinct from r.company_id
union all select 'product_category_company',count(*) from products p join categories c on c.id=p.category_id where p.company_id is distinct from c.company_id
union all select 'inventory_owner',count(*) from inventory_items i join products p on p.id=i.product_id join branches b on b.id=i.branch_id where i.company_id is distinct from p.company_id or i.company_id is distinct from b.company_id
union all select 'negative_inventory',count(*) from inventory_items where stock_on_hand<0
union all select 'duplicate_open_shift',count(*) from (select terminal_id from cashier_shifts where status='OPEN' group by terminal_id having count(*)>1) x
union all select 'duplicate_active_binding',count(*) from (select terminal_id from terminal_device_assignments where status='ACTIVE' group by terminal_id having count(*)>1) x
union all select 'paid_without_payment',count(*) from orders o where payment_status='PAID' and not exists(select 1 from payments p where p.order_id=o.id and p.status='PAID')
union all select 'refund_over_paid',count(*) from orders o where (select coalesce(sum(amount),0) from refunds r where r.order_id=o.id and r.status='COMPLETED')>(select coalesce(sum(amount),0) from payments p where p.order_id=o.id and p.status='PAID')
union all select 'duplicate_receipt_number',count(*) from (select receipt_number from receipts group by receipt_number having count(*)>1) x
loop
 if issue.invalid>0 then raise exception 'DATABASE_INTEGRITY_FAILED: % count %',issue.check_name,issue.invalid; end if;
 raise notice 'VERIFIED PASS: %',issue.check_name;
end loop;
end $$;
rollback;
