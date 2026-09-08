begin;
do $$
declare definition text;
begin
  select pg_get_functiondef('public.evaluate_order_discounts(uuid,text)'::regprocedure) into definition;
  definition := replace(definition,
    'jsonb_agg(jsonb_build_object(''kind'',kind,''label'',label,''amount'',amount,''sourceId'',coalesce(voucher_id,promotion_id)) order by created_at) from public.order_adjustments where order_id=o.id and status=''APPLIED''',
    'jsonb_agg(jsonb_build_object(''kind'',a_result.kind,''label'',a_result.label,''amount'',a_result.amount,''sourceId'',coalesce(a_result.voucher_id,a_result.promotion_id)) order by a_result.created_at) from public.order_adjustments a_result where a_result.order_id=o.id and a_result.status=''APPLIED''');
  execute definition;
end $$;
commit;
