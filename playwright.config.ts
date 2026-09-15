import { execFileSync } from "node:child_process";
import { defineConfig } from "@playwright/test";

// Only the disposable local stack is allowed. Never use a developer's .env or
// production credentials. The CLI status object is never logged or persisted.
const status = JSON.parse(execFileSync(process.env.SUPABASE_BIN ?? "supabase",
  ["status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
if (status.API_URL !== "http://127.0.0.1:54321" || !status.ANON_KEY) {
  throw new Error("Start the local Supabase stack on port 54321 before running E2E tests.");
}
process.env.RHEA_TEST_SUPABASE_URL = status.API_URL;
process.env.RHEA_TEST_SUPABASE_KEY = status.ANON_KEY;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.e2e.ts",
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  use: {
    browserName: "chromium",
    baseURL: "http://127.0.0.1:4173",
    timezoneId: "UTC",
    serviceWorkers: "block",
    // Traces can retain authentication tokens; don't record them.
    trace: "off",
  },
  webServer: [{
    command: "npm run dev -- --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: status.API_URL,
      VITE_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY,
    },
  }, {
    command: "npm run dev -- --host 127.0.0.1 --port 4174 --strictPort",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: false,
    env: { VITE_SUPABASE_URL: "", VITE_SUPABASE_PUBLISHABLE_KEY: "" },
  }],
});
