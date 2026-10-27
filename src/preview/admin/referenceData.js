export const referenceMenu = [
  {
    name: "Nasi Lemak Royale",
    sku: "MAIN-001",
    category: "Mains",
    price: "18.00",
    sold: 42,
    stock: 84,
    inventory: "High stock",
    image: "rice",
  },
  {
    name: "Signature Wagyu Beef Burger",
    sku: "MAIN-002",
    category: "Mains",
    price: "38.00",
    sold: 31,
    stock: 6,
    inventory: "Low stock",
    image: "burger",
  },
  {
    name: "Teh Tarik Special",
    sku: "DRINK-001",
    category: "Beverages",
    price: "6.80",
    sold: 68,
    stock: 120,
    inventory: "High stock",
    image: "tea",
  },
  {
    name: "Truffle Fries",
    sku: "SIDE-001",
    category: "Sides",
    price: "18.00",
    sold: 27,
    stock: 42,
    inventory: "Adequate",
    image: "fries",
  },
  {
    name: "Pandan Gula Melaka Cake",
    sku: "DESSERT-001",
    category: "Desserts",
    price: "18.00",
    sold: 19,
    stock: 24,
    inventory: "Adequate",
    image: "cake",
  },
  {
    name: "Iced Calamansi",
    sku: "DRINK-002",
    category: "Beverages",
    price: "8.00",
    sold: 24,
    stock: 66,
    inventory: "High stock",
    image: "lime",
  },
];

export const referenceOrders = [
  {
    Order: "#ORD-1048",
    Time: "2 min ago",
    Branch: "Bangsar Central",
    "Order type": "Dine-in",
    Cashier: "Farah Lim",
    Total: "RM 84.50",
    Status: "Preparing",
    Table: "Table 04",
    Payment: "Unpaid",
    _summary: "3 items (Burger, Fries, Iced Teh)",
    _area: "Main Floor",
    _totalCents: 8450,
  },
  {
    Order: "#ORD-1047",
    Time: "6 min ago",
    Branch: "Bangsar Central",
    "Order type": "Dine-in",
    Cashier: "Mira Hassan",
    Total: "RM 36.00",
    Status: "Ready",
    Table: "Table 12",
    Payment: "Unpaid",
    _summary: "2 items (Nasi Lemak ×2)",
    _area: "Main Floor",
    _totalCents: 3600,
  },
  {
    Order: "#ORD-1046",
    Time: "11 min ago",
    Branch: "Bangsar Central",
    "Order type": "Takeaway",
    Cashier: "Farah Lim",
    Total: "RM 72.00",
    Status: "Completed",
    Table: "Takeaway",
    Payment: "Paid",
    _summary: "4 items (Cakes & Coffee)",
    _area: "Bar Area",
    _totalCents: 7200,
  },
  {
    Order: "#ORD-1045",
    Time: "18 min ago",
    Branch: "Bangsar Central",
    "Order type": "Dine-in",
    Cashier: "Daniel Tan",
    Total: "RM 164.80",
    Status: "Completed",
    Table: "Table 07",
    Payment: "Paid",
    _summary: "5 items (Full Dinner Set)",
    _area: "Main Floor",
    _totalCents: 16480,
  },
  {
    Order: "#ORD-1044",
    Time: "24 min ago",
    Branch: "Damansara Uptown",
    "Order type": "Takeaway",
    Cashier: "Mira Hassan",
    Total: "RM 48.90",
    Status: "Preparing",
    Table: "Takeaway",
    Payment: "Unpaid",
    _summary: "2 items (Nasi Lemak & Tea)",
    _area: "Patio Garden",
    _totalCents: 4890,
  },
];

export const moduleGuides = {
  dashboard: {
    title: "Dashboard",
    description:
      "Live service status, sales performance, and kitchen activity.",
    label: "Dashboard",
  },
  products: {
    title: "Menu Management",
    description:
      "Organize dishes, set prices, and control what is available to order.",
    label: "Menu items",
    action: "Add menu item",
  },
  orders: {
    title: "Order Management",
    description:
      "Track every ticket from the first item to preparation and payment.",
    label: "Orders",
    action: "New order",
  },
  tables: {
    title: "Table Management",
    description:
      "Manage floor availability, reservations, and active dining sessions.",
    label: "Tables",
    action: "Add table",
  },
  categories: {
    title: "Menu Categories",
    description:
      "Keep your menu easy to browse and route items to the right station.",
    label: "Categories",
    action: "Add category",
  },
  inventory: {
    title: "Inventory & Stock",
    description:
      "Receive stock, move it between outlets, and trace every adjustment.",
    label: "Stock items",
    action: "Record movement",
  },
  promotions: {
    title: "Promotions",
    description:
      "Schedule offers with clear eligibility, dates, and discount rules.",
    label: "Promotions",
    action: "Create promotion",
  },
  vouchers: {
    title: "Vouchers",
    description:
      "Create redemption codes, manage limits, and monitor campaign usage.",
    label: "Vouchers",
    action: "Create voucher",
  },
  payments: {
    title: "Payments & Refunds",
    description:
      "Review collected payments, investigate failures, and manage reversals.",
    label: "Payments",
    action: "Export payments",
  },
  receipts: {
    title: "Receipt Archive",
    description:
      "Find original receipt snapshots and track every sample reprint.",
    label: "Receipts",
    action: "Export receipts",
  },
  "cash-shifts": {
    title: "Shift Management",
    description:
      "Open a register, track its cash, and reconcile at the end of service.",
    label: "Register sessions",
    action: "Open register",
  },
  reports: {
    title: "Sales Reports",
    description:
      "Understand your revenue, product performance, and payment mix.",
    label: "Branch performance",
    action: "Export report",
  },
  "discount-activity": {
    title: "Discount Activity",
    description:
      "Trace applied offers and manager approvals to the original order.",
    label: "Discounts",
    action: "Export activity",
  },
  audit: {
    title: "Audit Trail",
    description: "A chronological record of who changed what, where, and why.",
    label: "Activity",
    action: "Export audit log",
  },
  "system-administration": {
    title: "Settings",
    description:
      "Manage service defaults, taxes, receipt details, and ordering preferences.",
  },
  "system-health": {
    title: "System Health",
    description:
      "Monitor service availability, response times, and operational alerts.",
  },
  "qr-settings": {
    title: "QR Payment Settings",
    description:
      "Manage the merchant identity and payment instructions shown at checkout.",
  },
  "payment-providers": {
    title: "Payment Methods",
    description: "Choose the payment methods available across your outlets.",
    label: "Payment methods",
    action: "Add payment method",
  },
  einvoice: {
    title: "E-Invoice Center",
    description:
      "Review submission outcomes and resolve missing buyer or tax information.",
    label: "Invoices",
    action: "Export invoices",
  },
};

export const initialMembers = [
  {
    id: "member-1",
    name: "Farah Lim",
    email: "farah@example.test",
    role: "Company admin",
    branch: "All branches",
    status: "Active",
    access: "Member",
  },
  {
    id: "member-2",
    name: "Daniel Tan",
    email: "daniel@example.test",
    role: "Branch manager",
    branch: "Damansara Uptown",
    status: "Active",
    access: "Member",
  },
  {
    id: "member-3",
    name: "Aisha Rahman",
    email: "aisha@example.test",
    role: "Read only",
    branch: "Bangsar Central",
    status: "Pending",
    access: "Invited",
  },
];
