import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "preview.spec.js",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: "../../test-results/pos-preview",
  use: {
    baseURL: process.env.POS_PREVIEW_BASE_URL || "http://127.0.0.1:5180",
    browserName: "chromium",
    channel: process.platform === "win32" ? "chrome" : undefined,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    {
      name: "tablet-landscape",
      use: { viewport: { width: 1194, height: 834 }, hasTouch: true },
    },
    {
      name: "tablet-portrait",
      use: { viewport: { width: 834, height: 1194 }, hasTouch: true },
    },
    {
      name: "mobile",
      use: { viewport: { width: 390, height: 844 }, hasTouch: true },
    },
  ],
});
