import React, { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react';
import { useOrder } from '../hooks/useOrder';
import { createOrderBillSplit, fetchOrderBills } from '../repositories/order.repository';
import { processBillPayment } from '../services/payment.service';
import { translate } from '../utils/i18n';

const money = (value) => `RM ${Number(value || 0).toFixed(2)}`;
const methods = ['CASH', 'CARD', 'QR', 'EWALLET'];

export default function SplitBillScreen({ orderId, onBack, onDone, lang = 'en' }) {
  const tr = (key, vars) => translate(lang, key, vars);
  const { order, isLoading: loadingOrder, error: orderError } = useOrder(orderId, Boolean(orderId));
  const [mode, setMode] = useState('EQUAL');
  const [count, setCount] = useState(2);
  const [assignments, setAssignments] = useState([]);
  const [bills, setBills] = useState([]);
  const [selectedBill, setSelectedBill] = useState(null);
  const [payments, setPayments] = useState([]);
  const [amount, setAmount] = useState('');
  const [received, setReceived] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;

    const loadBills = async () => {
      const result = await fetchOrderBills(orderId);
      if (!active) return;
      if (result.error) {
        setError(result.error.message);
        return;
      }
      setBills(result.data || []);
    };

    void loadBills();
    return () => { active = false; };
  }, [orderId]);

  const billBalance = selectedBill ? Number(selectedBill.total) - Number(selectedBill.paid_amount || 0) : 0;
  const paymentTotal = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const remaining = Math.max(0, billBalance - paymentTotal);

  const createSplit = async () => {
    setBusy(true); setError('');
    const result = await createOrderBillSplit(orderId, mode === 'EQUAL' ? { mode, billCount: count } : { mode, assignments });
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    const loaded = await fetchOrderBills(orderId);
    if (loaded.error) { setError(loaded.error.message); return; }
    setBills(loaded.data || []);
  };

  const toggleItem = (itemId, billIndex) => {
    setAssignments((current) => {
      const next = current.map((entry) => ({ itemIds: [...entry.itemIds] }));
      next[billIndex] ||= { itemIds: [] };
      next.forEach((entry, index) => { if (index !== billIndex) entry.itemIds = entry.itemIds.filter((id) => id !== itemId); });
      next[billIndex].itemIds = next[billIndex].itemIds.includes(itemId) ? next[billIndex].itemIds.filter((id) => id !== itemId) : [...next[billIndex].itemIds, itemId];
      return next;
    });
  };

  const addPayment = () => {
    const value = Number(amount);
    const receivedValue = Number(received || amount);
    if (!selectedBill || !Number.isFinite(value) || value <= 0 || value > remaining) { setError(tr('paymentExceedsBalance')); return; }
    if (selectedMethod === 'CASH' && receivedValue < value) { setError(tr('receivedInsufficient')); return; }
    setPayments((current) => [...current, { method: selectedMethod, amount: value, receivedAmount: receivedValue }]);
    setAmount(''); setReceived(''); setError('');
  };

  const [selectedMethod, setSelectedMethod] = useState('CASH');
  const payBill = async () => {
    if (!selectedBill || remaining > 0 || busy) return;
    setBusy(true); setError('');
    const result = await processBillPayment(selectedBill.id, payments, crypto.randomUUID());
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    const loaded = await fetchOrderBills(orderId);
    setBills(loaded.data || []); setSelectedBill(null); setPayments([]); onDone?.();
  };

  if (loadingOrder) return <div className="flex h-full items-center justify-center gap-2"><Loader2 className="animate-spin" /> {tr('loadingOrder')}</div>;
  if (orderError || !order) return <div className="p-8 text-red-700">{orderError || tr('orderNotFound')}</div>;
  return <div className="flex h-full flex-col overflow-hidden bg-[#F5F6F8] text-[#121212]">
    <header className="flex h-16 items-center justify-between bg-[#121212] px-6 text-white"><button onClick={onBack} className="flex items-center gap-2 font-bold"><ArrowLeft /> {tr('order')}</button><h1 className="font-black">{tr('splitBill')}</h1><strong>{money(order.total)}</strong></header>
    <main className="flex-1 overflow-y-auto p-5"><div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-2">
      {bills.length === 0 ? <section className="rounded-3xl bg-white p-6 shadow-sm"><h2 className="text-xl font-black">{tr('configureSplit')}</h2><div className="mt-5 grid grid-cols-2 gap-3"><button onClick={() => setMode('EQUAL')} className={`rounded-xl border-2 p-4 font-black ${mode === 'EQUAL' ? 'border-[#D4AF37] bg-[#121212] text-white' : 'border-gray-200'}`}>{tr('splitEqually')}</button><button onClick={() => setMode('ITEM')} className={`rounded-xl border-2 p-4 font-black ${mode === 'ITEM' ? 'border-[#D4AF37] bg-[#121212] text-white' : 'border-gray-200'}`}>{tr('splitByItem')}</button></div>{mode === 'EQUAL' ? <div className="mt-5"><label className="font-bold">{tr('numberOfBills')}<select value={count} onChange={(event) => setCount(Number(event.target.value))} className="ml-3 rounded-lg border p-3">{Array.from({ length: 9 }, (_, index) => <option key={index + 2}>{index + 2}</option>)}</select></label></div> : <div className="mt-5 space-y-3">{Array.from({ length: count }, (_, billIndex) => <div key={billIndex} className="rounded-xl border p-3"><p className="font-black">{tr('bill')} {billIndex + 1}</p>{order.items.map((item) => <label key={item.id} className="flex items-center gap-2 py-2 text-sm"><input type="checkbox" checked={assignments[billIndex]?.itemIds.includes(item.id) || false} onChange={() => toggleItem(item.id, billIndex)} />{item.name} ×{item.quantity} <span className="ml-auto">{money(item.subtotal)}</span></label>)}</div>)}</div>}<button disabled={busy} onClick={() => void createSplit()} className="mt-6 w-full rounded-xl bg-emerald-500 p-4 font-black disabled:opacity-50">{busy ? tr('processing') : tr('createBills')}</button>{error && <p className="mt-3 text-sm text-red-700">{error}</p>}</section> : <section className="rounded-3xl bg-white p-6 shadow-sm"><h2 className="text-xl font-black">{tr('selectBill')}</h2><div className="mt-4 grid grid-cols-2 gap-3">{bills.map((bill) => <button key={bill.id} disabled={bill.status === 'PAID'} onClick={() => { setSelectedBill(bill); setPayments([]); }} className="rounded-2xl border-2 p-4 text-left disabled:bg-emerald-50"><p className="font-black">{tr('bill')} {bill.bill_number}</p><p className="mt-2 text-2xl font-black">{money(bill.total)}</p><p className="text-sm text-gray-500">{bill.status === 'PAID' ? tr('paid') : `${tr('remainingAmount')}: ${money(Number(bill.total) - Number(bill.paid_amount || 0))}`}</p></button>)}</div></section>}
      {selectedBill && <section className="rounded-3xl bg-white p-6 shadow-sm"><h2 className="text-xl font-black">{tr('mixedPayment')} · {tr('bill')} {selectedBill.bill_number}</h2><p className="mt-2 text-gray-600">{tr('remainingAmount')}: <strong>{money(remaining)}</strong></p><div className="mt-4 grid grid-cols-4 gap-2">{methods.map((method) => <button key={method} onClick={() => setSelectedMethod(method)} className={`rounded-lg border p-3 text-xs font-black ${selectedMethod === method ? 'border-[#D4AF37] bg-[#121212] text-white' : ''}`}>{method}</button>)}</div><div className="mt-4 grid grid-cols-[1fr_1fr_auto] gap-2"><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder={tr('amount')} className="rounded-lg border p-3" /><input value={received} onChange={(event) => setReceived(event.target.value)} inputMode="decimal" placeholder={tr('received')} className="rounded-lg border p-3" /><button onClick={addPayment} className="rounded-lg bg-[#121212] px-4 font-black text-[#D4AF37]"><Plus /></button></div><div className="my-4 space-y-2">{payments.map((payment, index) => <div key={`${payment.method}-${index}`} className="flex justify-between rounded-lg bg-gray-50 p-3 text-sm"><span>{payment.method}</span><span>{money(payment.amount)} <button onClick={() => setPayments((current) => current.filter((_, entryIndex) => entryIndex !== index))}><Trash2 className="inline h-4 w-4 text-red-600" /></button></span></div>)}</div><button disabled={remaining !== 0 || busy} onClick={() => void payBill()} className="w-full rounded-xl bg-emerald-500 p-4 font-black disabled:bg-gray-300">{busy ? tr('processing') : tr('confirmPayment')}</button>{error && <p className="mt-3 text-sm text-red-700">{error}</p>}</section>}
    </div></main>
  </div>;
}
