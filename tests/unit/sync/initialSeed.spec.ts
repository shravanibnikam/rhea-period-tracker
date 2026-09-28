/**
 * seedInitialOutbox never uploads a partner's cache (P0-06 / S-07).
 *
 * The one-time post-upgrade seed enqueues EVERY local `logs` row under the
 * signed-in account. On a device that has served a partner session those rows
 * are the OWNER's (the legacy pull cached them, stamped with this device's id,
 * so they are indistinguishable from the account's own). If that account later
 * resolves as an owner — e.g. an ex-partner after the link is removed — the
 * seed would publish the previous owner's health data under the ex-partner's
 * id, where she can never delete it. `meta.lastKnownRole = "partner"` marks
 * such a store; the seed must refuse it and retire the flag.
 */
import { describe, it, expect } from "vitest";
import { MemoryDriver } from "@/data/drivers/MemoryDriver";
import { Outbox, seedInitialOutbox, type OutboxEntry } from "@/sync";
import { META_NEEDS_INITIAL_SEED } from "@/data/schema";
import { emptyLog } from "@/domain/types";
import { encodeHlc } from "@/domain/hlc";

const DATES = ["2026-08-01", "2026-08-02", "2026-08-03"];

/** A store as the v1→v2 migration leaves it: epoch-0 rows + needsInitialSeed. */
async function upgradedStore(): Promise<MemoryDriver> {
  const driver = new MemoryDriver();
  for (const date of DATES) {
    await driver.put("logs", {
      ...emptyLog(date),
      flow: "medium",
      updatedAt: encodeHlc(0, 0, "this-device"),
      deviceId: "this-device",
      deleted: false,
    });
  }
  await driver.put("meta", true, META_NEEDS_INITIAL_SEED);
  return driver;
}

describe("seedInitialOutbox", () => {
  it("refuses to seed a store that has served a partner session, and retires the flag", async () => {
    const driver = await upgradedStore();
    // The literal key is the on-disk contract S-07 reads.
    await driver.put("meta", "partner", "lastKnownRole");

    const seeded = await seedInitialOutbox(driver, new Outbox(driver));

    expect(await driver.getAll<OutboxEntry>("outbox")).toHaveLength(0);
    expect(seeded).toBe(0);
    expect(await driver.get("meta", META_NEEDS_INITIAL_SEED)).toBe(false);
    expect(await driver.getAll("logs")).toHaveLength(DATES.length); // local data untouched
  });

  it("still seeds an ordinary upgraded owner store exactly once (control)", async () => {
    const driver = await upgradedStore();
    const outbox = new Outbox(driver);

    expect(await seedInitialOutbox(driver, outbox)).toBe(DATES.length);
    expect(await driver.getAll<OutboxEntry>("outbox")).toHaveLength(DATES.length);
    expect(await driver.get("meta", META_NEEDS_INITIAL_SEED)).toBe(false);

    expect(await seedInitialOutbox(driver, outbox)).toBe(0); // one-time
    expect(await driver.getAll<OutboxEntry>("outbox")).toHaveLength(DATES.length);
  });
});
