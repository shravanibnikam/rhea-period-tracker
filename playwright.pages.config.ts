import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/pages",
  testMatch: "**/*.e2e.ts",
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  use: {
    browserName: "chromium",
    baseURL: "http://127.0.0.1:4175/rhea-period-tracker/",
    timezoneId: "UTC",
    trace: "off",
  },
  webServer: {
    command: "npm run build:pages && node tests/helpers/pages-server.mjs",
    url: "http://127.0.0.1:4175/rhea-period-tracker/",
    reuseExistingServer: false,
    env: { VITE_SUPABASE_URL: "", VITE_SUPABASE_PUBLISHABLE_KEY: "" },
    timeout: 120_000,
  },
});
