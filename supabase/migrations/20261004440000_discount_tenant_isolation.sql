begin;
create policy promotion_company_boundary on public.promotions as restrictive for all to authenticated
 using(company_id=public.current_user_company_id() and (branch_id is null or public.can_access_branch(branch_id)))
 with check(company_id=public.current_user_company_id() and (branch_id is null or public.can_access_branch(branch_id)));
create policy voucher_company_boundary on public.vouchers as restrictive for all to authenticated
 using(company_id=public.current_user_company_id() and (branch_id is null or public.can_access_branch(branch_id)))
 with check(company_id=public.current_user_company_id() and (branch_id is null or public.can_access_branch(branch_id)));
create policy promotion_target_company_boundary on public.promotion_targets as restrictive for all to authenticated
 using(exists(select 1 from public.promotions p where p.id=promotion_id and p.company_id=public.current_user_company_id() and (p.branch_id is null or public.can_access_branch(p.branch_id))))
 with check(exists(select 1 from public.promotions p where p.id=promotion_id and p.company_id=public.current_user_company_id() and (p.branch_id is null or public.can_access_branch(p.branch_id))));

create function public.guard_discount_owner() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.company_id is null then raise exception 'DISCOUNT_COMPANY_REQUIRED'; end if;
 if tg_op='UPDATE' and new.company_id is distinct from old.company_id then raise exception 'DISCOUNT_OWNER_IMMUTABLE'; end if;
 if auth.uid() is not null and new.company_id is distinct from public.current_user_company_id() then raise exception 'DISCOUNT_NOT_FOUND_OR_FORBIDDEN' using errcode='42501'; end if;
 if new.branch_id is not null and not exists(select 1 from public.branches b where b.id=new.branch_id and b.company_id=new.company_id) then raise exception 'DISCOUNT_BRANCH_COMPANY_MISMATCH'; end if;
 if tg_table_name='vouchers' then
  if exists(select 1 from unnest(new.eligible_product_ids) id where not exists(select 1 from public.products p where p.id=id and p.company_id=new.company_id))
  or exists(select 1 from unnest(new.eligible_category_ids) id where not exists(select 1 from public.categories c where c.id=id and c.company_id=new.company_id))
  then raise exception 'DISCOUNT_TARGET_COMPANY_MISMATCH'; end if;
 end if;
 return new;
end $$;
create trigger zz_promotion_owner_guard before insert or update on public.promotions for each row execute function public.guard_discount_owner();
create trigger zz_voucher_owner_guard before insert or update on public.vouchers for each row execute function public.guard_discount_owner();
create function public.guard_promotion_target_owner() returns trigger language plpgsql security definer set search_path=public as $$
declare company uuid;
begin
 select company_id into company from public.promotions where id=new.promotion_id;
 if company is null then raise exception 'PROMOTION_NOT_FOUND'; end if;
 if auth.uid() is not null and company is distinct from public.current_user_company_id() then raise exception 'DISCOUNT_NOT_FOUND_OR_FORBIDDEN' using errcode='42501'; end if;
 if new.product_id is not null and not exists(select 1 from public.products where id=new.product_id and company_id=company)
 or new.category_id is not null and not exists(select 1 from public.categories where id=new.category_id and company_id=company)
 then raise exception 'DISCOUNT_TARGET_COMPANY_MISMATCH'; end if;
 return new;
end $$;
create trigger promotion_target_owner_guard before insert or update on public.promotion_targets for each row execute function public.guard_promotion_target_owner();
revoke all on function public.guard_discount_owner(),public.guard_promotion_target_owner() from public,anon,authenticated;

do $$ declare definition text; name text; begin
 foreach name in array array['archive_promotion_admin','delete_voucher_admin'] loop
  select pg_get_functiondef(oid) into definition from pg_proc where pronamespace='public'::regnamespace and proname=name;
  if name='archive_promotion_admin' then
   definition:=replace(definition,'  select exists(select 1 from public.order_adjustments',E'  perform 1 from public.promotions where id=p_promotion_id and company_id=public.current_user_company_id() and (branch_id is null or public.can_access_branch(branch_id)) for update;\n  if not found then raise exception \'DISCOUNT_NOT_FOUND_OR_FORBIDDEN\' using errcode=\'42501\'; end if;\n  select exists(select 1 from public.order_adjustments');
  else
   definition:=replace(definition,'  select exists(select 1 from public.voucher_redemptions',E'  perform 1 from public.vouchers where id=p_voucher_id and company_id=public.current_user_company_id() and (branch_id is null or public.can_access_branch(branch_id)) for update;\n  if not found then raise exception \'DISCOUNT_NOT_FOUND_OR_FORBIDDEN\' using errcode=\'42501\'; end if;\n  select exists(select 1 from public.voucher_redemptions');
  end if;
  if strpos(definition,'DISCOUNT_NOT_FOUND_OR_FORBIDDEN')=0 then raise exception 'DISCOUNT_PATCH_TARGET_MISSING'; end if;
  execute definition;
 end loop;
 select pg_get_functiondef('public.validate_voucher(text,numeric,text)'::regprocedure) into definition;
 definition:=replace(definition,E'begin\n select * into v',E'begin\n if not public.has_pos_permission(\'voucher.apply\') then raise exception \'INSUFFICIENT_PERMISSION\' using errcode=\'42501\'; end if;\n select * into v');
 definition:=replace(definition,'where lower(code)=lower(trim(p_code))','where company_id=public.current_user_company_id() and (branch_id is null or public.can_access_branch(branch_id)) and lower(code)=lower(trim(p_code))');
 definition:=replace(definition,'raise exception ''Voucher not found''','raise exception ''DISCOUNT_NOT_FOUND_OR_FORBIDDEN'' using errcode=''42501''');
 if strpos(definition,'has_pos_permission')=0 then raise exception 'VOUCHER_PATCH_TARGET_MISSING'; end if;
 execute definition;
 foreach name in array array['get_available_vouchers','get_order_vouchers'] loop
  select pg_get_functiondef(oid) into definition from pg_proc where pronamespace='public'::regnamespace and proname=name;
  definition:=replace(definition,'where id=p_order_id','where id=p_order_id and company_id=public.current_user_company_id() and public.can_access_branch(branch_id)');
  definition:=replace(definition,'raise exception ''ORDER_NOT_FOUND''','raise exception ''ORDER_NOT_FOUND'' using errcode=''42501''');
  definition:=replace(definition,'where v.status=''ACTIVE''','where v.company_id=o.company_id and (v.branch_id is null or v.branch_id=o.branch_id) and v.status=''ACTIVE''');
  definition:=replace(definition,'where (branch_id is null or branch_id=o.branch_id)','where company_id=o.company_id and (branch_id is null or branch_id=o.branch_id)');
  execute definition;
 end loop;
end $$;
revoke all on function public.validate_voucher(text,numeric,text),public.get_available_vouchers(uuid,text),public.get_order_vouchers(uuid,text),public.archive_promotion_admin(uuid),public.delete_voucher_admin(uuid) from public,anon;
grant execute on function public.validate_voucher(text,numeric,text),public.get_available_vouchers(uuid,text),public.get_order_vouchers(uuid,text),public.archive_promotion_admin(uuid),public.delete_voucher_admin(uuid) to authenticated;
revoke all on function public.write_kitchen_ticket_event(public.order_item_batches,text,text,jsonb) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
