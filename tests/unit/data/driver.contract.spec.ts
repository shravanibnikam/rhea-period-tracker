import "fake-indexeddb/auto";
import { describe, it, expect, afterEach } from "vitest";
import { IndexedDbDriver } from "@/data/drivers/IndexedDbDriver";
import { MemoryDriver } from "@/data/drivers/MemoryDriver";
import { applySchema } from "@/data/drivers/IndexedDbDriver";
import type { StorageDriver } from "@/data/drivers/StorageDriver";
import type { StoreDef } from "@/data/schema";

// Driver-contract suite (RHEA-032): both drivers must satisfy the same
// observable behavior, so repositories cannot tell them apart. Includes an
// indexed store so getByIndexSince is exercised even though v1's physical
// schema doesn't carry the index yet (M1.5 adds it to real stores).

const TEST_STORES: readonly StoreDef[] = [
  { name: "logs", keyPath: "date", indexes: [{ name: "by_updatedAt", keyPath: "updatedAt" }] },
  { name: "meta", keyPath: null },
];

let seq = 0;
const drivers: StorageDriver[] = [];

function makeIdb(): StorageDriver {
  const d = new IndexedDbDriver(
    { dbName: `contract-${Date.now()}-${seq++}`, accountId: null, role: "local" },
    { version: 1, upgrade: (db) => applySchema(db, TEST_STORES) }
  );
  drivers.push(d);
  return d;
}

function makeMemory(): StorageDriver {
  const d = new MemoryDriver({ dbName: `mem-${seq++}` }, TEST_STORES);
  drivers.push(d);
  return d;
}

afterEach(async () => {
  for (const d of drivers.splice(0)) await d.destroy().catch(() => {});
});

const row = (date: string, updatedAt = "") => ({ date, flow: "medium", updatedAt });

describe.each([
  ["IndexedDbDriver", makeIdb],
  ["MemoryDriver", makeMemory],
] as const)("StorageDriver contract — %s", (_name, make) => {
  it("put/get/delete round-trip with in-line keys", async () => {
    const d = make();
    await d.ready();
    await d.put("logs", row("2026-01-01"));
    expect(await d.get("logs", "2026-01-01")).toMatchObject({ date: "2026-01-01" });
    await d.delete("logs", "2026-01-01");
    expect(await d.get("logs", "2026-01-01")).toBeUndefined();
  });

  it("out-of-line keys on meta", async () => {
    const d = make();
    await d.ready();
    await d.put("meta", { theme: "dark" }, "settings");
    expect(await d.get("meta", "settings")).toEqual({ theme: "dark" });
    expect(await d.getAllKeys("meta")).toEqual(["settings"]);
  });

  it("getAll returns key-ordered rows; count matches", async () => {
    const d = make();
    await d.ready();
    await d.put("logs", row("2026-01-03"));
    await d.put("logs", row("2026-01-01"));
    await d.put("logs", row("2026-01-02"));
    const all = await d.getAll<{ date: string }>("logs");
    expect(all.map((r) => r.date)).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
    expect(await d.count("logs")).toBe(3);
    await d.clear("logs");
    expect(await d.count("logs")).toBe(0);
  });

  it("put overwrites by key (upsert)", async () => {
    const d = make();
    await d.ready();
    await d.put("logs", { ...row("2026-01-01"), flow: "light" });
    await d.put("logs", { ...row("2026-01-01"), flow: "heavy" });
    expect(await d.count("logs")).toBe(1);
    expect(await d.get("logs", "2026-01-01")).toMatchObject({ flow: "heavy" });
  });

  it("transaction commits atomically", async () => {
    const d = make();
    await d.ready();
    await d.transaction({ mode: "readwrite", stores: ["logs", "meta"] }, async (tx) => {
      await tx.put("logs", row("2026-02-01"));
      await tx.put("meta", 42, "answer");
    });
    expect(await d.count("logs")).toBe(1);
    expect(await d.get("meta", "answer")).toBe(42);
  });

  it("transaction rolls back every store on throw", async () => {
    const d = make();
    await d.ready();
    await d.put("meta", "before", "k");
    await expect(
      d.transaction({ mode: "readwrite", stores: ["logs", "meta"] }, async (tx) => {
        await tx.put("logs", row("2026-02-02"));
        await tx.put("meta", "after", "k");
        throw new Error("boom");
      })
    ).rejects.toThrow();
    expect(await d.count("logs")).toBe(0);
    expect(await d.get("meta", "k")).toBe("before");
  });

  it("getByIndexSince pages in (indexKey, primaryKey) order from a bound", async () => {
    const d = make();
    await d.ready();
    // HLC-ish sortable strings
    await d.put("logs", row("2026-01-01", "000000000001:0000:a"));
    await d.put("logs", row("2026-01-02", "000000000003:0000:a"));
    await d.put("logs", row("2026-01-03", "000000000002:0000:a"));
    await d.put("logs", row("2026-01-04", "000000000002:0000:a")); // tie on index key

    const p1 = await d.getByIndexSince<{ date: string }>(
      "logs", "by_updatedAt", "000000000002:0000:a", 2
    );
    expect(p1.items.map((r) => r.date)).toEqual(["2026-01-03", "2026-01-04"]);
    expect(p1.cursor).toBeDefined();

    const p2 = await d.getByIndexSince<{ date: string }>(
      "logs", "by_updatedAt", "000000000002:0000:a", 2, p1.cursor
    );
    expect(p2.items.map((r) => r.date)).toEqual(["2026-01-02"]);
    expect(p2.cursor).toBeUndefined();
  });

  it("destroy wipes everything (reopen is empty)", async () => {
    const d = make();
    await d.ready();
    await d.put("logs", row("2026-03-01"));
    await d.destroy();
    await d.ready(); // reopen the same physical DB
    expect(await d.count("logs")).toBe(0);
  });
});
