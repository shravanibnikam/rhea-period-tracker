import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { openDB, deleteDB } from "idb";
import { Container } from "@/app/di/Container";
import { emptyLog } from "@/domain/types";

// M0.4 semantics, now owned by the composition root (M1.10): account-scoped
// local DB + legacy copy-forward + wipe. Same behavioral assertions as the
// original lib/db suite — proving the Container preserved them.

async function nukeAllDatabases(): Promise<void> {
  const dbs = (await indexedDB.databases?.()) ?? [];
  for (const d of dbs) if (d.name) await deleteDB(d.name);
}

async function seedLegacy(dates: string[]): Promise<void> {
  const legacy = await openDB("rhea", 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("logs")) db.createObjectStore("logs", { keyPath: "date" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
    },
  });
  for (const d of dates) await legacy.put("logs", emptyLog(d));
  legacy.close();
}

let container: Container;

const dates = (logs: Array<{ date: string }>) => logs.map((l) => l.date).sort();

beforeEach(async () => {
  await container?.closeDB(); // an open handle blocks deleteDB
  await nukeAllDatabases();
  container = new Container();
});

describe("account-scoped local database (Container)", () => {
  it("isolates data between accounts", async () => {
    container.setAccount("u1");
    await container.saveLog(emptyLog("2026-01-01"));
    expect(dates(await container.getAllLogs())).toEqual(["2026-01-01"]);

    container.setAccount("u2");
    expect(await container.getAllLogs()).toEqual([]);
    await container.saveLog(emptyLog("2026-02-02"));
    expect(dates(await container.getAllLogs())).toEqual(["2026-02-02"]);

    container.setAccount("u1");
    expect(dates(await container.getAllLogs())).toEqual(["2026-01-01"]);
  });

  it("copies legacy `rhea` data forward into the first account only", async () => {
    await seedLegacy(["2025-12-25"]);

    container.setAccount("newuser");
    expect(dates(await container.getAllLogs())).toEqual(["2025-12-25"]);

    // A second account must NOT receive the legacy data (consumed exactly once).
    container.setAccount("other");
    expect(await container.getAllLogs()).toEqual([]);
  });

  it("copy-forward is idempotent (no duplication on re-open)", async () => {
    await seedLegacy(["2025-12-25"]);

    container.setAccount("u");
    expect((await container.getAllLogs()).length).toBe(1);

    container.setAccount("elsewhere");
    container.setAccount("u");
    expect((await container.getAllLogs()).length).toBe(1);
  });

  it("wipeLocalData empties the active store", async () => {
    container.setAccount("w");
    await container.saveLog(emptyLog("2026-03-03"));
    expect((await container.getAllLogs()).length).toBe(1);

    await container.wipeLocalData();
    expect(await container.getAllLogs()).toEqual([]);
  });
});
