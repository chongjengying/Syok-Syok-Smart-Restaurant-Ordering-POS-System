import assert from "node:assert/strict";
import {
  adminSections,
  getAdminNavigation,
} from "../src/components/admin/adminNavigation.js";
import { csvCell } from "../src/utils/downloadCsv.js";

const full = getAdminNavigation(
  adminSections.map((item) => item[2]).filter(Boolean),
);
assert.deepEqual(
  full.map((module) => module.label),
  ["Dashboard", "Menu", "Orders", "Tables", "Staff", "Reports", "Settings"],
);
assert.equal(
  new Set(full.flatMap((module) => module.sections.map((item) => item[0])))
    .size,
  adminSections.length,
);
const limited = getAdminNavigation(["category.view", "payment.view"]);
assert.deepEqual(
  limited.map((module) => module.id),
  ["menu", "orders", "settings"],
);
assert.equal(
  limited[0].sections[0][0],
  "categories",
  "A module must open its first permitted section",
);
assert.deepEqual(
  limited[1].sections.map((item) => item[0]),
  ["payments", "receipts"],
);
assert(
  !limited
    .flatMap((module) => module.sections)
    .some((item) =>
      ["users", "roles", "company", "system-administration"].includes(item[0]),
    ),
);
assert.deepEqual(
  getAdminNavigation([]),
  [],
  "Personal settings must not grant admin workspace access",
);
assert.equal(csvCell('Nasi, "Special"'), '"Nasi, ""Special"""');
assert.equal(csvCell("=2+2"), '"\'=2+2"');
console.log(
  "VERIFIED PASS: seven modules, legacy routes, permission-filtered defaults, denied workspace, and CSV escaping.",
);
