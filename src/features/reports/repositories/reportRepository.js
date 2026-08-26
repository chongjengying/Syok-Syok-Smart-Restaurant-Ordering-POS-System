import { supabase } from '../../../infrastructure/supabase/client';

export function fetchReportRows(reportId, dateFrom, dateTo) {
  if (reportId === 'product-sales') return supabase.rpc('get_paid_product_sales_report_v1', { p_date_from: dateFrom, p_date_to: dateTo });
  if (reportId === 'category-sales') return supabase.rpc('get_paid_category_sales_report_v1', { p_date_from: dateFrom, p_date_to: dateTo });
  return supabase.rpc('get_pos_report_v1', { p_report_id: reportId, p_date_from: dateFrom, p_date_to: dateTo });
}

export function fetchReportSummary(reportId, dateFrom, dateTo) {
  return supabase.rpc('get_pos_report_summary_v2', { p_report_id: reportId, p_date_from: dateFrom, p_date_to: dateTo });
}

export function fetchReportPage(reportId, dateFrom, dateTo, { search = '', sortKey = '', sortDirection = 'asc', limit = 50, offset = 0 } = {}) {
  return supabase.rpc('get_pos_report_page_v1', { p_report_id: reportId, p_date_from: dateFrom, p_date_to: dateTo, p_search: search || null, p_sort_key: sortKey || null, p_sort_direction: sortDirection, p_limit: limit, p_offset: offset });
}

export async function fetchReportActor() {
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return 'Unknown user';
  const { data: profile } = await supabase.from('profiles').select('name,email').eq('id', authData.user.id).maybeSingle();
  return profile?.name || profile?.email || authData.user.email || authData.user.id;
}
