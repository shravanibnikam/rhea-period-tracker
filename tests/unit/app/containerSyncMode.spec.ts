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
import { describe, it, expect, afterEach } from "vitest";
import { Container } from "@/app/di/Container";
import { isOwnerEngineSync } from "@/app/lib/flags";
import { emptyLog } from "@/domain/types";
import { logKey } from "@/data/envelope";
import type { OutboxEntry } from "@/sync";

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
  for (const c of open) await c.closeDB();
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
  it("owner whose role is still resolving (null) → owner-engine (no legacy double-push in the gap)", () =>
    expect(isOwnerEngineSync(true, null)).toBe(true));
  it("unauthenticated → local (no queue accrual)", () =>
    expect(isOwnerEngineSync(false, "owner")).toBe(false));
});

describe("Container durable-outbox mode gating", () => {
  it("owner mode + null engine: delete removes the local row, writes a tombstone, and queues a deleted:true intent atomically", async () => {
    const c = freshContainer("owner-a");
    c.setOwnerSyncMode(true);

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
    c.setOwnerSyncMode(true);

    await c.saveLog(mkLog());
    expect(await outboxOf(c)).toHaveLength(1);

    await c.saveLog({ ...mkLog(), notes: "edited" });
    expect(await outboxOf(c)).toHaveLength(1); // coalesced, not duplicated
  });

  it("local/legacy mode: writes apply locally but never accrue owner outbox intents", async () => {
    const c = freshContainer("local-c");
    c.setOwnerSyncMode(false);

    await c.saveLog(mkLog());
    await c.deleteLog(DATE);

    expect(await outboxOf(c)).toHaveLength(0); // no cross-contamination / accrual
    expect(await c.getLog(DATE)).toBeUndefined(); // still applied locally
    expect(await tombstoneOf(c)).toBeDefined();
  });
});
