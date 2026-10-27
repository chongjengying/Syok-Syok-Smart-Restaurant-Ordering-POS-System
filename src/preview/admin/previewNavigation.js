export const primaryModules = [
  {
    label: "Dashboard",
    route: "panel/dashboard",
    icon: "dashboard",
    pages: [["panel/dashboard", "Overview"]],
  },
  {
    label: "Menu",
    route: "panel/products",
    icon: "menu",
    pages: [
      ["panel/products", "Items"],
      ["panel/categories", "Categories"],
      ["panel/inventory", "Inventory"],
      ["panel/promotions", "Promotions"],
      ["panel/vouchers", "Vouchers"],
    ],
  },
  {
    label: "Orders",
    route: "panel/orders",
    icon: "orders",
    pages: [
      ["panel/orders", "Orders"],
      ["panel/payments", "Payments & refunds"],
      ["panel/receipts", "Receipts"],
      ["panel/cash-shifts", "Registers"],
    ],
  },
  {
    label: "Tables",
    route: "panel/tables",
    icon: "tables",
    pages: [["panel/tables", "Tables"]],
  },
  {
    label: "Staff",
    route: "panel/users",
    icon: "staff",
    pages: [
      ["panel/users", "Staff records"],
      ["panel/roles", "Roles & permissions"],
      ["company/members", "Company members"],
    ],
  },
  {
    label: "Reports",
    route: "panel/reports",
    icon: "reports",
    pages: [
      ["panel/reports", "Sales"],
      ["panel/discount-activity", "Discount activity"],
      ["panel/audit", "Audit trail"],
      ["panel/einvoice", "E-invoices"],
    ],
  },
  {
    label: "Settings",
    route: "panel/system-administration",
    icon: "settings",
    pages: [
      ["panel/system-administration", "Overview"],
      ["panel/company", "Restaurant"],
      ["panel/branches", "Branches"],
      ["panel/terminals", "Terminals"],
      ["panel/payment-providers", "Payment methods"],
      ["panel/qr-settings", "QR payments"],
      ["profile", "My profile"],
      ["panel/system-health", "System health"],
    ],
  },
];

const aliases = {
  branches: "panel/branches",
  staff: "panel/users",
  roles: "panel/roles",
  devices: "panel/terminals",
  "company/settings": "panel/company",
};
export const canonicalPage = (page) => aliases[page] || page;
export const primaryForPage = (page) =>
  primaryModules.find((module) =>
    module.pages.some(([route]) => route === canonicalPage(page)),
  ) || primaryModules[6];
