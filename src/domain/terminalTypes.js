export const TERMINAL_TYPES = Object.freeze({
  CASHIER: "CASHIER",
  WAITER: "WAITER",
  KITCHEN: "KITCHEN",
  BAR: "BAR",
  SELF_SERVICE: "SELF_SERVICE",
  CUSTOMER_DISPLAY: "CUSTOMER_DISPLAY",
});

// Keep the first release intentionally narrow. New values can be enabled here
// when their capabilities and workflows are implemented.
export const TERMINAL_TYPE_OPTIONS = Object.freeze([
  { value: TERMINAL_TYPES.CASHIER, label: "Cashier" },
  { value: TERMINAL_TYPES.WAITER, label: "Waiter" },
  { value: TERMINAL_TYPES.KITCHEN, label: "Kitchen" },
  { value: TERMINAL_TYPES.BAR, label: "Bar" },
  { value: TERMINAL_TYPES.SELF_SERVICE, label: "Self-service" },
  { value: TERMINAL_TYPES.CUSTOMER_DISPLAY, label: "Customer display" },
]);

export const LEGACY_TERMINAL_TYPES = Object.freeze([]);
