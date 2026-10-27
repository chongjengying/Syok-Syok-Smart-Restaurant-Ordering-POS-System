import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { getLocalSupabaseStatus } from "./local-supabase-status.mjs";

const local = getLocalSupabaseStatus();
assert(
  ["localhost", "127.0.0.1"].includes(new URL(local.API_URL).hostname),
  "Local fixtures only",
);
const origin = process.env.POS_TEST_APP_URL || "http://127.0.0.1:5173";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const output = "test-results/admin-workspace";
await mkdir(output, { recursive: true });
const suffix = crypto.randomUUID();
const email = `workspace-${suffix}@example.invalid`;
const password = crypto.randomUUID() + crypto.randomUUID();
const productName = `AA Workspace fixture ${suffix}`;
let userId, productId, browser, page, releaseValidation;
const checks = [],
  errors = [];
async function service(path, method = "GET", body) {
  const response = await fetch(local.API_URL + path, {
    method,
    headers: {
      apikey: local.SERVICE_ROLE_KEY,
      Authorization: `Bearer ${local.SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert(
    response.ok,
    `Local fixture ${method} ${path.split("?")[0]} HTTP ${response.status}`,
  );
  return response.status === 204 ? null : response.json().catch(() => null);
}
try {
  const [branch] = await service(
    "/rest/v1/branches?status=eq.ACTIVE&select=id,company_id&order=created_at.asc&limit=1",
  );
  assert(branch?.company_id);
  const [role] = await service(
    `/rest/v1/roles?company_id=eq.${branch.company_id}&name=eq.ADMIN&scope=eq.COMPANY&select=id&limit=1`,
  );
  assert(role?.id);
  const user = await service("/auth/v1/admin/users", "POST", {
    email,
    password,
    email_confirm: true,
  });
  userId = user.id;
  await service(`/rest/v1/profiles?id=eq.${userId}`, "PATCH", {
    name: "Workspace test administrator",
    company_id: branch.company_id,
    branch_id: branch.id,
    role_id: role.id,
    role_name: "ADMIN",
    status: "ACTIVE",
  });
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(12000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) =>
    assert(
      !JSON.stringify(request.headers()).includes(local.SERVICE_ROLE_KEY),
      "A service-role key reached the browser",
    ),
  );
  const go = async (section) => {
    await page
      .getByRole("button", { name: "Find a module", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Find module by name" })
      .fill(section);
    await page
      .locator(`.admin-command-results [data-admin-section="${section}"]`)
      .click();
    await expect(page).toHaveURL(new RegExp(`#admin/${section}(?:\\?|$)`));
  };
  await page.goto(`${origin}/admin`);
  await page.locator("#current-email").fill(email);
  await page.locator("#current-password").fill(password);
  await page
    .getByRole("button", { name: /sign in/i })
    .last()
    .click();
  await expect(page.locator(".admin-dashboard-metrics")).toBeVisible();
  await expect(page.locator(".admin-summary-card")).toHaveCount(3);
  await expect(page.locator(".admin-primary-nav button")).toHaveCount(7);
  const branchSelector = page.getByRole("combobox", {
    name: "Dashboard branch",
    exact: true,
  });
  await branchSelector.focus();
  assert.equal(
    await branchSelector.evaluate(
      (node) => getComputedStyle(node).outlineStyle,
    ),
    "none",
  );
  assert.equal(
    await branchSelector.evaluate((node) => getComputedStyle(node).boxShadow),
    "none",
    "Only the rounded branch container should highlight",
  );
  assert.equal(
    await branchSelector
      .locator("..")
      .evaluate((node) => node.getBoundingClientRect().height),
    34,
  );
  assert.equal(
    await page.locator(".pos-workspace-toolbar").isVisible(),
    false,
    "Admin must have one toolbar",
  );
  await page.screenshot({
    path: `${output}/dashboard-desktop.png`,
    fullPage: true,
  });
  await go("settings");
  await page.getByRole("button", { name: /Printer settings/ }).click();
  assert(
    new URLSearchParams(page.url().split("?")[1]).get("tab") === "Printer",
  );
  await expect(
    page.getByRole("button", { name: /Add Printer/i }),
  ).toBeVisible();
  await go("profile");
  await page.evaluate(async () => {
    window.__workspaceEvents = [];
    const { accountSupabase } =
      await import("/src/infrastructure/supabase/client.js");
    accountSupabase.auth.onAuthStateChange((event) =>
      window.__workspaceEvents.push({ auth: event }),
    );
    let last = document.querySelector(".admin-workspace");
    new MutationObserver(() => {
      const current = document.querySelector(".admin-workspace");
      if (current !== last) {
        last = current;
        window.__workspaceEvents.push({ workspaceMounted: Boolean(current) });
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
  await page
    .getByRole("textbox", { name: "Full name", exact: true })
    .fill("Workspace profile updated");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("navigation", { name: "Primary modules" })
    .getByRole("button", { name: "Menu", exact: true })
    .click();
  await expect(page).toHaveURL(/#admin\/profile$/);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.locator('.admin-account-form [role="status"]'),
  ).toContainText("Your profile has been updated.");
  const [updated] = await service(
    `/rest/v1/profiles?id=eq.${userId}&select=name,company_id,branch_id`,
  );
  assert.equal(updated.name, "Workspace profile updated");
  assert.equal(updated.company_id, branch.company_id);
  assert.equal(updated.branch_id, branch.id);
  checks.push(
    "Real profile save, company/branch context, unsaved guard, and printer settings deep link",
  );

  await go("products");
  await expect(
    page.getByRole("button", { name: "Add Product", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add Product", exact: true }).click();
  let editor = page.getByRole("dialog");
  await editor
    .getByRole("textbox", { name: "Name", exact: true })
    .fill(productName);
  const categoryId = await editor
    .locator("select option")
    .evaluateAll((options) =>
      options.map((option) => option.value).find(Boolean),
    );
  assert(categoryId, "A local category is required");
  await editor
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption(categoryId);
  await editor
    .getByRole("spinbutton", { name: "Price (RM)", exact: true })
    .fill("12.50");
  await editor
    .getByRole("spinbutton", { name: "Cost (RM)", exact: true })
    .fill("4.00");
  await editor
    .getByRole("textbox", { name: "Unit", exact: true })
    .fill("portion");
  const image = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 2;
    canvas.getContext("2d").fillRect(0, 0, 2, 2);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await editor
    .locator('input[type="file"]')
    .setInputFiles({
      name: "fixture.png",
      mimeType: "image/png",
      buffer: Buffer.from(image, "base64"),
    });
  const metadataRequests = [];
  await page.route("**/rest/v1/rpc/save_admin_product", (route) => {
    metadataRequests.push(route.request().postDataJSON());
    return route.continue();
  });
  let uploadFailed = false;
  await page.route("**/storage/v1/object/product-images/**", (route) => {
    if (!uploadFailed && ["POST", "PUT"].includes(route.request().method())) {
      uploadFailed = true;
      return route.abort("failed");
    }
    return route.continue();
  });
  await editor
    .getByRole("button", { name: "Save Product", exact: true })
    .evaluate((button) => {
      button.click();
      button.click();
    });
  await expect(editor.getByRole("alert")).toContainText(
    "Product details were saved, but the image could not be uploaded.",
  );
  const created = await service(
    `/rest/v1/products?product_name=eq.${encodeURIComponent(productName)}&select=id,image_path`,
  );
  assert.equal(created.length, 1);
  productId = created[0].id;
  assert.equal(
    metadataRequests.filter((request) => !request.p_product_id).length,
    1,
    "Duplicate product creation",
  );
  await editor
    .getByRole("button", { name: "Save Product", exact: true })
    .click();
  await expect(editor).toBeHidden();
  const retried = await service(
    `/rest/v1/products?product_name=eq.${encodeURIComponent(productName)}&select=id,image_path`,
  );
  assert.equal(retried.length, 1);
  assert(retried[0].image_path);
  assert.equal(
    metadataRequests.filter((request) => !request.p_product_id).length,
    1,
    "Image retry created a second product",
  );
  assert(
    metadataRequests.some((request) => request.p_product_id === productId),
  );
  await page.unroute("**/rest/v1/rpc/save_admin_product");
  await page.unroute("**/storage/v1/object/product-images/**");
  checks.push(
    "Real product create, duplicate-submit guard, failed image upload, and successful retry without duplicate rows",
  );

  await page
    .getByRole("textbox", { name: "Search product name or code" })
    .fill(productName);
  await expect(page.locator(".admin-menu-table tbody tr")).toHaveCount(1);
  await page
    .locator(".admin-menu-table tbody tr")
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  editor = page.getByRole("dialog");
  await editor
    .getByRole("textbox", { name: "Unit", exact: true })
    .fill("test portion");
  await editor
    .getByRole("button", { name: "Save Product", exact: true })
    .click();
  await expect(editor).toBeHidden();
  await expect(
    page.getByRole("textbox", { name: "Search product name or code" }),
  ).toHaveValue(productName);
  const [edited] = await service(
    `/rest/v1/products?id=eq.${productId}&select=unit`,
  );
  assert.equal(edited.unit, "test portion");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const csv = await readFile(await (await download).path(), "utf8");
  assert(csv.includes(productName));
  await page.screenshot({ path: `${output}/menu-desktop.png`, fullPage: true });
  checks.push("Real product edit, retained table search, and CSV download");

  await go("orders");
  await page.goto(`${origin}/admin#admin/orders?page=invalid`);
  await expect(page.locator(".admin-content")).toBeVisible();
  await page.waitForTimeout(500);
  assert(
    !(await page.locator('.admin-content [role="alert"]').count()),
    "Invalid page must fall back to page one",
  );
  await go("settings");
  await page.goBack();
  await expect(page).toHaveURL(/#admin\/orders/);
  checks.push("Legacy URLs, browser Back, and invalid pagination handling");

  for (const [width, height] of [
    [1440, 1000],
    [1366, 900],
    [1024, 768],
    [768, 1024],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await go("dashboard");
    await expect(page.locator(".admin-dashboard-metrics")).toBeVisible();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: `${output}/dashboard-${width}.png`,
      fullPage: true,
    });
    if (width < 1024) {
      const trigger = page.getByRole("button", { name: /Admin Menu/i });
      await trigger.click();
      const navigation = page.getByRole("dialog", {
        name: "Admin navigation",
        exact: true,
      });
      for (let index = 0; index < 24; index++) {
        await page.keyboard.press(index < 12 ? "Tab" : "Shift+Tab");
        assert(
          await navigation.evaluate((dialog) =>
            dialog.contains(document.activeElement),
          ),
        );
      }
      await page.keyboard.press("Escape");
      await expect(navigation).toBeHidden();
      await expect(trigger).toBeFocused();
    }
  }
  checks.push(
    "Five responsive sizes, no document overflow, mobile focus trap, Escape, and focus restoration",
  );
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.route("**/rest/v1/rpc/get_my_permissions", (route) =>
    route.fulfill({ status: 200, json: ["category.view"] }),
  );
  await page.reload();
  await expect(page.locator(".admin-primary-nav button")).toHaveCount(2);
  await expect(page.locator(".admin-primary-nav")).not.toContainText("Reports");
  await page
    .locator(".admin-primary-nav")
    .getByRole("button", { name: "Menu", exact: true })
    .click();
  await expect(page).toHaveURL(/#admin\/categories$/);
  await page.goto(`${origin}/admin#admin/users`);
  await expect(page).toHaveURL(/#admin\/categories$/);
  checks.push(
    "UI permission simulation hides unavailable modules, opens first permitted tab, and rejects forbidden routes; backend RBAC verified separately",
  );
  await page.unroute("**/rest/v1/rpc/get_my_permissions");
  await page.goto(`${origin}/admin#admin/profile`);
  await expect(page.locator(".admin-account-form")).toBeVisible();
  let held = false;
  const validationGate = new Promise((resolve) => {
    releaseValidation = resolve;
  });
  await page.route("**/rest/v1/profiles?*", async (route) => {
    if (!held && route.request().method() === "GET") {
      held = true;
      await validationGate;
    }
    await route.continue();
  });
  await page.evaluate(async () => {
    const { accountSupabase } =
      await import("/src/infrastructure/supabase/client.js");
    const result = await accountSupabase.auth.refreshSession();
    if (result.error) throw new Error("Fixture token refresh failed");
  });
  await expect.poll(() => held).toBe(true);
  await expect(page.locator(".admin-account-form")).toBeVisible();
  await page.evaluate(async () => {
    const { accountSupabase } =
      await import("/src/infrastructure/supabase/client.js");
    const result = await accountSupabase.auth.signOut();
    if (result.error) throw new Error("Fixture sign-out failed");
  });
  await expect(page.locator("#current-email")).toBeVisible();
  releaseValidation();
  await page.waitForTimeout(500);
  await expect(page.locator("#current-email")).toBeVisible();
  await expect(page.locator(".admin-workspace")).toHaveCount(0);
  checks.push(
    "Real token refresh preserves the form; late validation cannot restore a signed-out session",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    `${output}/results.json`,
    JSON.stringify(
      {
        status: "VERIFIED PASS",
        environment: origin,
        checks,
        runtimeErrors: errors.length,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ status: "VERIFIED PASS", checks }, null, 2));
} catch (error) {
  if (page) {
    await page.screenshot({ path: `${output}/failure.png`, fullPage: true });
    console.log(
      JSON.stringify(await page.evaluate(() => window.__workspaceEvents || [])),
    );
  }
  console.error("VERIFIED FAIL:", error.message);
  process.exitCode = 1;
} finally {
  releaseValidation?.();
  await browser?.close();
  const fixtures = await service(
    `/rest/v1/products?product_name=eq.${encodeURIComponent(productName)}&select=id,image_path`,
  ).catch(() => []);
  for (const fixture of fixtures) {
    assert(
      !productId || fixture.id === productId,
      "Cleanup must only target the created fixture",
    );
    if (fixture.image_path)
      await service("/storage/v1/object/product-images", "DELETE", {
        prefixes: [fixture.image_path],
      });
    await service(
      `/rest/v1/inventory_items?product_id=eq.${fixture.id}`,
      "DELETE",
    );
    await service(`/rest/v1/products?id=eq.${fixture.id}`, "DELETE");
  }
  if (userId) await service(`/auth/v1/admin/users/${userId}`, "DELETE");
}
