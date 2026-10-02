/**
 * G-03 — self-test of the interleaving harness (LatchedTransport,
 * InterleavingDriver, idbSyncRig). It pins the harness's own mechanics, so it
 * is green with or without the outbox compare-and-swap fixes: the outbox CAS
 * specs are only as trustworthy as these latches.
 */
import { afterEach, describe, expect, it } from "vitest";
import { sealPlain, type SyncRecord } from "@/data/envelope";
import { encodeHlc } from "@/domain/hlc";
import { LatchedTransport } from "../helpers/latchedTransport";
import { makeIdbSyncRig, logWithNotes, notesOf, OWNER, type IdbSyncRig } from "../helpers/idbSyncRig";

const T = 1_770_000_000_000;
const ctx = { peerId: OWNER, deviceId: "dev-a" };

const rec = (key: string, notes: string, pt = T): SyncRecord => ({
  key,
  scope: "owner",
  payload: sealPlain({ notes }),
  updatedAt: encodeHlc(pt, 0, "dev-a"),
  deviceId: "dev-a",
  deleted: false,
});

/** Let fake-indexeddb (setImmediate-scheduled) and any pending work run. */
async function macrotasks(n = 10): Promise<void> {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
}

function track(p: Promise<unknown>): { settled: boolean } {
  const state = { settled: false };
  p.then(
    () => (state.settled = true),
    () => (state.settled = true)
  );
  return state;
}

let rig: IdbSyncRig | undefined;
afterEach(async () => {
  await rig?.dispose();
  rig = undefined;
});

describe("LatchedTransport", () => {
  it("parks the engine's push until released, exposing what it received; the flush then completes", async () => {
    rig = makeIdbSyncRig();
    await rig.repo.save(logWithNotes("v1"));

    const parked = rig.transport.latchNextPush();
    const flush = rig.engine.flush("manual");
    const flushState = track(flush);
    const push = await parked;

    expect(push.rows.map(notesOf)).toEqual(["v1"]);
    expect(push.ctx.peerId).toBe(OWNER);
    await macrotasks();
    expect(flushState.settled).toBe(false); // really parked
    const [claimed] = await rig.entries();
    expect(claimed.leaseUntil).toBeGreaterThan(rig.clock.now()); // claimed + leased meanwhile
    expect(rig.serverRows()).toEqual([]); // nothing reached the server yet

    push.release(); // default verdict: the server's own answer
    await expect(flush).resolves.toMatchObject({ pushed: 1, failed: 0, remaining: 0 });
    expect(rig.serverRows().map(notesOf)).toEqual(["v1"]);
    expect(rig.transport.calls.map((c) => c.latched)).toEqual([true]);
  });

  it("lets the test choose the outcome at release: forced rejection, whole-batch failure, stale-write", async () => {
    rig = makeIdbSyncRig();
    await rig.repo.save(logWithNotes("v1"));

    let parked = rig.transport.latchNextPush();
    let flush = rig.engine.flush("manual");
    (await parked).release({ kind: "reject", reason: "malformed" });
    await expect(flush).resolves.toMatchObject({ pushed: 0, failed: 1, remaining: 1 });
    expect(await rig.entries()).toMatchObject([{ attempts: 1, lastError: "malformed" }]);

    rig.clock.advance(1_000); // past delay(0)
    parked = rig.transport.latchNextPush();
    flush = rig.engine.flush("manual");
    (await parked).release({ kind: "throw", message: "boom" });
    await expect(flush).resolves.toMatchObject({ pushed: 0, failed: 1, remaining: 1 });
    expect(await rig.entries()).toMatchObject([{ attempts: 2, lastError: "boom" }]);
    expect((await rig.engine.statusAsync()).lastError).toBe("boom");

    rig.clock.advance(2_000); // past delay(1)
    parked = rig.transport.latchNextPush();
    flush = rig.engine.flush("manual");
    (await parked).release({ kind: "reject", reason: "stale-write" });
    await expect(flush).resolves.toMatchObject({ pushed: 0, failed: 0, remaining: 0 });

    expect(rig.serverRows()).toEqual([]); // forced verdicts never touch the server
    expect(rig.transport.calls).toHaveLength(3);
  });

  it("each latch parks exactly one push, in arrival order; unlatched pushes go straight to the server", async () => {
    const t = new LatchedTransport();
    const first = t.latchNextPush();
    const second = t.latchNextPush();
    const rows1 = [rec("log:a", "a")];
    const r1 = t.push(rows1, ctx);
    const r2 = t.push([rec("log:b", "b")], ctx);
    const r3 = t.push([rec("log:c", "c")], ctx); // no latch left

    await expect(r3).resolves.toMatchObject({ accepted: ["log:c"] });
    const [p1, p2] = await Promise.all([first, second]);
    expect(p1.rows.map((r) => r.key)).toEqual(["log:a"]);
    expect(p2.rows.map((r) => r.key)).toEqual(["log:b"]);
    expect(t.server.rows(OWNER, "owner").map((r) => r.key)).toEqual(["log:c"]);

    p2.release();
    await expect(r2).resolves.toMatchObject({ accepted: ["log:b"] });
    p1.release({ kind: "reject", reason: "stale-write" });
    await expect(r1).resolves.toMatchObject({
      accepted: [],
      rejected: [{ key: "log:a", reason: "stale-write" }],
    });
    expect(() => p1.release()).toThrow(/released twice/);

    rows1[0].key = "log:mutated"; // calls are deep copies, not live views
    expect(t.calls.map((c) => [c.rows[0].key, c.latched])).toEqual([
      ["log:a", true],
      ["log:b", true],
      ["log:c", false],
    ]);

    t.close(); // end of test: a runaway flush must stop at its next push
    await expect(t.push([rec("log:d", "d")], ctx)).rejects.toThrow(/closed/);
    expect(t.calls).toHaveLength(3);
  });
});

describe("InterleavingDriver (over the real IndexedDbDriver)", () => {
  it("primitive read→write: the concurrent write commits INSIDE the window, so a lost update is reproducible", async () => {
    rig = makeIdbSyncRig();
    const { driver } = rig;
    await driver.put("meta", 1, "k");
    const il = driver.interleaveAt("meta", "k", () =>
      driver.transaction({ mode: "readwrite", stores: ["meta"] }, async (tx) => {
        const v = (await tx.get<number>("meta", "k"))!;
        await tx.put("meta", v * 10, "k");
      })
    );

    const read = (await driver.get<number>("meta", "k"))!; // the caller's (stale) read
    expect(il.hit).toEqual({ op: "get", inTransaction: false });
    expect(read).toBe(1);
    expect(await driver.inner.get("meta", "k")).toBe(10); // committed before the caller resumed
    await driver.put("meta", read + 1, "k"); // the caller's write, from the stale read
    await il.done;
    expect(await driver.get("meta", "k")).toBe(2); // the concurrent update was lost
  });

  it("transactional read→write: the concurrent write queues behind the transaction and commits after it", async () => {
    rig = makeIdbSyncRig();
    const { driver } = rig;
    await driver.put("meta", 1, "k");
    const il = driver.interleaveAt("meta", "k", () =>
      driver.transaction({ mode: "readwrite", stores: ["meta"] }, async (tx) => {
        const v = (await tx.get<number>("meta", "k"))!;
        await tx.put("meta", v * 10, "k");
      })
    );

    await driver.transaction({ mode: "readwrite", stores: ["meta"] }, async (tx) => {
      const v = (await tx.get<number>("meta", "k"))!;
      expect(v).toBe(1);
      await tx.put("meta", v + 1, "k");
    });
    expect(il.hit).toEqual({ op: "get", inTransaction: true });
    await il.done;
    expect(await driver.get("meta", "k")).toBe(20); // ran strictly after, and saw the committed 2
  });

  it("fires before a blind delete/put, only for the armed store+key, and only once", async () => {
    rig = makeIdbSyncRig();
    const { driver } = rig;
    await driver.put("meta", "x", "k");
    await driver.put("meta", "y", "other");

    const del = driver.interleaveAt("meta", "k", () => driver.put("meta", "concurrent", "k"));
    await driver.get("meta", "other"); // other key: no fire
    await driver.getAll("meta"); // not a keyed access: no fire
    expect(del.hit).toBeNull();
    await driver.delete("meta", "k");
    expect(del.hit).toEqual({ op: "delete", inTransaction: false });
    await del.done;
    expect(await driver.get("meta", "k")).toBeUndefined(); // the concurrent put landed first

    // In-line keyPath (tombstones.key), inside a transaction.
    const put = driver.interleaveAt("tombstones", "log:z", () => driver.delete("tombstones", "log:z"));
    const row = { key: "log:z", scope: "owner", deletedAt: encodeHlc(T, 0, "d"), deviceId: "d", acked: false };
    await driver.transaction({ mode: "readwrite", stores: ["tombstones"] }, async (tx) => {
      await tx.put("tombstones", row);
    });
    expect(put.hit).toEqual({ op: "put", inTransaction: true });
    await put.done;
    expect(await driver.get("tombstones", "log:z")).toBeUndefined(); // the delete committed after

    await driver.delete("meta", "other"); // disarmed: nothing fires again
    expect(await driver.get("meta", "other")).toBeUndefined();
  });
});
