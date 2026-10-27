import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { adminPanelGroups } from "../adminModuleData.js";
import { previewNav } from "../mockData.js";
import { parseMoney } from "../previewMoney.js";

const origin = process.env.PREVIEW_ORIGIN || "http://127.0.0.1:5173";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
page.setDefaultTimeout(7000);
const errors = [];
const requests = [];
const checks = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("request", (request) => {
  if (!request.url().startsWith(origin) && !request.url().startsWith("data:"))
    requests.push(request.url().split("?")[0]);
});
const dialog = () => page.getByRole("dialog");
const row = (text) => page.locator("main tbody tr").filter({ hasText: text });
const go = async (name, area = "Admin panel") => {
  if (await page.locator(".preview-detail-drawer").isVisible())
    await page
      .locator(".preview-detail-drawer")
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
  await page
    .getByRole("button", { name: "Find a module", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Find module by name" }).fill(name);
  await page
    .locator(".preview-command-results button")
    .filter({
      has: page.locator("span", {
        hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
      }),
    })
    .filter({ has: page.locator("small", { hasText: area }) })
    .click();
};
const view = async (text) => {
  if (await page.locator(".preview-detail-drawer").isVisible())
    await page
      .locator(".preview-detail-drawer")
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
  await row(text).getByRole("button", { name: "View", exact: true }).click();
};
const close = async () =>
  dialog().getByRole("button", { name: "Close dialog", exact: true }).click();
const check = async (name, work) => {
  await work();
  checks.push(name);
  console.log(`VERIFIED PASS: ${name}`);
};

try {
  assert.equal(parseMoney("RM 1,234.56"), 123456);
  assert.equal(parseMoney("-RM 5.00", true), -500);
  assert(Number.isNaN(parseMoney("-5")));
  assert(Number.isNaN(parseMoney("1.001")));
  await page.goto(`${origin}/preview/admin/panel/dashboard`, {
    waitUntil: "networkidle",
  });
  await check(
    "New order → cash payment → receipt → stock → report",
    async () => {
      await expect(page.locator(".preview-primary-nav button")).toHaveCount(7);
      await expect(
        page.locator(".preview-dashboard-metrics .preview-stat-card"),
      ).toHaveCount(3);
      await go("Order Management");
      await page
        .getByRole("button", { name: "New order", exact: true })
        .click();
      await dialog()
        .getByRole("button", { name: /Nasi Lemak Royale/ })
        .click();
      await expect(dialog().locator(".preview-dialog-total")).toContainText(
        "19.08",
      );
      const focusable = dialog().locator(
        "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)",
      );
      await focusable.first().focus();
      await page.keyboard.press("Shift+Tab");
      await expect(focusable.last()).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(focusable.first()).toBeFocused();
      await dialog()
        .getByRole("button", { name: "Create order", exact: true })
        .click();
      await expect(row("#ORD-1049")).toHaveCount(1);
      await view("#ORD-1049");
      await dialog()
        .getByRole("button", { name: "Take sample payment" })
        .click();
      await dialog().getByLabel("Cash received (RM)").fill("1");
      await dialog()
        .getByRole("button", { name: "Complete sample payment" })
        .click();
      await expect(dialog().getByRole("alert")).toContainText(
        "cover the order total",
      );
      await dialog().getByLabel("Cash received (RM)").fill("20");
      await dialog()
        .getByRole("button", { name: "Complete sample payment" })
        .click();
      await expect(row("#ORD-1049")).toContainText("Completed");
      await go("Receipts");
      await expect(row("#ORD-1049")).toContainText("19.08");
      await go("Inventory");
      await expect(row("Nasi Lemak Royale")).toContainText("83 portions");
      await expect(page.locator(".preview-movement-list")).toContainText(
        "Sale",
      );
      await go("Sales Reports");
      await expect(row("Bangsar Central")).toContainText("255.88");
    },
  );
  await check(
    "Partial refund validation → cash reconciliation → credit receipt",
    async () => {
      await go("Payments");
      await view("PAY-1049");
      await dialog().getByRole("button", { name: "Request refund" }).click();
      await dialog().getByLabel("Refund amount (RM)").fill("999");
      await dialog()
        .getByLabel("Reason for refund")
        .fill("Sample service recovery");
      await dialog()
        .getByRole("button", { name: "Confirm sample refund" })
        .click();
      await expect(dialog().getByRole("alert")).toContainText("19.08");
      await dialog().getByLabel("Refund amount (RM)").fill("5");
      await dialog()
        .getByRole("button", { name: "Confirm sample refund" })
        .click();
      await expect(row("PAY-1049")).toContainText("Partially refunded");
      await go("Shift Management");
      await expect(row("SH-002")).toContainText("694.08");
      await go("Receipts");
      await expect(row("CRN-PAY-1049")).toContainText(/-RM\s*5\.00/);
      await view("RCP-ORD-1049");
      const download = page.waitForEvent("download");
      await dialog()
        .getByRole("button", { name: "Download sample receipt" })
        .click();
      assert.match((await download).suggestedFilename(), /sample\.txt$/);
      await dialog()
        .getByRole("button", { name: "Record sample reprint" })
        .click();
      await expect(row("RCP-ORD-1049")).toContainText("Reprinted");
    },
  );
  await check(
    "Stock receiving, transfer, and negative-stock guard",
    async () => {
      await go("Inventory");
      await page
        .getByRole("button", { name: "Record movement", exact: true })
        .click();
      await dialog()
        .getByLabel("Stock item")
        .selectOption({ value: "stock-0" });
      await dialog().getByLabel("Quantity (portions)").fill("10");
      await dialog().getByLabel("Reason / reference").fill("PO-SAMPLE-01");
      await dialog().getByRole("button", { name: "Save movement" }).click();
      await expect(row("Nasi Lemak Royale")).toContainText("93 portions");
      await page
        .getByRole("button", { name: "Record movement", exact: true })
        .click();
      await dialog().getByLabel("Movement type").selectOption("Waste");
      await dialog().getByLabel("Quantity (portions)").fill("999");
      await dialog().getByLabel("Reason / reference").fill("Damaged stock");
      await dialog().getByRole("button", { name: "Save movement" }).click();
      await expect(dialog().getByRole("alert")).toContainText("negative stock");
      await dialog().getByLabel("Movement type").selectOption("Transfer");
      await dialog().getByLabel("Quantity (portions)").fill("3");
      await dialog()
        .getByLabel("Receiving branch (transfers only)")
        .selectOption("Damansara Uptown");
      await dialog().getByRole("button", { name: "Save movement" }).click();
      await expect(row("Nasi Lemak Royale")).toContainText("90 portions");
      await page
        .getByLabel("Current branch", { exact: true })
        .selectOption("Damansara Uptown");
      await expect(row("Nasi Lemak Royale")).toContainText("3 portions");
      await page
        .getByLabel("Current branch", { exact: true })
        .selectOption("Bangsar Central");
    },
  );
  await check(
    "Shift duplicate guard, cash variance, and reopening",
    async () => {
      await go("Shift Management");
      await page
        .getByRole("button", { name: "Open register", exact: true })
        .click();
      await dialog()
        .getByRole("button", { name: "Open register", exact: true })
        .click();
      await expect(dialog().getByRole("alert")).toContainText(
        "already has an open register",
      );
      await close();
      await view("SH-002");
      await dialog()
        .getByRole("button", { name: "Close & reconcile shift" })
        .click();
      await dialog().getByLabel("Counted cash (RM)").fill("690");
      await dialog()
        .getByRole("button", { name: "Close & reconcile", exact: true })
        .click();
      await expect(dialog().getByRole("alert")).toContainText("variance");
      await dialog()
        .getByLabel("Variance explanation")
        .fill("Sample count discrepancy reviewed");
      await dialog()
        .getByRole("button", { name: "Close & reconcile", exact: true })
        .click();
      await expect(row("SH-002")).toContainText("Closed");
      await close();
      await page
        .getByRole("button", { name: "Open register", exact: true })
        .click();
      await dialog()
        .getByRole("button", { name: "Open register", exact: true })
        .click();
      await expect(row("SH-003")).toContainText("Open");
    },
  );
  await check(
    "Staff record creation and PIN setup stay separate from membership",
    async () => {
      await go("Staff");
      await page
        .getByRole("button", { name: "Create staff record", exact: true })
        .click();
      await dialog()
        .getByLabel("Full name", { exact: true })
        .fill("Sample Staff");
      await dialog().getByLabel("Employee ID", { exact: true }).fill("EMP-006");
      await dialog()
        .getByRole("button", { name: "Create staff record", exact: true })
        .click();
      await expect(row("EMP-006")).toContainText("PIN setup required");
      await row("EMP-006")
        .getByRole("button", { name: "Set up PIN", exact: true })
        .click();
      await dialog()
        .getByRole("button", { name: "Confirm sample PIN setup" })
        .click();
      await expect(row("EMP-006")).toContainText("Active");
      await go("Owner & members", "Workspace setup");
      await expect(row("Sample Staff")).toHaveCount(0);
      await page
        .getByRole("button", { name: "Invite member", exact: true })
        .click();
      await dialog()
        .getByLabel("Full name", { exact: true })
        .fill("Sample Admin");
      await dialog()
        .getByLabel("Work email", { exact: true })
        .fill("sample-admin@example.test");
      await dialog()
        .getByRole("button", { name: "Create sample invitation" })
        .click();
      await expect(row("Sample Admin")).toContainText("Pending");
    },
  );
  await check(
    "Role changes require confirmation and persist after navigation",
    async () => {
      await go("Roles & Permissions");
      await page.getByLabel("Process refunds", { exact: false }).check();
      await page
        .getByRole("button", { name: "Review changes", exact: true })
        .click();
      await expect(dialog()).toContainText("Granted");
      await dialog().getByRole("button", { name: "Keep editing" }).click();
      await page
        .getByRole("button", { name: "Review changes", exact: true })
        .click();
      await dialog()
        .getByRole("button", { name: "Confirm permission changes" })
        .click();
      await go("Dashboard");
      await go("Roles & Permissions");
      await expect(
        page.getByLabel("Process refunds", { exact: false }),
      ).toBeChecked();
    },
  );
  await check(
    "Terminal creation → temporary code → activation → replacement → revoke",
    async () => {
      await go("Terminals");
      await page
        .getByRole("button", { name: "Register terminal", exact: true })
        .click();
      await dialog().getByLabel("Terminal name").fill("Sample Counter");
      await dialog().getByLabel("Terminal code").fill("POS-03");
      await dialog()
        .getByRole("button", { name: "Register terminal", exact: true })
        .click();
      await row("Sample Counter")
        .getByRole("button", { name: "Manage terminal" })
        .click();
      await dialog()
        .getByRole("button", { name: "Issue activation code", exact: true })
        .click();
      const code = (
        await dialog().locator(".preview-activation-code > strong").innerText()
      ).replace(/\s/g, "");
      await dialog().getByLabel("Physical device name").fill("Sample iPad");
      await dialog().getByLabel("Enter sample activation code").fill("000000");
      await dialog()
        .getByRole("button", { name: "Activate sample device" })
        .click();
      await expect(dialog().getByRole("alert")).toContainText("does not match");
      await dialog().getByLabel("Enter sample activation code").fill(code);
      await dialog()
        .getByRole("button", { name: "Activate sample device" })
        .click();
      await expect(dialog()).toContainText("Sample iPad");
      await expect(
        dialog().getByRole("button", { name: "Activate sample device" }),
      ).toHaveCount(0);
      await dialog()
        .getByRole("button", { name: "Revoke device", exact: true })
        .click();
      await dialog()
        .getByRole("button", { name: "Confirm revoke", exact: true })
        .click();
      await expect(dialog()).toContainText("Revoked");
      await dialog()
        .getByRole("button", { name: "Reactivate terminal", exact: true })
        .click();
      await dialog()
        .getByRole("button", { name: "Confirm enable", exact: true })
        .click();
      await dialog()
        .getByRole("button", { name: "Issue activation code", exact: true })
        .click();
      const replacementCode = (
        await dialog().locator(".preview-activation-code > strong").innerText()
      ).replace(/\s/g, "");
      await dialog()
        .getByLabel("Physical device name")
        .fill("Replacement iPad");
      await dialog()
        .getByLabel("Enter sample activation code")
        .fill(replacementCode);
      await dialog()
        .getByRole("button", { name: "Activate sample device" })
        .click();
      await dialog().getByRole("button", { name: "Replace hardware" }).click();
      await dialog().getByRole("button", { name: "Confirm replace" }).click();
      await expect(
        dialog().getByRole("button", { name: "Issue activation code" }),
      ).toBeVisible();
      await dialog().getByRole("button", { name: "Disable terminal" }).click();
      await dialog().getByRole("button", { name: "Confirm disable" }).click();
      await expect(dialog()).toContainText("Disabled");
      await close();
      await expect(row("Sample Counter")).toContainText("Disabled");
    },
  );
  await check(
    "Settings unsaved-change guard and saved charge affect checkout",
    async () => {
      await go("Restaurant Settings");
      await page
        .getByRole("button", { name: "Tax & regional", exact: true })
        .click();
      await page.getByLabel("Service charge (%)").fill("10");
      await go("Dashboard");
      await expect(dialog()).toContainText("unsaved changes");
      await dialog().getByRole("button", { name: "Keep editing" }).click();
      await page
        .getByRole("button", { name: "Review changes", exact: true })
        .click();
      await dialog()
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await go("Order Management");
      await page
        .getByRole("button", { name: "New order", exact: true })
        .click();
      await dialog()
        .getByRole("button", { name: /Nasi Lemak Royale/ })
        .click();
      await expect(dialog().locator(".preview-dialog-total")).toContainText(
        "20.88",
      );
      await close();
    },
  );
  await check(
    "Catalog and voucher CRUD connect to the order composer",
    async () => {
      await go("Categories");
      await page
        .getByRole("button", { name: "Add category", exact: true })
        .click();
      await dialog().getByLabel("Category *", { exact: true }).fill("Seasonal");
      await dialog().getByLabel("Menu order *", { exact: true }).fill("5");
      await dialog().getByRole("button", { name: "Create record" }).click();
      await expect(row("Seasonal")).toHaveCount(1);
      await go("Menu Management");
      await page
        .getByRole("button", { name: "Add menu item", exact: true })
        .click();
      await dialog()
        .getByLabel("Product *", { exact: true })
        .fill("Sample Seasonal Tea");
      await dialog().getByLabel("SKU *", { exact: true }).fill("SEASON-001");
      await dialog()
        .getByLabel("Category", { exact: true })
        .selectOption("Seasonal");
      await dialog()
        .getByRole("button", { name: "Pricing & availability", exact: true })
        .click();
      await dialog().getByLabel("Price *", { exact: true }).fill("10");
      await dialog()
        .getByLabel("Stock tracking", { exact: true })
        .selectOption("Off");
      await dialog().getByRole("button", { name: "Create record" }).click();
      await expect(row("Sample Seasonal Tea")).toContainText("10.00");
      await go("Vouchers");
      await page
        .getByRole("button", { name: "Create voucher", exact: true })
        .click();
      await dialog().getByLabel("Code *", { exact: true }).fill("SAMPLE10");
      await dialog()
        .getByLabel("Voucher *", { exact: true })
        .fill("Sample welcome");
      await dialog().getByLabel("Value *", { exact: true }).fill("10");
      await dialog().getByRole("button", { name: "Create record" }).click();
      await expect(row("SAMPLE10")).toContainText("10%");
      await go("Order Management");
      await page
        .getByRole("button", { name: "New order", exact: true })
        .click();
      await dialog()
        .getByRole("button", { name: /Sample Seasonal Tea/ })
        .click();
      await dialog()
        .getByLabel("Voucher", { exact: true })
        .selectOption("SAMPLE10");
      await expect(dialog().locator(".preview-dialog-total")).toContainText(
        "10.44",
      );
      await dialog()
        .getByRole("button", { name: "Create order", exact: true })
        .click();
      await expect(row("#ORD-1050")).toContainText("10.44");
      await go("Vouchers");
      await expect(row("SAMPLE10")).toContainText("1 / 100");
      await go("Discount Activity");
      await expect(row("SAMPLE10")).toContainText("1.00");
    },
  );
  await check(
    "Full refund can return items once and retains audit history",
    async () => {
      await go("Payments");
      await view("PAY-1049");
      await dialog().getByRole("button", { name: "Request refund" }).click();
      await dialog().getByLabel("Reason for refund").fill("Full sample return");
      await dialog()
        .getByLabel("Return all items to stock", { exact: true })
        .check();
      await dialog()
        .getByRole("button", { name: "Confirm sample refund" })
        .click();
      await expect(row("PAY-1049")).toContainText("Refunded");
      await go("Inventory");
      await expect(row("Nasi Lemak Royale")).toContainText("91 portions");
      await expect(page.locator(".preview-movement-list")).toContainText(
        "Refund return",
      );
      await go("Audit Trail");
      await expect(page.locator("main")).toContainText("REFUND_APPROVED");
    },
  );
  await check(
    "Branch and company settings retain all reviewed fields",
    async () => {
      await go("Branches");
      await page
        .getByRole("button", { name: "Add branch", exact: true })
        .click();
      await dialog()
        .getByLabel("Branch name", { exact: true })
        .fill("Sample Outlet");
      await dialog()
        .getByLabel("Branch code", { exact: true })
        .fill("SAMPLE-01");
      await expect(dialog()).toContainText("Unsaved changes");
      await dialog()
        .getByRole("button", { name: "Cancel", exact: true })
        .click();
      await expect(dialog()).toContainText("Discard this form?");
      await dialog()
        .getByRole("button", { name: "Keep editing", exact: true })
        .click();
      await dialog()
        .getByRole("button", { name: "Save branch", exact: true })
        .click();
      await expect(page.locator("main")).toContainText("Sample Outlet");
      await go("Company");
      await page
        .getByLabel("Phone number", { exact: true })
        .fill("+60 3-5555 0199");
      await page
        .getByRole("button", { name: "Review changes", exact: true })
        .click();
      await dialog()
        .getByRole("button", { name: "Save company settings" })
        .click();
      await go("Dashboard");
      await go("Company");
      await expect(
        page.getByLabel("Phone number", { exact: true }),
      ).toHaveValue("+60 3-5555 0199");
    },
  );
  await check(
    "Table reservation and e-invoice correction have complete local actions",
    async () => {
      await go("Table Management");
      await page
        .getByRole("button", { name: "Table list view", exact: true })
        .click();
      await page
        .getByRole("textbox", { name: "Search tables" })
        .fill("Table 19");
      await view("Table 19");
      await dialog()
        .getByRole("button", { name: "Reserve table", exact: true })
        .click();
      await expect(row("Table 19")).toContainText("Reserved");
      await view("Table 19");
      await dialog()
        .getByRole("button", { name: "Release reservation" })
        .click();
      await expect(row("Table 19")).toContainText("Available");
      await go("E-Invoice");
      await view("INV-2026-0478");
      await dialog()
        .getByRole("button", { name: "Correct buyer details" })
        .click();
      await dialog().getByLabel("Tax ID *", { exact: true }).fill("MOCK123456");
      await dialog()
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await view("INV-2026-0478");
      await dialog()
        .getByRole("button", { name: "Submit sample invoice" })
        .click();
      await expect(row("INV-2026-0478")).toContainText("Submitted");
    },
  );
  await check(
    "Details drawer preserves search and filters after editing",
    async () => {
      await go("Menu Management");
      await page
        .getByRole("textbox", { name: "Search menu items" })
        .fill("Wagyu");
      await view("Signature Wagyu");
      await expect(page.locator(".preview-detail-drawer")).toBeVisible();
      await dialog()
        .getByRole("button", { name: "Edit details", exact: true })
        .click();
      await dialog()
        .getByRole("button", { name: "Pricing & availability", exact: true })
        .click();
      await dialog().getByLabel("Price *", { exact: true }).fill("40");
      await dialog()
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await expect(page.locator(".preview-detail-drawer")).toBeVisible();
      await close();
      await expect(
        page.getByRole("textbox", { name: "Search menu items" }),
      ).toHaveValue("Wagyu");
      await expect(row("Signature Wagyu")).toContainText("40.00");
      await row("Signature Wagyu")
        .getByRole("button", { name: "Disable", exact: true })
        .click();
      await expect(row("Signature Wagyu")).toContainText("Unavailable");
      await row("Signature Wagyu")
        .getByRole("button", { name: "Enable", exact: true })
        .click();
      await expect(row("Signature Wagyu")).toContainText("Available");
      await row("Signature Wagyu")
        .getByRole("button", { name: "Delete", exact: true })
        .click();
      await expect(dialog()).toContainText("Historical");
      await dialog()
        .getByRole("button", { name: "Cancel", exact: true })
        .click();
      await expect(row("Signature Wagyu")).toHaveCount(1);
    },
  );
  await check(
    "Image, branch availability, and required priced modifiers work in checkout",
    async () => {
      await go("Menu Management");
      await page
        .getByRole("button", { name: "Add menu item", exact: true })
        .click();
      await dialog()
        .getByLabel("Product *", { exact: true })
        .fill("Customized Tea");
      await dialog().getByLabel("SKU *", { exact: true }).fill("CUSTOM-001");
      await dialog()
        .getByLabel("Description", { exact: true })
        .fill("Tea with a required size choice.");
      await dialog()
        .locator('input[type="file"]')
        .setInputFiles({
          name: "sample.png",
          mimeType: "image/png",
          buffer: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6aUAAAAASUVORK5CYII=",
            "base64",
          ),
        });
      await expect(dialog().getByAltText("Menu item preview")).toBeVisible();
      await dialog()
        .getByRole("button", { name: "Pricing & availability", exact: true })
        .click();
      await dialog().getByLabel("Price *", { exact: true }).fill("12");
      await dialog()
        .getByLabel("Stock tracking", { exact: true })
        .selectOption("Off");
      await dialog()
        .getByLabel("Available in all branches", { exact: true })
        .uncheck();
      await dialog().getByLabel("Bangsar Central", { exact: true }).check();
      await dialog()
        .getByRole("button", { name: "Modifiers & add-ons", exact: true })
        .click();
      await dialog()
        .getByRole("button", { name: "Add group", exact: true })
        .click();
      await dialog().getByLabel("Group name", { exact: true }).fill("Size");
      await dialog()
        .getByLabel("Require at least one option", { exact: true })
        .check();
      await dialog()
        .getByLabel("Option 1 name", { exact: true })
        .fill("Regular");
      await dialog()
        .getByRole("button", { name: "Add option", exact: true })
        .click();
      await dialog().getByLabel("Option 2 name", { exact: true }).fill("Large");
      await dialog()
        .getByLabel("Option 2 extra (RM)", { exact: true })
        .fill("2");
      await dialog()
        .getByRole("button", { name: "Create record", exact: true })
        .click();
      await expect(row("Customized Tea")).toHaveCount(1);
      await page
        .getByLabel("Current branch", { exact: true })
        .selectOption("Damansara Uptown");
      await go("Order Management");
      await page
        .getByRole("button", { name: "New order", exact: true })
        .click();
      await expect(
        dialog().getByRole("button", { name: /Customized Tea/ }),
      ).toHaveCount(0);
      await close();
      await page
        .getByLabel("Current branch", { exact: true })
        .selectOption("Bangsar Central");
      await page
        .getByRole("button", { name: "New order", exact: true })
        .click();
      await expect(dialog()).toContainText("POS-01");
      await expect(dialog()).toContainText("SH-003");
      await dialog()
        .getByRole("button", { name: /Customized Tea/ })
        .click();
      await dialog()
        .getByRole("button", { name: "Add to order", exact: true })
        .click();
      await expect(dialog().getByRole("alert")).toContainText("Choose");
      await dialog().getByRole("radio", { name: /Large/ }).check();
      await dialog()
        .getByRole("button", { name: "Add to order", exact: true })
        .click();
      await expect(dialog()).toContainText("Size: Large");
      await expect(dialog().locator(".preview-dialog-total")).toContainText(
        "16.24",
      );
      await dialog()
        .getByRole("button", { name: "Create order", exact: true })
        .click();
      await expect(row("#ORD-1051")).toContainText("16.24");
      await row("#ORD-1051")
        .getByRole("button", { name: "Mark ready", exact: true })
        .click();
      await expect(row("#ORD-1051")).toContainText("Ready");
      await row("#ORD-1051")
        .getByRole("button", { name: "Take payment", exact: true })
        .click();
      await dialog()
        .getByLabel("Payment method", { exact: true })
        .selectOption("Card");
      await dialog()
        .getByRole("button", { name: "Complete sample payment" })
        .click();
      await expect(row("#ORD-1051")).toContainText("Completed");
    },
  );
  await check(
    "Printer setup and sample test print work from grouped Settings",
    async () => {
      await go("Restaurant Settings");
      await page
        .getByRole("button", { name: "Printer settings", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Add printer", exact: true })
        .click();
      await dialog()
        .getByLabel("Printer name", { exact: true })
        .fill("Sample receipt printer");
      await dialog()
        .getByRole("button", { name: "Save printer", exact: true })
        .click();
      await expect(row("Sample receipt printer")).toContainText("80 mm");
      const download = page.waitForEvent("download");
      await row("Sample receipt printer")
        .getByRole("button", { name: "Download test print", exact: true })
        .click();
      assert.match((await download).suggestedFilename(), /^sample-print-/);
      await row("Sample receipt printer")
        .getByRole("button", { name: "Disable", exact: true })
        .click();
      await expect(row("Sample receipt printer")).toContainText("Disabled");
    },
  );
  await check(
    "Custom report dates and CSV reconcile with dashboard totals",
    async () => {
      await go("Dashboard");
      const sales = await page
        .locator(".preview-dashboard-metrics .preview-stat-card")
        .first()
        .locator("strong")
        .innerText();
      await go("Sales Reports");
      await expect(row("Bangsar Central")).toContainText(sales);
      await page
        .getByLabel("Date range", { exact: true })
        .selectOption("Custom range");
      await page.getByLabel("From date", { exact: true }).fill("2020-01-01");
      await page.getByLabel("To date", { exact: true }).fill("2020-01-31");
      await expect(row("Bangsar Central")).toContainText("0.00");
      await expect(page.locator("main")).toContainText("No collected payments");
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download reports CSV" }).click();
      const file = await download;
      const csv = await readFile(await file.path(), "utf8");
      assert.match(csv, /Gross sales/);
      assert.match(csv, /Refunds/);
      await page
        .getByLabel("Date range", { exact: true })
        .selectOption("Today");
      await expect(row("Bangsar Central")).toContainText(sales);
    },
  );
  await check("Manager preview uses the saved permission profile", async () => {
    await go("Menu Management");
    await page
      .getByRole("button", { name: "Preview options", exact: true })
      .click();
    await page
      .getByLabel("Preview role", { exact: true })
      .selectOption("Manager");
    await page
      .getByRole("button", { name: "Preview options", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Add menu item", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Preview options", exact: true })
      .click();
    await page
      .getByLabel("Preview role", { exact: true })
      .selectOption("Owner");
    await page
      .getByRole("button", { name: "Preview options", exact: true })
      .click();
    await go("Roles & Permissions");
    await page.getByLabel("Manage products", { exact: false }).check();
    await page
      .getByRole("button", { name: "Review changes", exact: true })
      .click();
    await dialog()
      .getByRole("button", { name: "Confirm permission changes" })
      .click();
    await go("Menu Management");
    await page
      .getByRole("button", { name: "Preview options", exact: true })
      .click();
    await page
      .getByLabel("Preview role", { exact: true })
      .selectOption("Manager");
    await page
      .getByRole("button", { name: "Preview options", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Add menu item", exact: true }),
    ).toBeEnabled();
    await go("Sales Reports");
    await expect(page.locator('main [role="alert"]')).toContainText(
      "additional access",
    );
    await page
      .getByRole("button", { name: "Preview options", exact: true })
      .click();
    await page
      .getByLabel("Preview role", { exact: true })
      .selectOption("Owner");
    await page
      .getByRole("button", { name: "Preview options", exact: true })
      .click();
  });
  await check(
    "Search, actual CSV export, read-only role, state demos, and dark mode",
    async () => {
      await go("Menu Management");
      await page
        .getByRole("textbox", { name: "Search menu items" })
        .fill("Wagyu");
      await expect(page.locator("main tbody tr")).toHaveCount(1);
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download products CSV" }).click();
      const csv = await download;
      assert.match(await readFile(await csv.path(), "utf8"), /Signature Wagyu/);
      await page
        .getByRole("button", { name: "Preview options", exact: true })
        .click();
      await page
        .getByLabel("Preview role", { exact: true })
        .selectOption("Read only");
      await page
        .getByRole("button", { name: "Preview options", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Add menu item", exact: true }),
      ).toBeDisabled();
      await page.getByRole("button", { name: "Return to owner view" }).click();
      for (const state of [
        "loading",
        "empty",
        "error",
        "offline",
        "access-denied",
        "default",
      ]) {
        await page
          .getByRole("button", { name: "Preview options", exact: true })
          .click();
        await page.getByLabel("Preview screen state").selectOption(state);
        await page
          .getByRole("button", { name: "Preview options", exact: true })
          .click();
        if (state === "loading")
          await expect(
            page.getByRole("status", { name: "Loading screen" }),
          ).toBeVisible();
        else if (["error", "offline", "access-denied"].includes(state))
          await expect(page.locator('main [role="alert"]')).toBeVisible();
      }
      await page
        .getByRole("button", { name: "Preview options", exact: true })
        .click();
      await page.getByRole("button", { name: "Switch to dark mode" }).click();
      await page
        .getByRole("button", { name: "Preview options", exact: true })
        .click();
      await expect(page.locator(".preview-app")).toHaveAttribute(
        "data-theme",
        "dark",
      );
      await mkdir("test-results/preview-admin", { recursive: true });
      await page.screenshot({
        path: "test-results/preview-admin/menu-dark.png",
        fullPage: true,
      });
    },
  );
  await check(
    "Deleting a menu item preserves historical order details and cancellation history",
    async () => {
      await go("Menu Management");
      await page
        .getByRole("textbox", { name: "Search menu items" })
        .fill("Sample Seasonal Tea");
      await row("Sample Seasonal Tea")
        .getByRole("button", { name: "Delete", exact: true })
        .click();
      await dialog()
        .getByRole("button", { name: "Delete menu item", exact: true })
        .click();
      await expect(row("Sample Seasonal Tea")).toHaveCount(0);
      await go("Order Management");
      await view("#ORD-1050");
      await expect(dialog()).toContainText("Sample Seasonal Tea");
      await dialog()
        .getByRole("button", { name: "Cancel order", exact: true })
        .click();
      await dialog()
        .getByLabel("Cancellation reason", { exact: true })
        .fill("Sample customer cancelled");
      await dialog()
        .getByRole("button", { name: "Cancel order", exact: true })
        .click();
      await expect(page.locator(".preview-detail-drawer")).toContainText(
        "Cancelled",
      );
      await close();
      await expect(row("#ORD-1050")).toContainText("Cancelled");
    },
  );
  await check(
    "All preview routes render at desktop, tablet, and phone widths",
    async () => {
      const routes = [
        ...new Set(
          [...adminPanelGroups, ...previewNav]
            .flatMap((group) => group.items.map((item) => item[0]))
            .concat("reset-password"),
        ),
      ];
      for (const width of [1440, 1366, 1024, 390]) {
        await page.setViewportSize({ width, height: 900 });
        for (const route of routes) {
          await page.goto(`${origin}/preview/admin/${route}`, {
            waitUntil: "load",
          });
          await expect(page.locator("main h1, main h2").first()).toBeVisible();
          await expect(page.locator(".preview-primary-nav button")).toHaveCount(
            7,
          );
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth > innerWidth,
            ),
            false,
            `${route} overflows at ${width}px`,
          );
        }
      }
      await page.goto(`${origin}/preview/admin/panel/dashboard`);
      await page
        .getByRole("button", { name: "Open navigation", exact: true })
        .click();
      await expect(page.locator(".preview-sidebar")).toHaveClass(/is-open/);
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("button", { name: "Open navigation", exact: true }),
      ).toBeFocused();
      await page.screenshot({
        path: "test-results/preview-admin/dashboard-mobile.png",
        fullPage: true,
      });
      await page.setViewportSize({ width: 1366, height: 900 });
      await page.screenshot({
        path: "test-results/preview-admin/dashboard-desktop.png",
        fullPage: true,
      });
      await page.goto(`${origin}/preview/admin/panel/products`);
      await page.screenshot({
        path: "test-results/preview-admin/menu-desktop.png",
        fullPage: true,
      });
      await page
        .getByRole("textbox", { name: "Search menu items" })
        .fill("Wagyu");
      await view("Signature Wagyu");
      await page.screenshot({
        path: "test-results/preview-admin/menu-drawer-desktop.png",
        fullPage: true,
      });
      await close();
      await page.setViewportSize({ width: 1024, height: 900 });
      await page.goto(`${origin}/preview/admin/panel/dashboard`);
      await page.screenshot({
        path: "test-results/preview-admin/dashboard-tablet.png",
        fullPage: true,
      });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(`${origin}/preview/admin/panel/system-administration`);
      await page.screenshot({
        path: "test-results/preview-admin/settings-desktop.png",
        fullPage: true,
      });
      checks.push(`${routes.length} routes × 4 viewport widths`);
    },
  );
  assert.deepEqual(errors, [], "Browser runtime errors");
  assert.deepEqual(requests, [], "Preview must not call external APIs");
  console.log(
    JSON.stringify(
      {
        status: "VERIFIED PASS",
        checks,
        runtimeErrors: errors.length,
        externalRequests: requests.length,
      },
      null,
      2,
    ),
  );
} catch (error) {
  await mkdir("test-results/preview-admin", { recursive: true });
  await page.screenshot({
    path: "test-results/preview-admin/failure.png",
    fullPage: true,
  });
  console.error("VERIFIED FAIL:", error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
