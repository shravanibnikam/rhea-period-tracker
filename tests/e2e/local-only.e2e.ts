import { test, expect } from "@playwright/test";

test("local-only logging survives reload and works offline without an account", async ({ page, context }) => {
  await page.goto("http://127.0.0.1:4174/rhea-period-tracker/");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /Log today/ }).click();
  await page.getByRole("button", { name: "Medium", exact: true }).first().click();
  await page.getByRole("button", { name: "Save Log", exact: true }).click();
  await expect(page.getByRole("tab", { name: "calendar", exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Log today", exact: true }).click();
  await expect(page.getByRole("button", { name: /Delete this log/ })).toBeVisible();
  await context.setOffline(true);
  await page.getByRole("button", { name: /Delete this log/ }).click();
  await page.getByRole("button", { name: /Confirm delete log/ }).click();
  await expect(page.getByRole("heading", { name: "Get started", exact: true })).toBeVisible();
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Get started", exact: true })).toBeVisible();
});
