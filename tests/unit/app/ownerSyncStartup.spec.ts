/**
 * A cancelled owner-sync startup has no side effects (P0-06).
 *
 * `startOwnerSync` awaits storage before it seeds. If the app stops sync in
 * that window (role resolved to partner, sign-out, account switch) the startup
 * is obsolete — but it used to run `seedInitialOutbox` anyway and only THEN
 * check its generation: every local row (on a partner device, the owner's) was
 * already queued for upload under this account. It also asserted owner mode at
 * its top, so the stale startup left later writes enqueuing too.
 */
import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, vi } from "vitest";
import { Container } from "@/app/di/Container";
import { SyncEngine, type OutboxEntry } from "@/sync";
import type { StorageDriver } from "@/data/drivers/StorageDriver";
import { META_NEEDS_INITIAL_SEED } from "@/data/schema";
import { emptyLog } from "@/domain/types";
import { encodeHlc } from "@/domain/hlc";

const DATES = ["2026-08-01", "2026-08-02"];

let open: Container[] = [];
afterEach(async () => {
  for (const c of open) {
    await c.stopOwnerSync();
    await c.closeDB();
  }
  vi.restoreAllMocks();
  open = [];
});

/** An account store holding cached rows with the one-time seed still pending. */
async function deviceWithCachedRows(uid: string) {
  const c = new Container();
  c.setAccount(uid);
  open.push(c);
  const driver = await c.driver();
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
  return { c, driver };
}

describe("Container.startOwnerSync — a cancelled startup", () => {
  it("stopped before the seed: enqueues nothing, pushes nothing, keeps the seed pending, and leaves owner mode off", async () => {
    const { c, driver } = await deviceWithCachedRows("cancelled-seed");
    let release!: (d: StorageDriver) => void;
    const delayed = new Promise<StorageDriver>((resolve) => {
      release = resolve;
    });
    vi.spyOn(c, "driver").mockImplementationOnce(() => delayed);
    const start = vi.spyOn(SyncEngine.prototype, "start");
    const flush = vi.spyOn(SyncEngine.prototype, "flush");

    const obsolete = c.startOwnerSync("cancelled-seed", null);
    await c.stopOwnerSync(); // e.g. the role resolved to partner meanwhile
    release(driver);
    await obsolete;

    expect(await driver.getAll<OutboxEntry>("outbox")).toHaveLength(0);
    expect(start).not.toHaveBeenCalled();
    expect(flush).not.toHaveBeenCalled();
    expect(c.syncEngine()).toBeNull();
    expect(await driver.get("meta", META_NEEDS_INITIAL_SEED)).toBe(true);

    // The stale startup must not have left owner (durable-outbox) mode on: a
    // later write — e.g. a partner pull caching an owner row — stays local.
    await c.saveLog({ ...emptyLog("2026-08-05"), flow: "light" });
    expect(await driver.getAll<OutboxEntry>("outbox")).toHaveLength(0);
  });

  it("a live startup still seeds and starts (control)", async () => {
    const { c, driver } = await deviceWithCachedRows("live-seed");
    const start = vi.spyOn(SyncEngine.prototype, "start");

    const engine = await c.startOwnerSync("live-seed", null);

    expect(c.syncEngine()).toBe(engine);
    expect(start).toHaveBeenCalledTimes(1);
    expect(await driver.get("meta", META_NEEDS_INITIAL_SEED)).toBe(false);
  });
});

describe("Container.clearOutbox (partner resolution)", () => {
  it("drops every queued intent of the active account's store and leaves its logs alone", async () => {
    const { c, driver } = await deviceWithCachedRows("clear-outbox");
    c.setOwnerSyncMode("owner");
    await c.saveLog({ ...emptyLog("2026-08-05"), flow: "light" });
    expect(await driver.getAll<OutboxEntry>("outbox")).toHaveLength(1);

    await c.clearOutbox();

    expect(await driver.getAll<OutboxEntry>("outbox")).toHaveLength(0);
    expect(await driver.getAll("logs")).toHaveLength(DATES.length + 1);
  });
});

describe("Container queue mode 'unresolved' respects the partner marker (P0-06)", () => {
  async function saveOne(c: Container) {
    await c.saveLog({ ...emptyLog("2026-08-05"), flow: "light" });
  }

  it("unresolved role + a store marked lastKnownRole=partner: a write is stored but NOT queued", async () => {
    const { c, driver } = await deviceWithCachedRows("unresolved-marked");
    await driver.put("meta", "partner", "lastKnownRole");
    c.setOwnerSyncMode("unresolved");

    await saveOne(c);

    expect(await c.getLog("2026-08-05")).toBeDefined();
    expect(await driver.getAll<OutboxEntry>("outbox")).toHaveLength(0);
  });

  it("unresolved role + an unmarked store: a write IS queued (offline logging syncs later)", async () => {
    const { c, driver } = await deviceWithCachedRows("unresolved-unmarked");
    c.setOwnerSyncMode("unresolved");

    await saveOne(c);

    expect(await driver.getAll<OutboxEntry>("outbox")).toHaveLength(1);
  });

  it("a CONFIRMED owner queues even in a marked store (the resolved ex-partner edit is the S-07 residual)", async () => {
    const { c, driver } = await deviceWithCachedRows("owner-marked");
    await driver.put("meta", "partner", "lastKnownRole");
    c.setOwnerSyncMode("owner");

    await saveOne(c);

    expect(await driver.getAll<OutboxEntry>("outbox")).toHaveLength(1);
  });
});
