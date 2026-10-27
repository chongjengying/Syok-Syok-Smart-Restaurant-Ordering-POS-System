export const adminSections = [
  ["dashboard", "Overview", "dashboard.view"],
  ["products", "Items", "product.view"],
  ["categories", "Categories", "category.view"],
  ["inventory", "Inventory", "inventory.view"],
  ["promotions", "Promotions", "promotion.view"],
  ["vouchers", "Vouchers", "voucher.view"],
  ["orders", "Orders", "order.view"],
  ["payments", "Payments & refunds", "payment.view"],
  ["receipts", "Receipts", "payment.view"],
  ["cash-shifts", "Registers", "cash.shift.view"],
  ["tables", "Tables", "table.view"],
  ["users", "Staff records", "user.view"],
  ["roles", "Roles & permissions", "role.view"],
  ["reports", "Sales", "report.view"],
  ["discount-activity", "Discount activity", "voucher.activity.view"],
  ["audit", "Audit trail", "audit.view"],
  ["einvoice", "E-invoices", "einvoice.view"],
  ["settings", "Overview", null],
  ["company", "Restaurant", "company.view"],
  ["branches", "Branches", "branch.view"],
  ["terminals", "Terminals", "terminal.view"],
  ["payment-providers", "Payment methods", "settings.manage"],
  ["qr-settings", "QR payments", "settings.manage"],
  ["system-administration", "Preferences", "settings.view"],
  ["system-health", "System health", "system.health.view"],
  ["profile", "My profile", null],
];

export const adminModules = [
  { id: "dashboard", label: "Dashboard", routes: ["dashboard"] },
  {
    id: "menu",
    label: "Menu",
    routes: ["products", "categories", "inventory", "promotions", "vouchers"],
  },
  {
    id: "orders",
    label: "Orders",
    routes: ["orders", "payments", "receipts", "cash-shifts"],
  },
  { id: "tables", label: "Tables", routes: ["tables"] },
  { id: "staff", label: "Staff", routes: ["users", "roles"] },
  {
    id: "reports",
    label: "Reports",
    routes: ["reports", "discount-activity", "audit", "einvoice"],
  },
  {
    id: "settings",
    label: "Settings",
    routes: [
      "settings",
      "company",
      "branches",
      "terminals",
      "payment-providers",
      "qr-settings",
      "system-administration",
      "profile",
      "system-health",
    ],
  },
];

export function getAdminNavigation(permissions) {
  const allowed =
    permissions instanceof Set ? permissions : new Set(permissions || []);
  // Personal settings do not grant access to the admin workspace itself.
  const hasWorkspaceAccess = adminSections.some(
    (item) => item[2] && allowed.has(item[2]),
  );
  if (!hasWorkspaceAccess) return [];
  return adminModules
    .map((module) => ({
      ...module,
      sections: module.routes
        .map((route) => adminSections.find((item) => item[0] === route))
        .filter((item) => item && (!item[2] || allowed.has(item[2]))),
    }))
    .filter((module) => module.sections.length);
}
