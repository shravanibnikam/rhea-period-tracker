/**
 * Durable-outbox regression suite (RHEA delete-sync defect).
 *
 * Owner-sync writes MUST enqueue through a driver-backed outbox even when no
 * SyncEngine instance exists yet (lifecycle gap). A later start drains the
 * queue; a failed transport retains the entry for retry. Lifecycle gaps may
 * DELAY delivery but must never LOSE a mutation.
 */
import { describe, it, expect } from "vitest";
import { MemoryDriver } from "@/data/drivers/MemoryDriver";
import { LogRepository } from "@/data/repositories";
import { Outbox, SyncEngine } from "@/sync";
import type { OutboxEntry } from "@/sync";
import { logKey } from "@/data/envelope";
import { emptyLog } from "@/domain/types";
import { encodeHlc, compareHlc } from "@/domain/hlc";
import { FakeTransport } from "../helpers/fakeTransport";

const DATE = "2099-01-01";
const mkLog = () => ({ ...emptyLog(DATE), flow: "medium" as const });

describe("durable outbox — mutations survive engine lifecycle gaps", () => {
  it("delete while the engine is null: local row removed, tombstone written, deleted:true intent queued atomically — and a later engine start drains + pushes it", async () => {
    const driver = new MemoryDriver();
    // Owner mode with NO engine → a driver-backed outbox (what Container.logs()
    // now attaches via `this.engine?.outbox ?? new Outbox(driver)`).
    const outbox = new Outbox(driver);
    const repo = new LogRepository(driver, { outbox });

    await repo.save(mkLog());
    await repo.delete(DATE);

    // Atomic local effects + queued sync intent (same transaction in delete()).
    expect(await repo.get(DATE)).toBeUndefined();
    expect(await driver.get("tombstones", logKey(DATE))).toBeDefined();
    const queued = await driver.getAll<OutboxEntry>("outbox");
    expect(queued).toHaveLength(1);
    expect(queued[0].record.deleted).toBe(true);
    expect(queued[0].record.key).toBe(logKey(DATE));

    // Later: the engine starts (fresh instance, same driver/store) and delivers.
    const transport = new FakeTransport();
    const engine = new SyncEngine({
      deviceId: "dev-1",
      selfPeerId: "owner-1",
      scopes: ["owner"],
      transport,
      driver,
    });
    await engine.start();

    expect(await outbox.depth()).toBe(0); // drained
    const serverRows = transport.rows("owner-1", "owner");
    expect(serverRows).toHaveLength(1);
    expect(serverRows[0].key).toBe(logKey(DATE));
    expect(serverRows[0].deleted).toBe(true); // tombstone reached the server
    await engine.stop();
  });

  it("a failed transport delivery retains the outbox entry and delivers it on retry", async () => {
    let clock = 1_000_000;
    const now = () => clock;
    const driver = new MemoryDriver();
    const transport = new FakeTransport();
    const engine = new SyncEngine({
      deviceId: "dev-1",
      selfPeerId: "owner-1",
      scopes: ["owner"],
      transport,
      driver,
      now,
    });
    const repo = new LogRepository(driver, { outbox: engine.outbox, now });

    await repo.save(mkLog());
    expect(await engine.outbox.depth()).toBe(1);

    transport.failPushes = 1;
    const failRes = await engine.flush("manual");
    expect(failRes.failed).toBeGreaterThan(0);
    expect(await engine.outbox.depth()).toBe(1); // retained, not dropped

    clock += 10 * 60 * 1000; // advance past the backoff window
    const okRes = await engine.flush("manual");
    expect(okRes.pushed).toBeGreaterThan(0);
    expect(await engine.outbox.depth()).toBe(0); // delivered on retry
    expect(transport.rows("owner-1", "owner")).toHaveLength(1);
  });
});

describe("key-aware HLC stamping — an edit/delete always dominates the row it replaces", () => {
  const localNow = 1_784_000_000_000;
  // A row authored by ANOTHER device, 5s "ahead" (within HLC drift), while this
  // device's local clock lags at localNow. Pre-fix, a stamp would be < rowHlc
  // and the server LWW guard would silently drop it.
  const rowHlc = encodeHlc(localNow + 5000, 0, "other-device");

  it("delete produces a tombstone HLC strictly greater than the row's stored HLC", async () => {
    const driver = new MemoryDriver();
    const outbox = new Outbox(driver);
    await driver.put("logs", { ...mkLog(), updatedAt: rowHlc, deviceId: "other-device", deleted: false });

    const repo = new LogRepository(driver, { outbox, now: () => localNow });
    await repo.delete(DATE);

    const q = await driver.getAll<OutboxEntry>("outbox");
    expect(q).toHaveLength(1);
    expect(q[0].record.deleted).toBe(true);
    expect(compareHlc(q[0].record.updatedAt, rowHlc)).toBeGreaterThan(0); // wins LWW
  });

  it("save produces an edit HLC strictly greater than the row's stored HLC", async () => {
    const driver = new MemoryDriver();
    const outbox = new Outbox(driver);
    await driver.put("logs", { ...mkLog(), updatedAt: rowHlc, deviceId: "other-device", deleted: false });

    const repo = new LogRepository(driver, { outbox, now: () => localNow });
    await repo.save({ ...emptyLog(DATE), flow: "heavy" });

    const q = await driver.getAll<OutboxEntry>("outbox");
    expect(q).toHaveLength(1);
    expect(q[0].record.deleted).toBe(false);
    expect(compareHlc(q[0].record.updatedAt, rowHlc)).toBeGreaterThan(0); // wins LWW
  });
});
