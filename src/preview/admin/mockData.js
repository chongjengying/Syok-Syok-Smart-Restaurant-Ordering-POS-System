export const previewNav = [
  {
    group: "ONBOARDING",
    items: [
      ["register", "Create account"],
      ["verify-email", "Verify email"],
      ["login", "Sign in"],
    ],
  },
  {
    group: "COMPANY",
    items: [
      ["company/create", "Create company"],
      ["company/members", "Owner & members"],
      ["company/settings", "Company settings"],
    ],
  },
  { group: "ACCOUNT", items: [["profile", "My profile"]] },
  {
    group: "OPERATIONS",
    items: [
      ["branches", "Branches"],
      ["staff", "Staff"],
    ],
  },
  {
    group: "ACCESS",
    items: [
      ["roles", "Roles & permissions"],
      ["devices", "Devices"],
    ],
  },
];

export const initialBranches = [
  {
    id: "br-01",
    code: "KL-01",
    name: "Bangsar Central",
    address: "Kuala Lumpur, Malaysia",
    manager: "Farah Lim",
    status: "Active",
    devices: 3,
  },
  {
    id: "br-02",
    code: "PJ-01",
    name: "Damansara Uptown",
    address: "Petaling Jaya, Malaysia",
    manager: "Daniel Tan",
    status: "Active",
    devices: 2,
  },
  {
    id: "br-03",
    code: "KL-02",
    name: "Mont Kiara",
    address: "Kuala Lumpur, Malaysia",
    manager: "Unassigned",
    status: "Setup",
    devices: 0,
  },
  {
    id: "br-04",
    code: "JB-01",
    name: "Johor Bahru City",
    address: "Johor, Malaysia",
    manager: "Aisha Rahman",
    status: "Inactive",
    devices: 1,
  },
];

export const initialStaff = [
  {
    id: "st-01",
    employeeId: "EMP-001",
    name: "Farah Lim",
    email: "farah@example.test",
    role: "Branch Manager",
    branch: "Bangsar Central",
    additionalBranches: ["Damansara Uptown"],
    status: "Active",
    pinReady: true,
    posAccess: true,
  },
  {
    id: "st-02",
    employeeId: "EMP-002",
    name: "Daniel Tan",
    email: "daniel@example.test",
    role: "Branch Manager",
    branch: "Damansara Uptown",
    additionalBranches: [],
    status: "Active",
    pinReady: true,
    posAccess: true,
  },
  {
    id: "st-03",
    employeeId: "EMP-003",
    name: "Aisha Rahman",
    email: "aisha@example.test",
    role: "Cashier",
    branch: "Johor Bahru City",
    additionalBranches: [],
    status: "Pending",
    pinReady: false,
    posAccess: true,
  },
  {
    id: "st-04",
    employeeId: "EMP-004",
    name: "Jason Lee",
    email: "jason@example.test",
    role: "Kitchen",
    branch: "Bangsar Central",
    additionalBranches: [],
    status: "Inactive",
    pinReady: true,
    posAccess: true,
  },
  {
    id: "st-05",
    employeeId: "EMP-005",
    name: "Mira Hassan",
    email: "mira@example.test",
    role: "Cashier",
    branch: "Damansara Uptown",
    additionalBranches: [],
    status: "Active",
    pinReady: true,
    posAccess: true,
  },
];

export const initialDevices = [
  {
    id: "dv-01",
    name: "Front Counter 01",
    code: "POS-01",
    type: "POS terminal",
    branch: "Bangsar Central",
    status: "Active",
    lastSeen: "Just now",
  },
  {
    id: "dv-05",
    name: "Front Counter 02",
    code: "POS-02",
    type: "POS terminal",
    branch: "Bangsar Central",
    status: "Active",
    lastSeen: "Just now",
  },
  {
    id: "dv-02",
    name: "Kitchen Display",
    code: "KDS-KL01-01",
    type: "Kitchen display",
    branch: "Bangsar Central",
    status: "Active",
    lastSeen: "2 min ago",
  },
  {
    id: "dv-03",
    name: "Front Counter 02",
    code: "POS-PJ01-01",
    type: "POS terminal",
    branch: "Damansara Uptown",
    status: "Pending",
    lastSeen: "Not activated",
  },
  {
    id: "dv-04",
    name: "Legacy iPad",
    code: "POS-JB01-01",
    type: "POS terminal",
    branch: "Johor Bahru City",
    status: "Revoked",
    lastSeen: "Oct 18, 2026",
  },
];

export const permissionGroups = [
  {
    name: "Operations",
    permissions: [
      "View dashboard",
      "View orders",
      "Create orders",
      "Manage tables",
    ],
  },
  {
    name: "Payments",
    permissions: [
      "Take payment",
      "Apply discounts",
      "Process refunds",
      "View reports",
    ],
  },
  {
    name: "Workspace",
    permissions: [
      "Manage products",
      "Manage staff",
      "Manage devices",
      "Edit company settings",
    ],
  },
];
