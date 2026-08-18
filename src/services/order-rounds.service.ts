import type { OrderItem } from '../types/order';

export interface OrderRound {
  roundNo: number;
  isAddOn: boolean;
  status: string;
  items: OrderItem[];
}

export interface OrderKitchenProgress {
  label: 'ORDER IN PROGRESS' | 'READY' | 'SERVED' | 'CANCELLED';
  waiting: number;
  preparing: number;
  ready: number;
  served: number;
  cancelled: number;
}

const normalizeItemStatus = (status: string) => String(status || 'SUBMITTED').toUpperCase();

export function getRoundStatus(items: Pick<OrderItem, 'itemStatus'>[]): string {
  const statuses = items.map((item) => normalizeItemStatus(item.itemStatus));
  const active = statuses.filter((status) => !['CANCELLED', 'VOIDED'].includes(status));
  if (!active.length) return 'CANCELLED';
  if (active.every((status) => status === 'SERVED')) return 'SERVED';
  if (active.every((status) => ['READY', 'SERVED'].includes(status))) return 'READY';
  if (active.some((status) => status === 'PREPARING')) return 'PREPARING';
  return 'WAITING';
}

export function groupOrderRounds(items: OrderItem[]): OrderRound[] {
  const grouped = new Map<number, OrderItem[]>();
  items.forEach((item) => {
    const roundNo = Math.max(1, Number(item.batchNo) || 1);
    grouped.set(roundNo, [...(grouped.get(roundNo) || []), item]);
  });
  return [...grouped.entries()]
    .sort(([left], [right]) => left - right)
    .map(([roundNo, roundItems]) => ({
      roundNo,
      isAddOn: roundNo > 1,
      status: getRoundStatus(roundItems),
      items: roundItems,
    }));
}

export function deriveOrderKitchenProgress(
  items: Pick<OrderItem, 'itemStatus' | 'quantity'>[],
): OrderKitchenProgress {
  const totals = { waiting: 0, preparing: 0, ready: 0, served: 0, cancelled: 0 };
  items.forEach((item) => {
    const quantity = Math.max(0, Number(item.quantity) || 0);
    const status = normalizeItemStatus(item.itemStatus);
    if (['CANCELLED', 'VOIDED'].includes(status)) totals.cancelled += quantity;
    else if (status === 'SERVED') totals.served += quantity;
    else if (status === 'READY') totals.ready += quantity;
    else if (status === 'PREPARING') totals.preparing += quantity;
    else totals.waiting += quantity;
  });

  const activeKitchenCount = totals.waiting + totals.preparing + totals.ready;
  const nonCancelledCount = activeKitchenCount + totals.served;
  const label = nonCancelledCount === 0
    ? 'CANCELLED'
    : activeKitchenCount === 0
      ? 'SERVED'
      : totals.waiting === 0 && totals.preparing === 0
        ? 'READY'
        : 'ORDER IN PROGRESS';
  return { label, ...totals };
}
