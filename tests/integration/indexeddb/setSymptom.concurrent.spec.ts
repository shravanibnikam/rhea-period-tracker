import "fake-indexeddb/auto";
import { describe, it, expect, afterEach } from "vitest";
import { IndexedDbDriver } from "@/data/drivers/IndexedDbDriver";
import { LogRepository, type StoredLog } from "@/data/repositories/LogRepository";
import type { StorageDriver } from "@/data/drivers/StorageDriver";
import { logKey, openPlain } from "@/data/envelope";
import { Outbox, type OutboxEntry } from "@/sync";
import { Container } from "@/app/di/Container";
import type { DailyLog } from "@/domain/types";

// P0-N2 review, mutant M1a: setSymptom must read the stored row INSIDE its
// readwrite transaction. Two quick Overview taps on different symptoms are two
// overlapping setSymptom calls. IndexedDB runs their transactions one after the
// other, so the second reads what the first wrote. A read taken before the
// transaction lets both calls start from the same row, and the second write
// drops the first tap. MemoryDriver cannot show this (it does not isolate
// concurrent transactions), so these tests use the real IndexedDbDriver on
// fake-indexeddb, directly and through the Container.

const DAY = "2026-03-10";
const STORED: DailyLog = {
  date: DAY,
  flow: "medium",
  symptoms: ["Headache"],
  mood: "Calm",
  energy: "low",
  notes: "REMOTE-KEEP",
  medication: [{ name: "ibuprofen" }],
  intimacy: { occurred: true },
};

let seq = 0;
const drivers: IndexedDbDriver[] = [];
const containers: Container[] = [];
afterEach(async () => {
  for (const d of drivers.splice(0)) await d.destroy().catch(() => {});
  for (const c of containers.splice(0)) await c.closeDB();
});

function idbDriver(): IndexedDbDriver {
  const d = new IndexedDbDriver({
    dbName: `setsymptom-concurrent-${Date.now()}-${seq++}`,
    accountId: null,
    role: "local",
  });
  drivers.push(d);
  return d;
}

/** The stored row's domain fields (sync metadata stripped). */
async function storedDomain(driver: StorageDriver): Promise<DailyLog | undefined> {
  const row = await driver.get<StoredLog>("logs", DAY);
  if (!row) return undefined;
  const { updatedAt: _u, deviceId: _d, deleted: _x, ...domain } = row;
  return domain;
}

/**
 * The day's single queued sync intent must carry exactly what is stored, under
 * the stored row's stamp, so a push uploads the final row and nothing older.
 */
async function expectQueuedIsStored(driver: StorageDriver): Promise<void> {
  const queued = await driver.getAll<OutboxEntry>("outbox");
  expect(queued).toHaveLength(1);
  const record = queued[0].record;
  const row = await driver.get<StoredLog>("logs", DAY);
  expect(record.key).toBe(logKey(DAY));
  expect(record.updatedAt).toBe(row?.updatedAt);
  expect(record.payload && openPlain<DailyLog>(record.payload)).toEqual(await storedDomain(driver));
}

const sorted = (xs: string[] | undefined) => [...(xs ?? [])].sort();

describe("setSymptom on IndexedDB: overlapping taps (P0-N2, review mutant M1a)", () => {
  it("two taps on different symptoms, started together, both land, and every other field is kept", async () => {
    const driver = idbDriver();
    const logs = new LogRepository(driver, { outbox: new Outbox(driver) });
    await logs.save(STORED);

    // Both calls start before either is awaited, as two quick taps do.
    const taps = [logs.setSymptom(DAY, "Cramps", true), logs.setSymptom(DAY, "Fatigue", true)];
    await Promise.all(taps);

    const stored = await storedDomain(driver);
    expect(sorted(stored?.symptoms)).toEqual(["Cramps", "Fatigue", "Headache"]);
    expect(stored).toEqual({ ...STORED, symptoms: stored?.symptoms });
    await expectQueuedIsStored(driver);
  });

  it("an add and a remove started together both land", async () => {
    const driver = idbDriver();
    const logs = new LogRepository(driver, { outbox: new Outbox(driver) });
    await logs.save(STORED);

    await Promise.all([logs.setSymptom(DAY, "Headache", false), logs.setSymptom(DAY, "Cramps", true)]);

    expect(await storedDomain(driver)).toEqual({ ...STORED, symptoms: ["Cramps"] });
    await expectQueuedIsStored(driver);
  });

  it("through the Container (owner mode, outbox attached): both taps land and the queued record is the stored row", async () => {
    const c = new Container();
    c.setAccount(`setsymptom-container-${Date.now()}-${seq++}`);
    containers.push(c);
    c.setOwnerSyncMode("owner");
    await c.saveLog(STORED);

    await Promise.all([c.setSymptom(DAY, "Cramps", true), c.setSymptom(DAY, "Fatigue", true)]);

    const driver = await c.driver();
    const stored = await storedDomain(driver);
    expect(sorted(stored?.symptoms)).toEqual(["Cramps", "Fatigue", "Headache"]);
    expect(stored).toEqual({ ...STORED, symptoms: stored?.symptoms });
    expect(await c.getLog(DAY)).toMatchObject({ ...STORED, symptoms: stored?.symptoms });
    await expectQueuedIsStored(driver);
  });
});
