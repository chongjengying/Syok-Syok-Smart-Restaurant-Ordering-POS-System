import { fetchReportActor, fetchReportPage, fetchReportSummary } from '../repositories/reportRepository.js';
import { reportDefinition } from '../config/reportDefinitions.js';

export function validateReportRange(dateFrom, dateTo) {
  if (!dateFrom || !dateTo) return new Error('Choose a start and end date.');
  if (dateFrom > dateTo) return new Error('The start date must not be after the end date.');
  const days = (new Date(`${dateTo}T00:00:00`) - new Date(`${dateFrom}T00:00:00`)) / 86400000;
  if (days > 366) return new Error('Reports are limited to 366 days per request.');
  return null;
}

function enrichRows(reportId, input) {
  const rows = Array.isArray(input) ? input.map(row => ({ ...row })) : [];
  if (reportId === 'product-sales' || reportId === 'category-sales') {
    const grossTotal = rows.reduce((sum, row) => sum + Number(row.gross_sales || 0), 0);
    rows.forEach(row => {
      row.discount_allocated ??= 0;
      row.net_sales ??= Number(row.gross_sales || 0) - Number(row.discount_allocated || 0);
      row.sales_contribution ??= grossTotal ? Number(row.net_sales || 0) / grossTotal * 100 : 0;
      row.order_count ??= 0;
      row.discount ??= 0;
      row.sales_percentage ??= grossTotal ? Number(row.net_sales || row.gross_sales || 0) / grossTotal * 100 : 0;
    });
  }
  return rows;
}

export async function generateReport(reportId, dateFrom, dateTo, query = {}) {
  const error = validateReportRange(dateFrom, dateTo);
  if (error) return { data: null, error };
  const [result, summaryResult, generatedBy] = await Promise.all([fetchReportPage(reportId, dateFrom, dateTo, query), fetchReportSummary(reportId, dateFrom, dateTo), fetchReportActor()]);
  if (result.error) return { data: null, error: result.error };
  if (summaryResult.error) return { data: null, error: summaryResult.error };
  return { data: { reportId, definition: reportDefinition(reportId), rows: enrichRows(reportId, result.data?.rows), total: Number(result.data?.total || 0), summary: summaryResult.data || {}, generatedBy, generatedAt: new Date().toISOString(), dateFrom, dateTo }, error: null };
}

export async function fetchCompleteReportRows(report, query = {}) {
  const rows = []; let offset = 0; let total = 0;
  do {
    const result = await fetchReportPage(report.reportId, report.dateFrom, report.dateTo, { ...query, limit: 100, offset });
    if (result.error) throw result.error;
    const pageRows = enrichRows(report.reportId, result.data?.rows); rows.push(...pageRows); total = Number(result.data?.total || 0); offset += pageRows.length;
    if (!pageRows.length) break;
  } while (offset < total);
  return rows;
}
