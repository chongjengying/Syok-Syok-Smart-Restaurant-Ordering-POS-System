export const adminPanelGroups = [
  {
    group: "OPERATIONS",
    items: [
      ["panel/dashboard", "Dashboard"],
      ["panel/products", "Menu Management"],
      ["panel/orders", "Order Management"],
      ["panel/tables", "Table Management"],
    ],
  },
  {
    group: "ADMIN PANEL",
    items: [
      ["panel/company", "Company"],
      ["panel/branches", "Branches"],
      ["panel/terminals", "Terminals"],
      ["panel/users", "Staff"],
      ["panel/roles", "Roles & Permissions"],
    ],
  },
  {
    group: "FINANCE",
    items: [
      ["panel/payments", "Payments"],
      ["panel/receipts", "Receipts"],
      ["panel/cash-shifts", "Shift Management"],
    ],
  },
  {
    group: "BUSINESS",
    items: [
      ["panel/categories", "Categories"],
      ["panel/inventory", "Inventory"],
      ["panel/promotions", "Promotions"],
      ["panel/vouchers", "Vouchers"],
    ],
  },
  {
    group: "REPORTS",
    items: [
      ["panel/reports", "Sales Reports"],
      ["panel/discount-activity", "Discount Activity"],
      ["panel/audit", "Audit Trail"],
    ],
  },
  {
    group: "SYSTEM",
    items: [
      ["panel/system-administration", "Restaurant Settings"],
      ["panel/system-health", "System Health"],
      ["panel/qr-settings", "QR Payment Settings"],
      ["panel/payment-providers", "Payment Methods"],
      ["panel/einvoice", "E-Invoice"],
    ],
  },
];

const makeRows = (columns, values) =>
  values.map((row) =>
    Object.fromEntries(columns.map((key, index) => [key, row[index]])),
  );
const configs = {
  dashboard: {
    description:
      "A real-time view of sales, orders, and restaurant operations.",
    stats: [
      ["Net sales", "RM 8,420.50", "+12.8% vs last week"],
      ["Orders", "184", "23 today"],
      ["Average order", "RM 45.76", "+RM 3.20 this week"],
      ["Open shifts", "3", "Across 2 branches"],
    ],
    columns: ["Order", "Branch", "Staff", "Total", "Status"],
    rows: [
      ["#10482", "Bangsar Central", "Farah Lim", "RM 86.00", "Paid"],
      ["#10481", "Damansara Uptown", "Mira Hassan", "RM 42.50", "Paid"],
      ["#10480", "Bangsar Central", "Daniel Tan", "RM 118.00", "Refunded"],
    ],
    action: "View reports",
    kind: "dashboard",
  },
  company: {
    description:
      "Manage company identity and the business information shared by your branches.",
    stats: [
      ["Company status", "Active", "Verified workspace"],
      ["Branches", "4", "2 currently active"],
      ["Currency", "MYR", "Malaysian Ringgit"],
    ],
    columns: ["Business detail", "Current value", "Scope"],
    rows: [
      ["Company name", "Resto Dining Group", "Company"],
      ["Registration no.", "202401018642", "Malaysia"],
      ["Tax registration", "W10-2401-32000123", "Company"],
      ["Website", "resto.example.test", "Company"],
    ],
    action: "Edit company",
    kind: "company",
  },
  branches: {
    description:
      "Manage outlets, branch settings, and the teams assigned to each location.",
    stats: [
      ["Total branches", "4", "Across 2 regions"],
      ["Active", "2", "Ready for service"],
      ["Devices", "6", "Across all branches"],
    ],
    columns: ["Branch", "Code", "Manager", "Terminals", "Status"],
    rows: [
      ["Bangsar Central", "KL-01", "Farah Lim", "3", "Active"],
      ["Damansara Uptown", "PJ-01", "Daniel Tan", "2", "Active"],
      ["Mont Kiara", "KL-02", "Unassigned", "0", "Setup"],
      ["Johor Bahru City", "JB-01", "Aisha Rahman", "1", "Inactive"],
    ],
    action: "Add branch",
    kind: "branches",
  },
  terminals: {
    description:
      "Register restaurant devices, manage activation, and control terminal access.",
    stats: [
      ["Registered devices", "6", "Across 3 branches"],
      ["Active", "4", "Connected recently"],
      ["Pending activation", "1", "Awaiting device setup"],
    ],
    columns: ["Terminal", "Branch", "Type", "Last seen", "Status"],
    rows: [
      [
        "Front Counter 01",
        "Bangsar Central",
        "POS terminal",
        "Just now",
        "Active",
      ],
      [
        "Kitchen Display",
        "Bangsar Central",
        "Kitchen display",
        "2 min ago",
        "Active",
      ],
      [
        "Front Counter 02",
        "Damansara Uptown",
        "POS terminal",
        "Not activated",
        "Pending",
      ],
      [
        "Legacy iPad",
        "Johor Bahru City",
        "POS terminal",
        "Oct 18, 2026",
        "Revoked",
      ],
    ],
    action: "Add terminal",
    kind: "terminals",
  },
  users: {
    description:
      "Manage staff profiles, roles, branch access, and account status.",
    stats: [
      ["Team members", "12", "Across 3 branches"],
      ["Active access", "9", "Can sign in today"],
      ["Invitations pending", "2", "Expires in 6 days"],
    ],
    columns: ["Staff member", "Employee ID", "Role", "Branch access", "Status"],
    rows: [
      ["Farah Lim", "ST-0102", "Branch Manager", "Bangsar Central", "Active"],
      ["Daniel Tan", "ST-0118", "Branch Manager", "Damansara Uptown", "Active"],
      ["Aisha Rahman", "ST-0140", "Cashier", "Johor Bahru City", "Pending"],
      ["Jason Lee", "ST-0152", "Kitchen", "Bangsar Central", "Inactive"],
    ],
    action: "Create staff",
    kind: "users",
  },
  roles: {
    description: "Control what each role can see and do across the workspace.",
    stats: [
      ["Roles", "5", "4 custom roles"],
      ["Staff assigned", "12", "Across all branches"],
      ["Sensitive actions", "3", "Manager approval enabled"],
    ],
    columns: ["Role", "Members", "Branch scope", "Permissions", "Status"],
    rows: [
      ["Company owner", "1", "All branches", "All permissions", "System role"],
      ["Branch Manager", "2", "Assigned branch", "18 permissions", "Active"],
      ["Cashier", "6", "Assigned branch", "9 permissions", "Active"],
      ["Kitchen", "3", "Assigned branch", "4 permissions", "Active"],
    ],
    action: "Create role",
    kind: "roles",
  },
  orders: {
    description:
      "Search orders and review their items, fulfillment, and payment status.",
    stats: [
      ["Orders today", "184", "23 in progress"],
      ["Paid sales", "RM 8,420.50", "Updated just now"],
      ["Average ticket", "RM 45.76", "Across all branches"],
    ],
    columns: [
      "Order",
      "Time",
      "Branch",
      "Order type",
      "Cashier",
      "Total",
      "Status",
    ],
    rows: [
      [
        "#10482",
        "11:42 AM",
        "Bangsar Central",
        "Dine-in",
        "Farah Lim",
        "RM 86.00",
        "Paid",
      ],
      [
        "#10481",
        "11:38 AM",
        "Damansara Uptown",
        "Takeaway",
        "Mira Hassan",
        "RM 42.50",
        "Paid",
      ],
      [
        "#10480",
        "11:31 AM",
        "Bangsar Central",
        "Dine-in",
        "Daniel Tan",
        "RM 118.00",
        "Refunded",
      ],
      [
        "#10479",
        "11:25 AM",
        "Johor Bahru City",
        "Takeaway",
        "Aisha Rahman",
        "RM 29.00",
        "Preparing",
      ],
    ],
    action: "Export orders",
    kind: "orders",
  },
  payments: {
    description:
      "Review payments, refunds, provider outcomes, and payment exceptions.",
    stats: [
      ["Collected today", "RM 8,420.50", "176 successful payments"],
      ["Refunded", "RM 245.00", "3 refunds today"],
      ["Failed payments", "2", "Needs review"],
    ],
    columns: ["Payment", "Order", "Method", "Provider", "Amount", "Status"],
    rows: [
      ["PAY-8402", "#10482", "QR", "DuitNow", "RM 86.00", "Completed"],
      ["PAY-8401", "#10481", "Cash", "Cash drawer", "RM 42.50", "Completed"],
      ["PAY-8398", "#10480", "Card", "Terminal", "RM 118.00", "Refunded"],
      ["PAY-8396", "#10477", "QR", "DuitNow", "RM 34.00", "Failed"],
    ],
    action: "Export payments",
    kind: "payments",
  },
  receipts: {
    description:
      "Inspect immutable receipt snapshots and controlled reprint history.",
    stats: [
      ["Receipts today", "176", "Across all branches"],
      ["Reprints", "4", "All actions recorded"],
      ["Voided receipts", "2", "Linked to original orders"],
    ],
    columns: [
      "Receipt",
      "Order",
      "Branch / terminal",
      "Cashier",
      "Issued",
      "Total",
      "Status",
    ],
    rows: [
      [
        "RCP-2026-10482",
        "#10482",
        "Bangsar Central · POS-01",
        "Farah Lim",
        "11:42 AM",
        "RM 86.00",
        "Issued",
      ],
      [
        "RCP-2026-10481",
        "#10481",
        "Damansara Uptown · POS-02",
        "Mira Hassan",
        "11:38 AM",
        "RM 42.50",
        "Issued",
      ],
      [
        "RCP-2026-10480",
        "#10480",
        "Bangsar Central · POS-01",
        "Daniel Tan",
        "11:31 AM",
        "RM 118.00",
        "Reprinted",
      ],
    ],
    action: "Export receipts",
    kind: "receipts",
  },
  "cash-shifts": {
    description:
      "Monitor register sessions, cash reconciliation, and shift history.",
    stats: [
      ["Open shifts", "3", "Across 2 branches"],
      ["Expected cash", "RM 2,180.00", "For open shifts"],
      ["Needs reconciliation", "1", "Review variance"],
    ],
    columns: [
      "Shift",
      "Branch / terminal",
      "Opened by",
      "Opened at",
      "Opening cash",
      "Status",
    ],
    rows: [
      [
        "SH-0831",
        "Bangsar Central · POS-01",
        "Farah Lim",
        "9:02 AM",
        "RM 300.00",
        "Open",
      ],
      [
        "SH-0830",
        "Damansara Uptown · POS-02",
        "Mira Hassan",
        "8:55 AM",
        "RM 250.00",
        "Open",
      ],
      [
        "SH-0828",
        "Bangsar Central · POS-02",
        "Daniel Tan",
        "Yesterday",
        "RM 300.00",
        "Closed",
      ],
    ],
    action: "View shift history",
    kind: "cash-shifts",
  },
  tables: {
    description:
      "See dining areas and table availability across your branches.",
    stats: [
      ["Total tables", "32", "Across 4 dining areas"],
      ["Occupied", "11", "34% occupancy"],
      ["Needs attention", "2", "Orders ready to serve"],
    ],
    columns: [
      "Table",
      "Dining area",
      "Branch",
      "Capacity",
      "Current order",
      "Status",
    ],
    rows: [
      [
        "T01 · Window",
        "Main dining",
        "Bangsar Central",
        "4 seats",
        "#10482 · 18 min",
        "Occupied",
      ],
      [
        "T02 · Window",
        "Main dining",
        "Bangsar Central",
        "2 seats",
        "—",
        "Available",
      ],
      [
        "T08 · Patio",
        "Outdoor",
        "Damansara Uptown",
        "6 seats",
        "#10473 · 42 min",
        "Ready to serve",
      ],
      ["T11", "Private room", "Johor Bahru City", "8 seats", "—", "Reserved"],
    ],
    action: "Manage table layout",
    kind: "tables",
  },
  products: {
    description:
      "Manage your menu items, pricing, availability, and inventory links.",
    stats: [
      ["Menu items", "86", "Across 8 categories"],
      ["Available", "79", "7 temporarily hidden"],
      ["Low stock", "4", "Across 2 branches"],
    ],
    columns: [
      "Product",
      "SKU",
      "Category",
      "Price",
      "Stock tracking",
      "Status",
    ],
    rows: [
      [
        "Signature beef burger",
        "FD-001",
        "Mains",
        "RM 32.00",
        "On",
        "Available",
      ],
      ["Sea salt fries", "SD-014", "Sides", "RM 12.00", "On", "Available"],
      ["Iced oat latte", "DR-022", "Drinks", "RM 16.00", "Off", "Available"],
      [
        "Basque cheesecake",
        "DS-009",
        "Desserts",
        "RM 18.00",
        "On",
        "Low stock",
      ],
    ],
    action: "Add product",
    kind: "products",
  },
  categories: {
    description:
      "Organize the menu into categories used by your POS and kitchen.",
    stats: [
      ["Categories", "8", "Menu organization"],
      ["Products", "86", "Across all categories"],
      ["Hidden categories", "1", "Not shown on POS"],
    ],
    columns: [
      "Category",
      "Products",
      "Menu order",
      "Kitchen routing",
      "Visibility",
    ],
    rows: [
      ["Mains", "24 products", "01", "Hot kitchen", "Visible"],
      ["Sides", "16 products", "02", "Hot kitchen", "Visible"],
      ["Drinks", "22 products", "03", "Bar", "Visible"],
      ["Desserts", "12 products", "04", "Cold kitchen", "Visible"],
    ],
    action: "Add category",
    kind: "categories",
  },
  inventory: {
    description:
      "Track stock by branch and review receiving, transfers, and adjustments.",
    stats: [
      ["Tracked items", "48", "Across 3 branches"],
      ["Low stock", "4", "Reorder recommended"],
      ["Stock value", "RM 18,240", "Current estimate"],
    ],
    columns: ["Item", "SKU", "Branch", "On hand", "Reorder point", "Status"],
    rows: [
      [
        "Beef patty 150g",
        "ING-014",
        "Bangsar Central",
        "12 pcs",
        "20 pcs",
        "Low stock",
      ],
      [
        "Oat milk",
        "ING-032",
        "Damansara Uptown",
        "18 cartons",
        "10 cartons",
        "In stock",
      ],
      [
        "Arabica beans",
        "ING-008",
        "Bangsar Central",
        "6 kg",
        "4 kg",
        "In stock",
      ],
      [
        "Brioche buns",
        "ING-019",
        "Johor Bahru City",
        "0 pcs",
        "15 pcs",
        "Out of stock",
      ],
    ],
    action: "Record stock movement",
    kind: "inventory",
  },
  promotions: {
    description:
      "Set up time-bound promotions and track where offers are being used.",
    stats: [
      ["Active promotions", "3", "Across all branches"],
      ["Scheduled", "1", "Starts tomorrow"],
      ["Redemptions today", "28", "RM 196.00 discount"],
    ],
    columns: ["Promotion", "Offer", "Schedule", "Redemptions", "Status"],
    rows: [
      ["Lunch set", "RM 5 off", "11:00 AM–2:00 PM", "18", "Active"],
      ["Weekday welcome", "10% off", "Mon–Fri", "10", "Active"],
      ["Weekend dessert", "Free dessert", "Sat–Sun", "0", "Scheduled"],
    ],
    action: "Create promotion",
    kind: "promotions",
  },
  vouchers: {
    description:
      "Create voucher codes, set eligibility, and review redemption status.",
    stats: [
      ["Active vouchers", "5", "Currently redeemable"],
      ["Redemptions", "42", "This month"],
      ["Scheduled", "2", "Upcoming campaigns"],
    ],
    columns: [
      "Code",
      "Voucher",
      "Type",
      "Value",
      "Validity",
      "Redemptions",
      "Status",
    ],
    rows: [
      [
        "NORTHSTAR10",
        "Welcome offer",
        "Percentage",
        "10%",
        "Until Nov 30",
        "24 / 100",
        "Active",
      ],
      [
        "LUNCH5",
        "Lunch discount",
        "Fixed amount",
        "RM 5",
        "Weekdays",
        "18 / 200",
        "Active",
      ],
      [
        "DESSERT",
        "Opening campaign",
        "Free item",
        "1 item",
        "Starts Nov 1",
        "0 / 50",
        "Scheduled",
      ],
    ],
    action: "Create voucher",
    kind: "vouchers",
  },
  reports: {
    description: "Analyze sales, order mix, and performance across branches.",
    stats: [
      ["Net sales", "RM 58,320", "+8.4% vs prior period"],
      ["Orders", "1,284", "+5.2% vs prior period"],
      ["Average order", "RM 45.42", "+RM 1.18 vs prior period"],
      ["Refunds", "RM 612", "1.1% of gross sales"],
    ],
    columns: ["Branch", "Net sales", "Orders", "Avg. order", "Top category"],
    rows: [
      ["Bangsar Central", "RM 26,480", "582", "RM 45.50", "Mains"],
      ["Damansara Uptown", "RM 19,220", "426", "RM 45.12", "Drinks"],
      ["Johor Bahru City", "RM 12,620", "276", "RM 45.72", "Mains"],
    ],
    action: "Export report",
    kind: "reports",
  },
  "discount-activity": {
    description:
      "Review voucher redemptions, promotions, and approved manual discounts.",
    stats: [
      ["Discounted orders", "42", "Today"],
      ["Discount value", "RM 486.00", "Across all branches"],
      ["Manager overrides", "3", "All approvals recorded"],
    ],
    columns: [
      "Time",
      "Order",
      "Type",
      "Code / reason",
      "Approved by",
      "Discount",
    ],
    rows: [
      ["11:42 AM", "#10482", "Voucher", "LUNCH5", "—", "RM 5.00"],
      ["11:30 AM", "#10479", "Promotion", "Lunch set", "—", "RM 12.00"],
      [
        "10:54 AM",
        "#10461",
        "Manager override",
        "Service recovery",
        "Farah Lim",
        "RM 8.00",
      ],
    ],
    action: "Export activity",
    kind: "discount-activity",
  },
  audit: {
    description:
      "Trace administrative and financial actions across your restaurant workspace.",
    stats: [
      ["Events today", "186", "Across all modules"],
      ["Approvals", "12", "Manager actions"],
      ["Failed attempts", "2", "Review security events"],
    ],
    columns: ["When", "Actor", "Action", "Resource", "Branch", "Result"],
    rows: [
      [
        "11:42 AM",
        "Farah Lim",
        "SALE_COMPLETED",
        "Order #10482",
        "Bangsar Central",
        "Succeeded",
      ],
      [
        "11:31 AM",
        "Daniel Tan",
        "REFUND_APPROVED",
        "Payment PAY-8398",
        "Bangsar Central",
        "Approved",
      ],
      [
        "10:18 AM",
        "Alex Tan",
        "STAFF_ROLE_UPDATED",
        "Staff ST-0118",
        "Workspace",
        "Succeeded",
      ],
      [
        "9:52 AM",
        "System",
        "TERMINAL_ACTIVATED",
        "Front Counter 01",
        "Bangsar Central",
        "Succeeded",
      ],
    ],
    action: "Export audit log",
    kind: "audit",
  },
  "system-administration": {
    description:
      "Configure restaurant-wide defaults, receipts, tax, and operating preferences.",
    stats: [
      ["Workspace status", "Configured", "Defaults apply to new branches"],
      ["Tax setup", "SST enabled", "6.00%"],
      ["Receipt format", "Standard", "Company details included"],
    ],
    columns: ["Setting group", "Configuration", "Applies to", "Status"],
    rows: [
      [
        "Business profile",
        "Name, registration, contact details",
        "Company",
        "Configured",
      ],
      [
        "Tax & service charge",
        "SST 6% · Service charge 10%",
        "All branches",
        "Configured",
      ],
      [
        "Receipt settings",
        "Footer, totals, cashier details",
        "All branches",
        "Configured",
      ],
      [
        "Order numbering",
        "Branch code + sequence",
        "Each branch",
        "Configured",
      ],
    ],
    action: "Edit restaurant settings",
    kind: "system-administration",
  },
  "system-health": {
    description:
      "Check the status of connected services and review recent operational events.",
    stats: [
      ["Overall status", "Operational", "Last checked just now"],
      ["Database", "Connected", "Response 42 ms"],
      ["Payment functions", "Operational", "No active incidents"],
      ["Realtime", "Connected", "All channels healthy"],
    ],
    columns: ["Service", "Status", "Response time", "Last checked"],
    rows: [
      ["Database", "Operational", "42 ms", "Just now"],
      ["Authentication", "Operational", "81 ms", "Just now"],
      ["Order functions", "Operational", "96 ms", "Just now"],
      ["Payment functions", "Operational", "114 ms", "Just now"],
    ],
    action: "Refresh status",
    kind: "system-health",
  },
  "qr-settings": {
    description:
      "Manage QR payment details and the DuitNow QR configuration shown at checkout.",
    stats: [
      ["QR payments today", "68", "RM 3,420 collected"],
      ["Configuration", "Active", "Available at checkout"],
      ["Settlement", "Daily", "Next settlement tomorrow"],
    ],
    columns: ["Setting", "Current value", "Status"],
    rows: [
      ["Payment method", "DuitNow QR", "Enabled"],
      ["Merchant display name", "Resto Dining Group", "Verified"],
      ["QR image", "Company QR", "Configured"],
      ["Payment confirmation", "Server verified", "Enabled"],
    ],
    action: "Edit QR settings",
    kind: "qr-settings",
  },
  "payment-providers": {
    description:
      "Configure payment methods available to your branches and terminals.",
    stats: [
      ["Payment methods", "4", "Enabled for checkout"],
      ["Providers connected", "2", "DuitNow and card terminal"],
      ["Needs attention", "0", "All connections healthy"],
    ],
    columns: ["Method", "Provider", "Branches", "Settlement", "Status"],
    rows: [
      ["Cash", "Cash drawer", "All branches", "Immediate", "Enabled"],
      ["QR", "DuitNow", "4 branches", "Daily", "Enabled"],
      ["Card", "Card terminal", "2 branches", "T+1", "Enabled"],
      ["E-wallet", "Provider integration", "1 branch", "T+1", "Setup"],
    ],
    action: "Add payment method",
    kind: "payment-providers",
  },
  einvoice: {
    description:
      "Review e-invoice submission status and manage company tax identity details.",
    stats: [
      ["Submitted this month", "164", "98.8% accepted"],
      ["Pending", "2", "Awaiting validation"],
      ["Action required", "1", "Review rejection details"],
    ],
    columns: ["Invoice", "Order", "Buyer", "Submitted", "Validation", "Status"],
    rows: [
      [
        "INV-2026-0482",
        "#10482",
        "Walk-in customer",
        "11:44 AM",
        "Accepted",
        "Submitted",
      ],
      [
        "INV-2026-0481",
        "#10481",
        "A. Rahman",
        "11:40 AM",
        "Accepted",
        "Submitted",
      ],
      [
        "INV-2026-0478",
        "#10476",
        "Company buyer",
        "10:52 AM",
        "Invalid tax ID",
        "Action required",
      ],
    ],
    action: "View e-invoice settings",
    kind: "einvoice",
  },
};

export const adminModuleData = Object.fromEntries(
  Object.entries(configs).map(([id, config]) => [
    id,
    {
      ...config,
      columns:
        id === "cash-shifts"
          ? [...config.columns.slice(0, -1), "Expected cash", "Status"]
          : id === "orders"
            ? [...config.columns.slice(0, -1), "Table", "Payment", "Status"]
            : config.columns,
      rows: makeRows(config.columns, config.rows),
    },
  ]),
);
