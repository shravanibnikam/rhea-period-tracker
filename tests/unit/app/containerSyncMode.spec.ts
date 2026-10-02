/**
 * Container sync-mode gating (RHEA delete-sync defect).
 *
 * The durable outbox attaches on the CONFIGURED owner-engine mode, not on the
 * transient presence of a SyncEngine instance. Local/legacy mode must never
 * accrue owner outbox intents. The mode decision itself (isOwnerEngineSync)
 * must not depend on engine start state, so a startup-gap save can't both
 * enqueue and legacy-push.
 */
import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, vi } from "vitest";
import { Container, type OutboxMode } from "@/app/di/Container";
import { flags, isOwnerEngineSync, ownerOutboxMode } from "@/app/lib/flags";
import { emptyLog, type DailyLog } from "@/domain/types";
import { logKey, openPlain } from "@/data/envelope";
import { META_LAST_KNOWN_ROLE } from "@/data/schema";
import type { OutboxEntry } from "@/sync";
import { SyncEngine } from "@/sync";
import type { StorageDriver } from "@/data/drivers/StorageDriver";

const DATE = "2099-01-01";
const mkLog = () => ({ ...emptyLog(DATE), flow: "medium" as const });

let open: Container[] = [];
function freshContainer(uid: string): Container {
  const c = new Container();
  c.setAccount(uid);
  open.push(c);
  return c;
}
afterEach(async () => {
  for (const c of open) {
    await c.stopOwnerSync();
    await c.closeDB();
  }
  vi.restoreAllMocks();
  open = [];
});

async function outboxOf(c: Container) {
  return (await c.driver()).getAll<OutboxEntry>("outbox");
}
async function tombstoneOf(c: Container) {
  return (await c.driver()).get("tombstones", logKey(DATE));
}

describe("isOwnerEngineSync — flag/role decision (not engine-instance)", () => {
  it("authenticated owner → owner-engine mode", () =>
    expect(isOwnerEngineSync(true, "owner")).toBe(true));
  it("authenticated partner → legacy", () =>
    expect(isOwnerEngineSync(true, "partner")).toBe(false));
  it("role still resolving or failed (null/undefined) → NOT owner-engine (fail closed, P0-06)", () => {
    expect(isOwnerEngineSync(true, null)).toBe(false);
    expect(isOwnerEngineSync(true, undefined)).toBe(false);
  });
  it("unauthenticated → local (no queue accrual)", () =>
    expect(isOwnerEngineSync(false, "owner")).toBe(false));
});

describe("ownerOutboxMode — local queueing is separate from running the engine (P0-06)", () => {
  it("a confirmed owner queues; a still-unresolved role queues as 'unresolved' (offline logging must sync later)", () => {
    expect(ownerOutboxMode(true, "owner")).toBe("owner");
    expect(ownerOutboxMode(true, null)).toBe("unresolved");
    expect(ownerOutboxMode(true, undefined)).toBe("unresolved");
  });
  it("never queues for a partner or without a user", () => {
    expect(ownerOutboxMode(true, "partner")).toBe("off");
    expect(ownerOutboxMode(false, "owner")).toBe("off");
    expect(ownerOutboxMode(false, null)).toBe("off");
  });
  it("never queues in legacy mode (engine flag off: nothing would drain it)", () => {
    const saved = flags.syncEngine;
    flags.syncEngine = false;
    try {
      expect(ownerOutboxMode(true, "owner")).toBe("off");
      expect(ownerOutboxMode(true, null)).toBe("off");
    } finally {
      flags.syncEngine = saved;
    }
  });
  it("queueing never implies the engine: an unresolved role still gets no engine", () =>
    expect(isOwnerEngineSync(true, null)).toBe(false));
});

describe("Container durable-outbox mode gating", () => {
  it("reuses an active engine and creates a fresh one after stop", async () => {
    const c = freshContainer("restart-sync");
    const first = await c.startOwnerSync("restart-sync", null);
    expect(await c.startOwnerSync("restart-sync", null)).toBe(first);
    await c.stopOwnerSync();
    expect(c.syncEngine()).toBeNull();
    expect(await c.startOwnerSync("restart-sync", null)).not.toBe(first);
  });

  it("a stopped startup cannot replace the next engine after storage resolves", async () => {
    const c = freshContainer("cancelled-startup");
    const driver = await c.driver();
    let release!: (driver: StorageDriver) => void;
    const delayed = new Promise<StorageDriver>(resolve => { release = resolve; });
    vi.spyOn(c, "driver").mockImplementationOnce(() => delayed);
    const start = vi.spyOn(SyncEngine.prototype, "start");

    const obsolete = c.startOwnerSync("cancelled-startup", null);
    await c.stopOwnerSync();
    const current = await c.startOwnerSync("cancelled-startup", null);
    release(driver);
    expect(await obsolete).not.toBe(current);
    expect(c.syncEngine()).toBe(current);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("owner mode + null engine: delete removes the local row, writes a tombstone, and queues a deleted:true intent atomically", async () => {
    const c = freshContainer("owner-a");
    c.setOwnerSyncMode("owner");

    await c.saveLog(mkLog());
    await c.deleteLog(DATE);

    expect(c.isSyncEngineActive()).toBe(false); // no engine ever started
    expect(await c.getLog(DATE)).toBeUndefined();
    expect(await tombstoneOf(c)).toBeDefined();
    const q = await outboxOf(c);
    expect(q).toHaveLength(1);
    expect(q[0].record.deleted).toBe(true);
  });

  it("owner mode: a save enqueues exactly once and re-saves coalesce (no duplicate intents)", async () => {
    const c = freshContainer("owner-b");
    c.setOwnerSyncMode("owner");

    await c.saveLog(mkLog());
    expect(await outboxOf(c)).toHaveLength(1);

    await c.saveLog({ ...mkLog(), notes: "edited" });
    expect(await outboxOf(c)).toHaveLength(1); // coalesced, not duplicated
  });

  it("local/legacy mode: writes apply locally but never accrue owner outbox intents", async () => {
    const c = freshContainer("local-c");
    c.setOwnerSyncMode("off");

    await c.saveLog(mkLog());
    await c.deleteLog(DATE);

    expect(await outboxOf(c)).toHaveLength(0); // no cross-contamination / accrual
    expect(await c.getLog(DATE)).toBeUndefined(); // still applied locally
    expect(await tombstoneOf(c)).toBeDefined();
  });
});

// The Overview symptom toggle (P0-N2) writes through Container.setSymptom: it
// must queue exactly as a save does in each OutboxMode (P0-06), including the
// partner-marked store an unresolved role must never queue from.
describe("Container.setSymptom queues like a save in every OutboxMode (P0-06 × P0-N2)", () => {
  const rows: Array<{ mode: OutboxMode; marked: boolean; queued: number }> = [
    { mode: "owner", marked: false, queued: 1 },
    { mode: "owner", marked: true, queued: 1 },
    { mode: "unresolved", marked: false, queued: 1 },
    { mode: "unresolved", marked: true, queued: 0 },
    { mode: "off", marked: false, queued: 0 },
  ];

  it.each(rows.map((r) => ({ ...r, outcome: r.queued ? "queues it" : "queues nothing" })))(
    "mode $mode, partner-marked store: $marked → $outcome",
    async ({ mode, marked, queued }) => {
      const c = freshContainer(`setsymptom-${mode}-${marked ? "marked" : "unmarked"}`);
      if (marked) await (await c.driver()).put("meta", "partner", META_LAST_KNOWN_ROLE);
      c.setOwnerSyncMode(mode);

      await c.setSymptom(DATE, "Cramps", true);

      // Stored in every mode; only the queueing differs.
      expect((await c.getLog(DATE))?.symptoms).toEqual(["Cramps"]);
      const q = await outboxOf(c);
      expect(q).toHaveLength(queued);
      for (const entry of q) {
        expect(entry.record.key).toBe(logKey(DATE));
        expect(entry.record.payload && openPlain<DailyLog>(entry.record.payload)).toMatchObject({
          date: DATE,
          symptoms: ["Cramps"],
        });
      }
    }
  );
});
