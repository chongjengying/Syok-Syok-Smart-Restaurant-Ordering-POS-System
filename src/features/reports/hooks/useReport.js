import { useEffect, useState } from 'react';
import { generateReport } from '../services/reportService.js';

export function useReport() {
  const [request, setRequest] = useState(null); const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const [search, setSearchValue] = useState(''); const [sort, setSort] = useState({ key: '', direction: 'asc' });
  const [page, setPage] = useState(1); const [pageSize, setPageSizeValue] = useState(50);
  useEffect(() => {
    if (!request) return undefined;
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true); setError('');
      const result = await generateReport(request.reportId, request.dateFrom, request.dateTo, { search, sortKey: sort.key, sortDirection: sort.direction, limit: pageSize, offset: (page - 1) * pageSize });
      if (!active) return;
      setLoading(false);
      if (result.error) { setError(result.error.message || 'Unable to load report.'); return; }
      setReport(result.data);
    }, search ? 250 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [request, search, sort, page, pageSize]);
  const run = (reportId, dateFrom, dateTo) => { setSearchValue(''); setSort({ key: '', direction: 'asc' }); setPage(1); setRequest({ reportId, dateFrom, dateTo, nonce: Date.now() }); };
  const toggleSort = key => { setSort(current => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' })); setPage(1); };
  const setSearch = value => { setSearchValue(value); setPage(1); };
  const setPageSize = value => { setPageSizeValue(value); setPage(1); };
  const total = Number(report?.total || 0); const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return { report, loading, error, run, search, setSearch, sort, toggleSort, page, setPage, pageSize, setPageSize, rows: report?.rows || [], visibleRows: report?.rows || [], total, pageCount };
}
