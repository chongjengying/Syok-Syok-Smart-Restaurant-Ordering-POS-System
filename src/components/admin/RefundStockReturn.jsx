import React, { useRef, useState } from 'react';
import { PackageCheck, X } from 'lucide-react';
import AccessibleDialog from './AccessibleDialog';
import { persistRefundStockReturn } from '../../repositories/inventory.repository';

export default function RefundStockReturn({ refunds, onReturned }) {
  const [open, setOpen] = useState(false);
  const [refundId, setRefundId] = useState('');
  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const key = useRef('');
  const submitting = useRef(false);
  const eligible = refunds.filter(refund => refund.status === 'COMPLETED' && refund.items?.some(item => item.stockTracked && Number(item.returnedQuantity) < Number(item.quantity)));
  const items = eligible.find(refund => refund.id === refundId)?.items?.filter(item => item.stockTracked && Number(item.returnedQuantity) < Number(item.quantity)) || [];
  const item = items.find(value => value.refundItemId === itemId);
  const submit = async () => {
    if (submitting.current) return;
    const count = Number(quantity);
    if (!confirmed || !item || !Number.isInteger(count) || count <= 0 || count > Number(item.quantity) - Number(item.returnedQuantity) || reason.trim().length < 3) {
      setError('Confirm the physical return, quantity and reason.'); return;
    }
    submitting.current = true; setBusy(true); setError('');
    try {
      const result = await persistRefundStockReturn({ refundItemId: itemId, quantity: count, reason: reason.trim(), idempotencyKey: key.current });
      if (result.error) { setError(result.error.message); return; }
      setOpen(false); onReturned();
    } finally { submitting.current = false; setBusy(false); }
  };
  return <>
    <button disabled={!eligible.length} onClick={() => { key.current = crypto.randomUUID(); setRefundId(eligible[0]?.id || ''); setItemId(''); setQuantity(''); setReason(''); setConfirmed(false); setError(''); setOpen(true); }} className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-bold disabled:opacity-40"><PackageCheck size={17} />Return Stock</button>
    {open && <AccessibleDialog title="Return Stock" onClose={() => { if (!busy) setOpen(false); }} className="max-w-md">
      <div className="flex justify-between"><h2 className="text-xl font-black">Return Stock</h2><button disabled={busy} onClick={() => setOpen(false)} aria-label="Close"><X /></button></div>
      <label className="mt-4 block text-sm font-bold">Refund<select disabled={busy} value={refundId} onChange={event => { setRefundId(event.target.value); setItemId(''); }} className="mt-1 w-full rounded-lg border p-3">{eligible.map(refund => <option key={refund.id} value={refund.id}>{refund.refund_number} · {refund.order_number}</option>)}</select></label>
      <label className="mt-3 block text-sm font-bold">Item<select disabled={busy} value={itemId} onChange={event => setItemId(event.target.value)} className="mt-1 w-full rounded-lg border p-3"><option value="">Select item</option>{items.map(value => <option key={value.refundItemId} value={value.refundItemId}>{value.product} ({Number(value.quantity) - Number(value.returnedQuantity)})</option>)}</select></label>
      <label className="mt-3 block text-sm font-bold">Quantity<input disabled={busy} type="number" min="1" max={item ? Number(item.quantity) - Number(item.returnedQuantity) : 1} step="1" value={quantity} onChange={event => setQuantity(event.target.value)} className="mt-1 w-full rounded-lg border p-3" /></label>
      <label className="mt-3 block text-sm font-bold">Reason<textarea disabled={busy} value={reason} onChange={event => setReason(event.target.value)} className="mt-1 w-full rounded-lg border p-3" /></label>
      <label className="mt-3 flex items-start gap-2 text-sm"><input disabled={busy} type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-1" />Physical items received and suitable for restocking</label>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      <button disabled={busy} onClick={() => void submit()} className="mt-4 w-full rounded-lg bg-amber-400 p-3 font-bold disabled:opacity-40">{busy ? 'Saving...' : 'Confirm Return'}</button>
    </AccessibleDialog>}
  </>;
}
