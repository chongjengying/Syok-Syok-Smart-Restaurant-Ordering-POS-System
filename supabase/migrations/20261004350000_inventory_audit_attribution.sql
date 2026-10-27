begin;
do $patch$ declare d text; begin
 select pg_get_functiondef('public.attribute_pos_audit()'::regprocedure) into d;
 d:=replace(d,'  return new;',
  '  if new.entity_type=''INVENTORY'' then
    select i.company_id,i.branch_id into new.company_id,new.branch_id from public.inventory_items i where i.id=new.entity_id;
  end if;
  return new;');
 execute d;
end $patch$;
notify pgrst,'reload schema';
commit;
