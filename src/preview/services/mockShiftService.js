export function expectedCash(data) {
  const payments = data.orders
    .flatMap((order) => order.payments)
    .filter(
      (payment) =>
        payment.paymentMethod === "CASH" && payment.shiftId === data.shift.id,
    )
    .reduce((sum, payment) => sum + Math.round(payment.amount * 100), 0);
  const movements = data.shift.movements.reduce(
    (sum, movement) =>
      sum +
      Math.round(movement.amount * 100) *
        (movement.type === "CASH_OUT"
          ? -1
          : movement.type === "CASH_IN"
            ? 1
            : 0),
    0,
  );
  return (
    (Math.round(data.shift.openingFloat * 100) + payments + movements) / 100
  );
}
