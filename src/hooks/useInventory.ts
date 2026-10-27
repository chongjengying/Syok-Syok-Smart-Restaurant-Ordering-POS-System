import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchInventory, fetchInventoryBranches, fetchInventoryReport, persistInventoryAdjustment, persistInventoryTransfer } from '../repositories/inventory.repository';
import type { BranchOption, InventoryItem } from '../types/inventory';

export function useInventory() {
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [branchId, setBranchId] = useState('');
  const [rows, setRows] = useState<InventoryItem[]>([]);
  const [search, setSearch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const invalidate = useCallback(() => { generation.current += 1; }, []);
  const pageSize = 25;
  useEffect(() => {
    let cancelled = false;
    void fetchInventoryBranches().then(result => {
      if (cancelled) return;
      if (result.error) { setError(result.error.message); setLoading(false); return; }
      const next = result.data || [];
      setBranches(next); setBranchId(next[0]?.id || '');
      if (!next.length) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setRows([]); setTotal(0); setSummary(null);
    if (!branchId) { setLoading(false); return; }
    setLoading(true);
    const [result, report] = await Promise.all([fetchInventory(branchId, search, lowStockOnly, page, pageSize), fetchInventoryReport(branchId)]);
    if (request !== generation.current) return;
    setLoading(false);
    if (result.error || report.error || !result.data) { setError(result.error?.message || report.error?.message || 'Unable to load inventory.'); return; }
    setRows(result.data.rows); setTotal(Number(result.data.total || 0)); setSummary(report.data); setError('');
  }, [branchId, search, lowStockOnly, page]);
  useEffect(() => {
    ++generation.current;
    setRows([]); setTotal(0); setSummary(null); setLoading(Boolean(branchId));
    const timer = setTimeout(() => void refresh(), 200);
    return () => { clearTimeout(timer); invalidate(); };
  }, [refresh, branchId, invalidate]);
  const adjust = async (item: InventoryItem, quantityDelta: number, movementType: string, reason: string, idempotencyKey: string, destinationBranchId = '') => {
    const result = movementType === 'TRANSFER'
      ? await persistInventoryTransfer({ sourceBranchId: item.branch_id, destinationBranchId, productId: item.product_id, quantity: quantityDelta, reason, idempotencyKey })
      : await persistInventoryAdjustment({ branchId: item.branch_id, productId: item.product_id, quantityDelta, movementType, reason, expectedVersion: item.version, idempotencyKey });
    if (!result.error) await refresh();
    return result;
  };
  return {
    branches, branchId, setBranchId: (value: string) => { setBranchId(value); setPage(1); }, rows,
    search, setSearch: (value: string) => { setSearch(value); setPage(1); },
    lowStockOnly, setLowStockOnly: (value: boolean) => { setLowStockOnly(value); setPage(1); },
    page, setPage, pageSize, total, summary, loading, error, refresh, adjust,
  };
}
