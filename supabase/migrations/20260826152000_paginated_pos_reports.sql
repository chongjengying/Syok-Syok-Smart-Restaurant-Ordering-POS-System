begin;

create or replace function public.get_pos_report_page_v1(
  p_report_id text,p_date_from date,p_date_to date,p_search text default null,p_sort_key text default null,
  p_sort_direction text default 'asc',p_limit integer default 50,p_offset integer default 0
)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare all_rows jsonb;page_rows jsonb;total bigint;safe_limit integer:=least(greatest(coalesce(p_limit,50),1),100);
  safe_offset integer:=greatest(coalesce(p_offset,0),0);needle text:=nullif(btrim(coalesce(p_search,'')),'');sort_key text:=nullif(regexp_replace(coalesce(p_sort_key,''),'[^a-zA-Z0-9_]','','g'),'');direction text:=case when lower(p_sort_direction)='desc' then 'desc' else 'asc' end;
begin
  if not public.has_pos_permission('report.view') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if lower(p_report_id)='product-sales' then all_rows:=public.get_paid_product_sales_report_v1(p_date_from,p_date_to);
  elsif lower(p_report_id)='category-sales' then all_rows:=public.get_paid_category_sales_report_v1(p_date_from,p_date_to);
  else all_rows:=public.get_pos_report_v1(p_report_id,p_date_from,p_date_to); end if;
  select count(*) into total from jsonb_array_elements(all_rows) element where needle is null or element::text ilike '%'||needle||'%';
  select coalesce(jsonb_agg(value order by sequence),'[]'::jsonb) into page_rows from (
    select element value,row_number() over(order by
      case when sort_key is null then ordinal end asc,
      case when direction='asc' and element->>sort_key ~ '^-?[0-9]+(\.[0-9]+)?$' then (element->>sort_key)::numeric end asc nulls last,
      case when direction='desc' and element->>sort_key ~ '^-?[0-9]+(\.[0-9]+)?$' then (element->>sort_key)::numeric end desc nulls last,
      case when direction='asc' then lower(element->>sort_key) end asc nulls last,
      case when direction='desc' then lower(element->>sort_key) end desc nulls last,
      ordinal asc) sequence
    from jsonb_array_elements(all_rows) with ordinality source(element,ordinal)
    where needle is null or element::text ilike '%'||needle||'%'
    order by sequence limit safe_limit offset safe_offset
  ) page;
  return jsonb_build_object('rows',page_rows,'total',total,'limit',safe_limit,'offset',safe_offset);
end; $$;

revoke all on function public.get_pos_report_page_v1(text,date,date,text,text,text,integer,integer) from public,anon;
grant execute on function public.get_pos_report_page_v1(text,date,date,text,text,text,integer,integer) to authenticated;
commit;
