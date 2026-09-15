import { test, expect } from "@playwright/test";

test("fresh deep link loads the 404 shell with project-scoped assets", async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  page.on("pageerror", error => console.error("Pages runtime error:", error.message));
  const failures: string[] = [];
  page.on("response", response => {
    if (response.request().resourceType() !== "document" && response.status() >= 400) failures.push(response.url());
  });
  try {
    const response = await page.goto("http://127.0.0.1:4175/rhea-period-tracker/calendar");
    expect(response?.status()).toBe(404); // GitHub Pages serves the shell with 404 status.
    await expect(page.getByRole("heading", { name: "Get started", exact: true })).toBeVisible();
    const logo = page.getByAltText("Rhea", { exact: true });
    await expect.poll(() => logo.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    expect(failures).toEqual([]);
    const manifestResponse = await page.request.get("http://127.0.0.1:4175/rhea-period-tracker/manifest.json");
    const manifest = await manifestResponse.json();
    expect(manifest.start_url).toBe("./");
    expect(manifest.scope).toBe("./");
    for (const icon of manifest.icons) {
      const response = await page.request.get(new URL(icon.src, manifestResponse.url()).href);
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toBe("image/svg+xml");
    }
  } finally {
    await context.close();
  }
});

test("installed project shell opens on a new tab offline and retains logs", async ({ page, context }) => {
  page.on("pageerror", error => console.error("Pages runtime error:", error.message));
  await page.goto("./");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.getByRole("button", { name: /Log today/ }).click();
  await page.getByRole("button", { name: "Medium", exact: true }).first().click();
  await page.getByRole("button", { name: "Save Log", exact: true }).click();
  await expect(page.getByRole("tab", { name: "calendar", exact: true })).toBeVisible();
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(scope).toBe("http://127.0.0.1:4175/rhea-period-tracker/");
  await context.setOffline(true);
  const offline = await context.newPage();
  await offline.goto("http://127.0.0.1:4175/rhea-period-tracker/");
  await expect(offline.getByRole("tab", { name: "calendar", exact: true })).toBeVisible();
  await offline.getByRole("button", { name: "Log today", exact: true }).click();
  await expect(offline.getByRole("button", { name: /Delete this log/ })).toBeVisible();
});
