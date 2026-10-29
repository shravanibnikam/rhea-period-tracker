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
import { META_NEEDS_INITIAL_SEED, META_LAST_KNOWN_ROLE } from "@/data/schema";
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

  it("unresolved role + a marked store: saveLogs stores the batch but queues nothing", async () => {
    const { c, driver } = await deviceWithCachedRows("unresolved-marked-batch");
    await driver.put("meta", "partner", "lastKnownRole");
    c.setOwnerSyncMode("unresolved");

    await c.saveLogs([
      { ...emptyLog("2026-08-06"), flow: "light" },
      { ...emptyLog("2026-08-07"), flow: "medium" },
    ]);

    expect(await c.getLog("2026-08-06")).toBeDefined();
    expect(await c.getLog("2026-08-07")).toBeDefined();
    expect(await driver.getAll<OutboxEntry>("outbox")).toHaveLength(0);
  });

  it("unresolved role + a marked store: deleteLog removes the row locally but queues no tombstone intent", async () => {
    const { c, driver } = await deviceWithCachedRows("unresolved-marked-delete");
    await driver.put("meta", "partner", "lastKnownRole");
    c.setOwnerSyncMode("unresolved");

    await c.deleteLog(DATES[0]); // one of the cached (owner's) rows

    expect(await c.getLog(DATES[0])).toBeUndefined();
    expect(await driver.getAll<OutboxEntry>("outbox")).toHaveLength(0);
  });

  it("a partner answer landing WHILE the marker is being read wins: the save is stored, not queued", async () => {
    // The race: logs() reads meta.lastKnownRole in its own step. If the role
    // resolves to partner meanwhile, the app sets "off" and clears the outbox;
    // the save must then re-read the mode — not act on the stale "unresolved"
    // it saw before the read, which would queue it after the clear (and a later
    // unlink would upload it).
    const { c, driver } = await deviceWithCachedRows("marker-read-race");
    c.setOwnerSyncMode("unresolved");
    let markerReadStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markerReadStarted = resolve;
    });
    let releaseMarkerRead!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseMarkerRead = resolve;
    });
    const realGet = driver.get.bind(driver);
    let delayed = false;
    vi.spyOn(driver, "get").mockImplementation(async (store, key) => {
      if (!delayed && store === "meta" && key === META_LAST_KNOWN_ROLE) {
        delayed = true;
        markerReadStarted();
        await gate;
      }
      return realGet(store, key);
    });

    const saving = c.saveLog({ ...emptyLog("2026-08-05"), flow: "light" });
    await started; // the marker read is in flight
    c.setOwnerSyncMode("off"); // the partner answer lands (App: "off" + clearOutbox)
    await c.clearOutbox();
    releaseMarkerRead();
    await saving;

    expect(await c.getLog("2026-08-05")).toBeDefined();
    expect(await driver.getAll<OutboxEntry>("outbox")).toHaveLength(0);
  });

  it("not even a CONFIRMED owner queues in a marked store: its rows are the old owner's until claimForOwner purges them", async () => {
    const { c, driver } = await deviceWithCachedRows("owner-marked");
    await driver.put("meta", "partner", "lastKnownRole");
    c.setOwnerSyncMode("owner");

    await saveOne(c);
    await c.setSymptom(DATES[0], "Cramps", true); // the Overview toggle on a cached row

    expect(await c.getLog("2026-08-05")).toBeDefined();
    expect(await driver.getAll<OutboxEntry>("outbox")).toHaveLength(0);
  });
});

describe("Container.claimForOwner — an ex-partner confirmed as owner (P0-06)", () => {
  it("purges the previous owner's cached rows and everything queued for or derived from them, then marks the store owner", async () => {
    const { c, driver } = await deviceWithCachedRows("claim-marked");
    await driver.put("meta", "partner", META_LAST_KNOWN_ROLE);
    await driver.put("outbox", { id: 1, nextAttemptAt: 0 }); // a stray intent
    await driver.put("tombstones", { key: "log:2026-07-01", deletedAt: "x" });
    await driver.put("sync_cursors", { scope: "owner", hlc: "x" });
    await driver.put("meta", 30, "cycleLengthOverride");

    await c.claimForOwner();

    expect(await driver.getAll("logs")).toEqual([]);
    expect(await driver.getAll("outbox")).toEqual([]);
    expect(await driver.getAll("tombstones")).toEqual([]);
    expect(await driver.getAll("sync_cursors")).toEqual([]); // the engine re-pulls this account's own rows
    expect(await driver.get("meta", META_LAST_KNOWN_ROLE)).toBe("owner");
    expect(await driver.get("meta", "cycleLengthOverride")).toBe(30); // settings stay

    // The store is now the owner's own: an owner write queues again.
    c.setOwnerSyncMode("owner");
    await c.saveLog({ ...emptyLog("2026-08-05"), flow: "light" });
    expect(await driver.getAll<OutboxEntry>("outbox")).toHaveLength(1);
  });

  it("leaves an unmarked (owner's own) store untouched", async () => {
    const { c, driver } = await deviceWithCachedRows("claim-unmarked");

    await c.claimForOwner();

    expect(await driver.getAll("logs")).toHaveLength(DATES.length);
    expect(await driver.get("meta", META_LAST_KNOWN_ROLE)).toBeUndefined();
  });

  it("an interrupted purge keeps the marker, so it reruns next time", async () => {
    const { c, driver } = await deviceWithCachedRows("claim-interrupted");
    await driver.put("meta", "partner", META_LAST_KNOWN_ROLE);
    const realClear = driver.clear.bind(driver);
    vi.spyOn(driver, "clear").mockImplementation((store) =>
      store === "outbox" ? Promise.reject(new Error("aborted")) : realClear(store)
    );

    await expect(c.claimForOwner()).rejects.toThrow("aborted");
    expect(await driver.get("meta", META_LAST_KNOWN_ROLE)).toBe("partner");
  });
});
