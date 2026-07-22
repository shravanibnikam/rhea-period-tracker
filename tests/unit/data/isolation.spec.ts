import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { openDB, deleteDB } from "idb";
import { Container } from "@/app/di/Container";
import { emptyLog } from "@/domain/types";

// Account-isolation regression suite (local / IndexedDB surface).
// Proves the client-side guarantees the isolation fix must uphold:
//   - a brand-new unrelated account starts completely empty,
//   - its JSON export contains none of another account's records,
//   - switching accounts never leaks another account's local data,
//   - the unscoped legacy `rhea` DB is never auto-imported into an account.
// (Cloud-side owner isolation + partner link/unlink are covered by the pgTAP
//  suite in supabase/tests/rls_isolation.sql.)

async function nukeAllDatabases(): Promise<void> {
  const dbs = (await indexedDB.databases?.()) ?? [];
  for (const d of dbs) if (d.name) await deleteDB(d.name);
}

async function seedLegacyWithHealthData(): Promise<void> {
  const legacy = await openDB("rhea", 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("logs")) db.createObjectStore("logs", { keyPath: "date" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
    },
  });
  await legacy.put("logs", { ...emptyLog("2026-01-05"), flow: "heavy", notes: "private note" });
  await legacy.put("logs", { ...emptyLog("2026-01-06"), symptoms: ["cramps"] });
  legacy.close();
}

const dates = (logs: Array<{ date: string }>) => logs.map((l) => l.date).sort();

let container: Container;

beforeEach(async () => {
  await container?.closeDB();
  await nukeAllDatabases();
  container = new Container();
});

describe("account isolation — brand-new account (account B) is empty", () => {
  it("account B cannot read account A's rows and starts empty", async () => {
    // Account A logs private health data.
    container.setAccount("account-A");
    await container.saveLog({ ...emptyLog("2026-01-05"), flow: "heavy", notes: "private note" });
    await container.saveLog({ ...emptyLog("2026-01-06"), symptoms: ["cramps"] });
    expect(dates(await container.getAllLogs())).toEqual(["2026-01-05", "2026-01-06"]);

    // A brand-new, unrelated account B signs in on the same device.
    container.setAccount("account-B");
    expect(await container.getAllLogs()).toEqual([]);
  });

  it("account B's JSON export contains none of account A's records", async () => {
    container.setAccount("account-A");
    await container.saveLog({ ...emptyLog("2026-01-05"), flow: "heavy", notes: "private note" });

    container.setAccount("account-B");
    const backup = await container.exportBackup();
    expect(backup.logs ?? []).toEqual([]);
    expect((backup.logs ?? []).some((l) => l.notes === "private note")).toBe(false);
  });

  it("switching accounts does not leak local IndexedDB data (A → B → A)", async () => {
    container.setAccount("account-A");
    await container.saveLog(emptyLog("2026-01-05"));

    container.setAccount("account-B");
    await container.saveLog(emptyLog("2026-02-02"));
    expect(dates(await container.getAllLogs())).toEqual(["2026-02-02"]); // only B's own

    container.setAccount("account-A");
    expect(dates(await container.getAllLogs())).toEqual(["2026-01-05"]); // A intact, unpolluted
  });
});

describe("account isolation — no legacy auto-import", () => {
  it("a brand-new account does NOT inherit pre-scoping legacy health data", async () => {
    await seedLegacyWithHealthData();

    container.setAccount("brand-new-unrelated-account");
    expect(await container.getAllLogs()).toEqual([]);

    const backup = await container.exportBackup();
    expect(backup.logs ?? []).toEqual([]);
  });
});
