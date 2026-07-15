import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { openDB, deleteDB } from "idb";
import { IndexedDbDriver } from "@/data/drivers/IndexedDbDriver";
import { LogRepository } from "@/data/repositories";
import {
  STORES_V2,
  META_DEVICE_ID,
  META_HLC_STATE,
  META_NEEDS_INITIAL_SEED,
  META_DB_SCHEMA_VERSION,
} from "@/data/schema";
import type { StoredLog } from "@/data/repositories/LogRepository";
import { epochZeroHlc, compareHlc } from "@/domain/hlc";
import { emptyLog } from "@/domain/types";

// M1.5 / RHEA-037 — v1→v2 migration integration suite over fake-indexeddb.

const NAME = "migration-test";

async function nuke(): Promise<void> {
  const dbs = (await indexedDB.databases?.()) ?? [];
  for (const d of dbs) if (d.name) await deleteDB(d.name);
}

async function seedV1(name: string, dates: string[]): Promise<void> {
  const db = await openDB(name, 1, {
    upgrade(d) {
      d.createObjectStore("logs", { keyPath: "date" });
      d.createObjectStore("meta");
    },
  });
  for (const date of dates) await db.put("logs", { ...emptyLog(date), flow: "medium" });
  await db.put("meta", 30, "cycleLengthOverride");
  db.close();
}

function makeDriver(name = NAME): IndexedDbDriver {
  return new IndexedDbDriver({ dbName: name, accountId: null, role: "local" });
}

beforeEach(nuke);

describe("IndexedDB v1 → v2 migration", () => {
  it("preserves every v1 log and backfills epoch-0 stamps + v2 defaults", async () => {
    await seedV1(NAME, ["2026-01-01", "2026-01-02", "2026-01-03"]);

    const driver = makeDriver();
    await driver.ready();

    const logs = await driver.getAll<StoredLog>("logs");
    expect(logs.map((l) => l.date)).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);

    const deviceId = await driver.get<string>("meta", META_DEVICE_ID);
    expect(deviceId).toBeTruthy();
    for (const log of logs) {
      expect(log.flow).toBe("medium"); // original content untouched
      expect(log.updatedAt).toBe(epochZeroHlc(deviceId!)); // never wins a merge
      expect(log.deviceId).toBe(deviceId);
      expect(log.deleted).toBe(false);
      expect(log.medication).toEqual([]);
      expect(log.intimacy).toBeNull();
    }
    // v1 meta content also survives.
    expect(await driver.get("meta", "cycleLengthOverride")).toBe(30);
    await driver.close();
  });

  it("creates all eight canonical stores with working indexes", async () => {
    await seedV1(NAME, ["2026-01-01"]);
    const driver = makeDriver();
    await driver.ready();

    for (const def of STORES_V2) {
      expect(await driver.count(def.name)).toBeGreaterThanOrEqual(0); // store exists
    }
    // by_updatedAt on logs is queryable (the reconcile cursor).
    const page = await driver.getByIndexSince<StoredLog>("logs", "by_updatedAt", "", 10);
    expect(page.items).toHaveLength(1);
    await driver.close();
  });

  it("seeds sync meta: deviceId, hlcState, needsInitialSeed, dbSchemaVersion", async () => {
    await seedV1(NAME, ["2026-01-01"]);
    const driver = makeDriver();
    await driver.ready();

    expect(await driver.get("meta", META_DEVICE_ID)).toBeTruthy();
    expect(await driver.get("meta", META_HLC_STATE)).toEqual({ pt: 0, c: 0 });
    expect(await driver.get("meta", META_NEEDS_INITIAL_SEED)).toBe(true);
    expect(await driver.get("meta", META_DB_SCHEMA_VERSION)).toBe(2);
    await driver.close();
  });

  it("re-opening an already-migrated DB is a no-op (idempotent)", async () => {
    await seedV1(NAME, ["2026-01-01"]);
    const d1 = makeDriver();
    await d1.ready();
    const before = await d1.get<StoredLog>("logs", "2026-01-01");
    const deviceBefore = await d1.get<string>("meta", META_DEVICE_ID);
    await d1.close();

    const d2 = makeDriver();
    await d2.ready();
    expect(await d2.count("logs")).toBe(1);
    expect(await d2.get<StoredLog>("logs", "2026-01-01")).toEqual(before);
    expect(await d2.get<string>("meta", META_DEVICE_ID)).toBe(deviceBefore);
    await d2.close();
  });

  it("an interrupted upgrade leaves v1 fully readable (atomic versionchange)", async () => {
    await seedV1(NAME, ["2026-01-01", "2026-01-02"]);

    // Simulate a mid-upgrade failure: abort the versionchange transaction.
    const failing = new IndexedDbDriver(
      { dbName: NAME, accountId: null, role: "local" },
      {
        version: 2,
        upgrade: (_db, _o, _n, tx) => {
          tx.done.catch(() => {}); // observed: abort() rejects it by design
          tx.abort();
        },
      }
    );
    await expect(failing.ready()).rejects.toThrow();

    // The DB is still v1 with every row intact.
    const v1 = await openDB(NAME, 1);
    expect(v1.version).toBe(1);
    expect((await v1.getAll("logs")).length).toBe(2);
    expect([...v1.objectStoreNames].sort()).toEqual(["logs", "meta"]);
    v1.close();
  });

  it("a fresh (no-v1) database gets the v2 layout without an initial-seed flag", async () => {
    const driver = makeDriver("fresh-v2");
    await driver.ready();
    expect(await driver.get("meta", META_DEVICE_ID)).toBeTruthy();
    expect(await driver.get("meta", META_NEEDS_INITIAL_SEED)).toBeUndefined();
    expect(await driver.get("meta", META_DB_SCHEMA_VERSION)).toBe(2);
    await driver.close();
  });
});

describe("repositories stamp HLC/deviceId/deleted (RHEA-038)", () => {
  it("saves stamp monotonically and deletes write tombstones", async () => {
    const driver = makeDriver("stamping");
    await driver.ready();
    const repo = new LogRepository(driver);

    await repo.save(emptyLog("2026-05-01"));
    await repo.save(emptyLog("2026-05-02"));

    const rows = await repo.getAllStored();
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.updatedAt).toMatch(/^[0-9a-f]{12}:[0-9a-f]{4}:/);
      expect(r.deviceId).toBeTruthy();
      expect(r.deleted).toBe(false);
    }
    const [a, b] = rows;
    expect(compareHlc(b.updatedAt, a.updatedAt)).toBeGreaterThan(0);

    await repo.delete("2026-05-01");
    expect(await repo.get("2026-05-01")).toBeUndefined();
    const tombs = await driver.getAll<{ key: string; deletedAt: string; acked: boolean }>(
      "tombstones"
    );
    expect(tombs).toHaveLength(1);
    expect(tombs[0].key).toBe("log:2026-05-01");
    expect(tombs[0].acked).toBe(false);
    expect(compareHlc(tombs[0].deletedAt, b.updatedAt)).toBeGreaterThan(0);
    await driver.close();
  });

  it("an edit after upgrade strictly dominates the epoch-0 backfill", async () => {
    await seedV1(NAME, ["2026-01-01"]);
    const driver = makeDriver();
    await driver.ready();
    const repo = new LogRepository(driver);

    const before = (await repo.getAllStored())[0];
    await repo.save({ ...emptyLog("2026-01-01"), flow: "heavy" });
    const after = (await repo.getAllStored())[0];

    expect(compareHlc(after.updatedAt, before.updatedAt)).toBeGreaterThan(0);
    await driver.close();
  });
});
