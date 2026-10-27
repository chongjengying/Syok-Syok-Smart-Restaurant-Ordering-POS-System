import { test, expect } from "@playwright/test";

const nav = (page, name) =>
  page.getByRole("navigation").getByRole("button", { name, exact: true });
async function addProduct(page, name = "Nasi Lemak", note = "") {
  await page
    .getByRole("button", { name: `Customize ${name}`, exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  if (note)
    await dialog
      .getByPlaceholder("e.g. No onions, sauce on the side…")
      .fill(note);
  await dialog
    .getByRole("button", { name: "Add to order", exact: true })
    .click();
  await expect(dialog).toBeHidden();
}
async function startMenu(page, takeaway = false) {
  await nav(page, "New order").click();
  if (takeaway)
    await page.getByRole("button", { name: /Takeaway A little joy/ }).click();
  else
    await page
      .getByRole("button", { name: "Table 01, available", exact: true })
      .click();
  await page
    .getByRole("button", { name: "Continue to menu", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "What’s on the menu?" }),
  ).toBeVisible();
}
async function openCart(page) {
  const toggle = page.getByRole("button", { name: /View order/ });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByRole("button", { name: /Review cart/ }).click();
}
async function assertNoOverflow(page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  expect(
    await page
      .locator(".pv-content")
      .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
  ).toBeTruthy();
}

test.beforeEach(async ({ page, baseURL }) => {
  const requests = [],
    errors = [];
  page.on("request", (request) => requests.push(request.url()));
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) =>
    new URL(route.request().url()).origin === new URL(baseURL).origin
      ? route.continue()
      : route.abort(),
  );
  await page.addInitScript(() => {
    sessionStorage.setItem("pos.activeOrderId", "original-order-sentinel");
    sessionStorage.setItem("pos.pendingOrderId", "original-pending-sentinel");
  });
  page.previewRequests = requests;
  page.previewErrors = errors;
  await page.goto("/pos/preview");
  await expect(
    page.getByRole("heading", { name: "Let’s make it a great service." }),
  ).toBeVisible();
});
test.afterEach(async ({ page }) => {
  expect(page.previewErrors).toEqual([]);
  const forbidden = page.previewRequests.filter((url) =>
    /supabase|\/rest\/v1|\/auth\/v1|\/functions\/v1|\/realtime\/|\/src\/(app\/App|hooks\/|infrastructure\/|repositories\/|services\/)|\/src\/index\.css/.test(
      url,
    ),
  );
  expect(forbidden).toEqual([]);
  expect(
    await page.evaluate(() => sessionStorage.getItem("pos.activeOrderId")),
  ).toBe("original-order-sentinel");
  expect(
    await page.evaluate(() => sessionStorage.getItem("pos.pendingOrderId")),
  ).toBe("original-pending-sentinel");
});

test("overview, search, categories, required modifier, notes and responsive cart", async ({
  page,
}, info) => {
  await assertNoOverflow(page);
  await page.screenshot({ path: info.outputPath("overview.png") });
  await startMenu(page);
  await page
    .getByRole("searchbox", { name: "Search menu", exact: true })
    .fill("coffee");
  await expect(
    page.getByRole("button", { name: "Customize Coffee", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Customize Nasi Lemak" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await page.getByRole("button", { name: "Drinks 2", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Customize / })).toHaveCount(
    2,
  );
  await page.getByRole("button", { name: "All items 6", exact: true }).click();
  await addProduct(page, "Nasi Lemak", "No onions");
  await addProduct(page, "Lemon Tea");
  await page
    .locator(".pv-content")
    .evaluate((element) => element.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath("menu.png") });
  await assertNoOverflow(page);
  await openCart(page);
  await expect(page.getByText("“No onions”", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Increase Nasi Lemak", exact: true })
    .click();
  await expect(page.locator(".pv-review-summary .pv-total")).toHaveText(
    "TotalRM 24.70",
  );
  await page
    .getByRole("button", { name: "Remove Lemon Tea", exact: true })
    .click();
  await expect(
    page.getByText("RM 19.80", { exact: true }).first(),
  ).toBeVisible();
  await assertNoOverflow(page);
});

test("dine-in confirmation, add-on, kitchen, serving, cash, receipt and cleaning", async ({
  page,
}) => {
  await startMenu(page);
  await addProduct(page);
  await openCart(page);
  await page.getByRole("button", { name: "Review order", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm & send to kitchen", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "The kitchen has your order." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add items", exact: true }).click();
  await addProduct(page, "Lemon Tea");
  await openCart(page);
  await page.getByRole("button", { name: "Review order", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm & send to kitchen", exact: true })
    .click();
  await expect(
    page.getByText("Round 2 · Add-on", { exact: true }),
  ).toBeVisible();
  await nav(page, "Kitchen").click();
  const tickets = page
    .locator(".pv-ticket")
    .filter({
      has: page.getByRole("heading", { name: "Table 01", exact: true }),
    });
  await expect(tickets).toHaveCount(2);
  for (let index = 0; index < 2; index++) {
    await tickets
      .filter({
        has: page.getByRole("button", { name: "Start preparing", exact: true }),
      })
      .first()
      .getByRole("button", { name: "Start preparing" })
      .click();
    await tickets
      .filter({
        has: page.getByRole("button", { name: "Mark ready", exact: true }),
      })
      .first()
      .getByRole("button", { name: "Mark ready" })
      .click();
  }
  await nav(page, "To serve").click();
  const ready = page
    .locator(".pv-serving-grid>.pv-panel")
    .filter({
      has: page.getByRole("heading", { name: "Table 01", exact: true }),
    });
  await ready.getByRole("button", { name: "Mark served", exact: true }).click();
  await nav(page, "Orders").click();
  await page
    .locator(".pv-order-card")
    .filter({
      has: page.getByRole("heading", { name: "Table 01", exact: true }),
    })
    .click();
  await page
    .getByRole("button", { name: "View bill & pay", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Cash received", exact: true })
    .fill("10");
  await expect(
    page.getByRole("button", { name: "Confirm payment", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("textbox", { name: "Cash received", exact: true })
    .fill("20");
  await page
    .getByRole("button", { name: "Confirm payment", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Complete order", exact: true })
    .click();
  await expect(
    page.locator(".pv-receipt>p").filter({ hasText: /^MOCK RECEIPT/ }),
  ).toBeVisible();
  await nav(page, "Tables").click();
  await page
    .getByRole("button", { name: "Table 01, dirty", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start cleaning", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Complete cleaning", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Table 01, available", exact: true }),
  ).toBeVisible();
});

test("takeaway pays before kitchen and QR requires a manual confirmation", async ({
  page,
}) => {
  await startMenu(page, true);
  await addProduct(page, "Coffee");
  await openCart(page);
  await page.getByRole("button", { name: "Review order", exact: true }).click();
  await page.getByLabel("Cutlery", { exact: true }).check();
  await page
    .getByRole("button", { name: "Continue to payment", exact: true })
    .click();
  await page
    .getByRole("button", { name: /QR \/ E-wallet Manual confirmation/ })
    .click();
  await page
    .getByRole("button", { name: "Confirm payment", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Yes, payment received", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Complete order", exact: true })
    .click();
  await nav(page, "Kitchen").click();
  const ticket = page
    .locator(".pv-ticket")
    .filter({
      has: page.getByRole("heading", { name: "Takeaway", exact: true }),
    });
  await expect(ticket).toBeVisible();
  await expect(ticket).toContainText("Cutlery");
});

test("occupied table, early payment acknowledgment and equal split with exact cents", async ({
  page,
}) => {
  await nav(page, "New order").click();
  await page
    .getByRole("button", { name: "Table 03, occupied", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open existing order", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Split bill / pay remaining", exact: true })
    .click();
  await page.getByRole("button", { name: "Equal", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Number of parts", exact: true })
    .selectOption("3");
  await page
    .getByRole("button", { name: "Create equal parts", exact: true })
    .click();
  await page.getByRole("button", { name: /Part 1 RM 9.86/ }).click();
  await expect(
    page.getByRole("button", { name: "Confirm payment", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel(
      "I acknowledge that kitchen items are still being prepared or waiting to be served.",
    )
    .check();
  for (const part of ["Part 1 RM 9.86", "Part 2 RM 9.86", "Part 3 RM 9.88"]) {
    await page.getByRole("button", { name: part, exact: true }).click();
    await page
      .getByRole("button", { name: "Confirm payment", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirm allocation", exact: true })
      .click();
  }
  await expect(page.getByTestId("outstanding")).toHaveText("RM 0.00");
  await nav(page, "Tables").click();
  await expect(
    page.getByRole("button", { name: "Table 03, occupied", exact: true }),
  ).toBeVisible();
});

test("all operational navigation, report generation and local export downloads", async ({
  page,
}, info) => {
  for (const name of [
    "Tables",
    "Orders",
    "Kitchen",
    "To serve",
    "Cash shift",
    "Reports",
  ]) {
    await nav(page, name).click();
    await expect(page.locator("main h1")).toBeVisible();
    await assertNoOverflow(page);
  }
  await page
    .getByRole("button", { name: "Generate preview", exact: true })
    .click();
  await expect(page.getByRole("table")).toContainText("RM 17.00");
  if (info.project.name === "desktop") {
    const pdf = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export PDF", exact: true }).click();
    expect((await pdf).suggestedFilename()).toMatch(/mock-.*\.pdf$/);
    const excel = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export Excel", exact: true })
      .click();
    expect((await excel).suggestedFilename()).toMatch(/mock-.*\.xlsx$/);
  }
});

test("refresh resets mock state and trailing slash loads the isolated preview", async ({
  page,
}) => {
  await startMenu(page);
  await addProduct(page);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Let’s make it a great service." }),
  ).toBeVisible();
  await nav(page, "Tables").click();
  await expect(
    page.getByRole("button", { name: "Table 01, available", exact: true }),
  ).toBeVisible();
  await page.goto("/pos/preview/");
  await expect(
    page.getByRole("heading", { name: "Let’s make it a great service." }),
  ).toBeVisible();
});
