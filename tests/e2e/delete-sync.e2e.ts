import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test("UI delete persists a tombstone and removes the log from another device", async ({ page, browser }) => {
  const client = createClient(process.env.RHEA_TEST_SUPABASE_URL!,
    process.env.RHEA_TEST_SUPABASE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  const email = `delete-${randomUUID()}@example.test`;
  const password = `Rhea-test-${randomUUID()}`;
  // Public signup only; no privileged key. Local Auth defaults to auto-confirm.
  const signup = await client.auth.signUp({ email, password });
  expect(signup.error).toBeNull();
  expect(signup.data.session).toBeTruthy();
  const uid = signup.data.user!.id;
  const date = new Date().toISOString().slice(0, 10);
  const signIn = async (target: Page) => {
    await target.goto("http://127.0.0.1:4173/rhea-period-tracker/");
    await target.getByPlaceholder("you@example.com").fill(email);
    await target.getByPlaceholder("Your password").fill(password);
    await target.getByRole("button", { name: "Sign in", exact: true }).click();
  };
  const remoteRow = async () => {
    const { data, error } = await client.from("daily_logs")
      .select("deleted, updated_hlc, flow").eq("owner_id", uid).eq("date", date).maybeSingle();
    expect(error).toBeNull();
    return data;
  };
  const replica = await browser.newContext({ timezoneId: "UTC", serviceWorkers: "block" });
  try {
    await signIn(page);
    await page.getByRole("button", { name: /I'm tracking my cycle/ }).click();
    await page.getByRole("button", { name: /Log today/ }).click();
    // Flow precedes the separate energy control with the same label.
    await page.getByRole("button", { name: "Medium", exact: true }).first().click();
    await page.getByRole("button", { name: "Save Log", exact: true }).click();
    await expect.poll(async () => (await remoteRow())?.deleted).toBe(false);
    const saved = (await remoteRow())!;
    expect(saved.flow).toBe("medium");

    const secondPage = await replica.newPage();
    await signIn(secondPage);
    await expect(secondPage.getByRole("button", { name: "Log today", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Log today", exact: true }).click();
    await page.getByRole("button", { name: /Delete this log/ }).click();
    await page.getByRole("button", { name: /Confirm delete log/ }).click();
    await expect.poll(async () => (await remoteRow())?.deleted).toBe(true);
    expect((await remoteRow())!.updated_hlc > saved.updated_hlc).toBe(true);

    // Full reload forces another real server pull. No stale record resurrects.
    for (const target of [page, secondPage]) {
      await target.reload();
      await expect(target.getByRole("button", { name: /I'm tracking my cycle/ })).toBeVisible();
      await target.getByRole("button", { name: /I'm tracking my cycle/ }).click();
      await target.getByRole("button", { name: /Log today/ }).click();
      await expect(target.getByRole("button", { name: /Delete this log/ })).toHaveCount(0);
    }
  } finally {
    await replica.close();
    await client.auth.signOut();
    // Synthetic account/rows remain only in the disposable stack until reset.
  }
});
