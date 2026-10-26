export const mockPaymentMethods = [
  {
    method: "CASH",
    available: true,
    mode: "manual",
    label: "Cash",
    providers: [],
  },
  {
    method: "QR",
    available: true,
    mode: "manual",
    label: "QR / E-wallet",
    providers: [
      { providerId: "mock-qr", displayName: "Demo QR provider", enabled: true },
    ],
  },
];

// No branch voucher or promotion rules were supplied. Do not invent discounts.
export const mockVouchers = [];
export const mockShift = {
  id: "mock-shift",
  shiftNumber: "SHIFT-DEMO-001",
  status: "OPEN",
  openingFloat: 200,
  movements: [],
  actualCash: null,
};
