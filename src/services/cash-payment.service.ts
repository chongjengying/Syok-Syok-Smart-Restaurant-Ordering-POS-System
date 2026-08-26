export interface CashTender {
  receivedAmount: number;
  changeAmount: number;
}

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function calculateCashTender(total: number, received: number): CashTender | null {
  if (!Number.isFinite(total) || total < 0 || !Number.isFinite(received) || received < total) return null;
  const receivedAmount = roundMoney(received);
  return {
    receivedAmount,
    changeAmount: roundMoney(receivedAmount - roundMoney(total)),
  };
}

