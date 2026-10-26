import { test, expect } from "@playwright/test";

test("original sign-in and language flow still load separately from preview", async ({
  page,
  baseURL,
}) => {
  test.skip(
    !!process.env.POS_PREVIEW_BASE_URL,
    "Module-level environment mocking requires the default Vite development server.",
  );
  const requests = [];
  const errors = [];
  const origin = new URL(baseURL).origin;
  page.on("request", (request) => requests.push(request.url()));
  page.on("pageerror", (error) => errors.push(error.message));
  // Provide fictional configuration and the existing read-only health probe.
  // Every response is local; real backend traffic remains blocked.
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (
      url.origin === origin &&
      url.pathname === "/mock-supabase/auth/v1/health"
    )
      return route.fulfill({
        contentType: "application/json",
        body: '{"status":"ok"}',
      });
    if (url.origin !== origin || url.pathname.startsWith("/mock-supabase/"))
      return route.abort();
    return route.continue();
  });
  await page.route("**/src/config/env.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `export const env = ${JSON.stringify({
        appEnv: "development",
        supabaseUrl: `${origin}/mock-supabase`,
        supabaseKey: "mock-review-key",
        appVersion: "review",
        gitCommitSha: "",
        buildId: "",
        buildTimestamp: "",
      })};`,
    }),
  );
  await page.goto("/");
  await expect(page.locator("#current-email")).toHaveAttribute(
    "autocomplete",
    "username",
  );
  await expect(page.locator("#current-password")).toHaveAttribute(
    "autocomplete",
    "current-password",
  );
  await page.getByRole("button", { name: "zh", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  expect(
    requests.some((url) => new URL(url).pathname === "/src/app/App.jsx"),
  ).toBeTruthy();
  expect(
    requests.some((url) => new URL(url).pathname === "/src/index.css"),
  ).toBeTruthy();
  expect(
    requests.some((url) =>
      /\/src\/preview\/(PreviewApp\.jsx|styles\/preview\.css)/.test(url),
    ),
  ).toBeFalsy();
  const originalBackendRequests = requests.filter((url) =>
    new URL(url).pathname.startsWith("/mock-supabase/"),
  );
  expect(originalBackendRequests.length).toBeGreaterThan(0);
  expect(
    originalBackendRequests.every(
      (url) => new URL(url).pathname === "/mock-supabase/auth/v1/health",
    ),
  ).toBeTruthy();
  requests.length = 0;
  await page.goto("/pos/preview");
  await expect(
    page.getByRole("heading", { name: "Let’s make it a great service." }),
  ).toBeVisible();
  expect(
    requests.some((url) =>
      /\/src\/(app\/App\.jsx|index\.css|infrastructure\/supabase\/)/.test(url),
    ),
  ).toBeFalsy();
  expect(
    requests.filter((url) =>
      new URL(url).pathname.startsWith("/mock-supabase/"),
    ),
  ).toEqual([]);
  expect(errors).toEqual([]);
});
