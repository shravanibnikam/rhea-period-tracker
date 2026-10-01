/**
 * P0-02 — the outbox ack is a compare-and-delete (RED-on-parent).
 *
 * claimDue hands the engine a SNAPSHOT of each entry. A save made while that
 * snapshot is on the wire replaces the entry's record under the SAME id, and
 * the server's answer (accepted, or stale-write) is about the snapshot. So the
 * ack may delete the entry only while it still holds the pushed content —
 * otherwise the newer save is destroyed unsent, the server keeps the old row,
 * and the next pull skips it as an echo of a lower HLC: permanent divergence.
 *
 * Real IndexedDbDriver on fake-indexeddb + the latched transport (G-03); see
 * tests/helpers/idbSyncRig.ts for why this cannot run on MemoryDriver.
 */
import { afterEach, describe, expect, it } from "vitest";
import { logKey, sealPlain, type SyncRecord } from "@/data/envelope";
import { compareHlc, encodeHlc } from "@/domain/hlc";
import type { ParkedPush, PushVerdict } from "../helpers/latchedTransport";
import {
  DATE,
  OWNER,
  logWithNotes,
  makeIdbSyncRig,
  notesOf,
  type IdbSyncRig,
} from "../helpers/idbSyncRig";

let rig: IdbSyncRig | undefined;
afterEach(async () => {
  await rig?.dispose();
  rig = undefined;
});

const queuedNotes = async (r: IdbSyncRig) => (await r.entries()).map((e) => notesOf(e.record));
const serverNotes = (r: IdbSyncRig) => r.serverRows().map(notesOf);

/** Another device's edit of the same day, at physical time `pt`. */
function theirEdit(pt: number): SyncRecord {
  return {
    key: logKey(DATE),
    scope: "owner",
    payload: sealPlain(logWithNotes("theirs")),
    updatedAt: encodeHlc(pt, 0, "dev-b"),
    deviceId: "dev-b",
    deleted: false,
  };
}

/** Save v1, flush, and park its push; then run `saveV2` while v1 is on the wire. */
async function saveDuringPush(r: IdbSyncRig, saveV2: () => Promise<unknown>) {
  await r.repo.save(logWithNotes("v1"));
  const parked = r.transport.latchNextPush();
  const flush = r.engine.flush("manual");
  const first = await parked;
  expect(first.rows.map(notesOf)).toEqual(["v1"]);
  r.clock.advance(10);
  await saveV2();
  return { first, flush };
}

/**
 * Release the parked push, then wait for whichever comes first: the flush's
 * next push round (parked, so the queue can be inspected) or the flush ending.
 */
async function releaseThenNextRound(
  r: IdbSyncRig,
  first: ParkedPush,
  flush: Promise<unknown>,
  verdict?: PushVerdict
): Promise<ParkedPush | null> {
  const next = r.transport.latchNextPush();
  first.release(verdict);
  return Promise.race([next, flush.then(() => null)]);
}

describe("P0-02 — a save made while its entry is on the wire survives the ack", () => {
  it("accepted: acking the old content keeps the newer save, and the next round transmits it", async () => {
    const r = (rig = makeIdbSyncRig());
    const { first, flush } = await saveDuringPush(r, () => r.repo.save(logWithNotes("v2")));

    const second = await releaseThenNextRound(r, first, flush); // the server accepts v1

    expect(await queuedNotes(r), "the save made during the push is still queued").toEqual(["v2"]);
    expect(second?.rows.map(notesOf), "the next push round transmits it").toEqual(["v2"]);
    second!.release();
    await expect(flush).resolves.toMatchObject({ failed: 0, remaining: 0 });
    expect(serverNotes(r)).toEqual(["v2"]);
    expect(await r.entries()).toEqual([]);
  });

  it("stale-write: the server's rejection of the OLD content does not drop the newer save", async () => {
    const r = (rig = makeIdbSyncRig());
    const { first, flush } = await saveDuringPush(r, () => r.repo.save(logWithNotes("v2")));
    // Another device's edit reached the server first; its HLC sits between v1 and v2.
    const theirs = theirEdit(r.clock.now() - 5);
    await r.transport.server.push([theirs], { peerId: OWNER, deviceId: "dev-b" });
    const [queued] = await r.entries();
    expect(compareHlc(first.rows[0].updatedAt, theirs.updatedAt)).toBeLessThan(0); // v1 loses LWW
    expect(compareHlc(queued.record.updatedAt, theirs.updatedAt)).toBeGreaterThan(0); // v2 wins it

    const second = await releaseThenNextRound(r, first, flush); // server: v1 is a stale write

    expect(await queuedNotes(r), "the newer save is still queued").toEqual(["v2"]);
    expect(second?.rows.map(notesOf), "the next push round transmits it").toEqual(["v2"]);
    second!.release(); // server: v2 is newer than theirs
    await expect(flush).resolves.toMatchObject({ remaining: 0 });
    expect(serverNotes(r)).toEqual(["v2"]);
  });

  it("a save from ANOTHER TAB (its own connection to the same database) survives the ack", async () => {
    const r = (rig = makeIdbSyncRig());
    const tab = r.openTab();
    const { first, flush } = await saveDuringPush(r, () => tab.save(logWithNotes("v2")));

    const second = await releaseThenNextRound(r, first, flush);

    expect(await queuedNotes(r), "the other tab's save is still queued").toEqual(["v2"]);
    expect(second?.rows.map(notesOf), "the next push round transmits it").toEqual(["v2"]);
    second!.release();
    await expect(flush).resolves.toMatchObject({ remaining: 0 });
    expect(serverNotes(r)).toEqual(["v2"]);
  });

  it("the ack is ONE transaction: a save landing inside the ack (between its read and its delete) is kept", async () => {
    const r = (rig = makeIdbSyncRig());
    await r.repo.save(logWithNotes("v1"));
    const parked = r.transport.latchNextPush();
    const flush = r.engine.flush("manual");
    const first = await parked;
    const [claimed] = await r.entries();
    r.clock.advance(10);
    const inside = r.driver.interleaveAt("outbox", claimed.id, () =>
      r.repo.save(logWithNotes("v2"))
    );

    const second = await releaseThenNextRound(r, first, flush); // accepted → ack(v1), v2 lands inside
    await inside.done;

    expect(inside.hit, "the save landed inside the ack").not.toBeNull();
    expect(await queuedNotes(r), "the save that landed inside the ack is still queued").toEqual([
      "v2",
    ]);
    expect(second?.rows.map(notesOf), "the next push round transmits it").toEqual(["v2"]);
    second!.release();
    await expect(flush).resolves.toMatchObject({ remaining: 0 });
    expect(serverNotes(r)).toEqual(["v2"]);
  });

  it("an entry stored before the revision field existed is protected too", async () => {
    const r = (rig = makeIdbSyncRig());
    await r.repo.save(logWithNotes("v1"));
    const [stored] = await r.entries();
    const { revision: _revision, ...legacy } = stored;
    await r.driver.inner.put("outbox", legacy); // exactly as a pre-fix build stored it
    const parked = r.transport.latchNextPush();
    const flush = r.engine.flush("manual");
    const first = await parked;
    r.clock.advance(10);
    await r.repo.save(logWithNotes("v2"));

    const second = await releaseThenNextRound(r, first, flush);

    expect(await queuedNotes(r), "the save made during the push is still queued").toEqual(["v2"]);
    expect(second?.rows.map(notesOf), "the next push round transmits it").toEqual(["v2"]);
    second!.release();
    await expect(flush).resolves.toMatchObject({ remaining: 0 });
    expect(serverNotes(r)).toEqual(["v2"]);
  });
});

describe("P0-02 — entries nothing touched are still settled by the ack (happy paths)", () => {
  it("accepted: the entry is deleted, with no redundant re-push", async () => {
    const r = (rig = makeIdbSyncRig());
    await r.repo.save(logWithNotes("v1"));
    const parked = r.transport.latchNextPush();
    const flush = r.engine.flush("manual");
    (await parked).release();

    await expect(flush).resolves.toMatchObject({ pushed: 1, failed: 0, remaining: 0 });
    expect(await r.entries()).toEqual([]);
    expect(serverNotes(r)).toEqual(["v1"]);
    expect(r.transport.calls).toHaveLength(1);
  });

  it("stale-write: the entry is dropped and the server's newer row stands", async () => {
    const r = (rig = makeIdbSyncRig());
    await r.repo.save(logWithNotes("v1"));
    await r.transport.server.push([theirEdit(r.clock.now() + 5)], { peerId: OWNER, deviceId: "dev-b" });

    await expect(r.engine.flush("manual")).resolves.toMatchObject({
      pushed: 0,
      failed: 0,
      remaining: 0,
    });
    expect(await r.entries()).toEqual([]);
    expect(serverNotes(r)).toEqual(["theirs"]);
  });

  it("an entry stored before the revision field existed is acked as revision 0", async () => {
    const r = (rig = makeIdbSyncRig());
    await r.repo.save(logWithNotes("v1"));
    const [stored] = await r.entries();
    const { revision: _revision, ...legacy } = stored;
    await r.driver.inner.put("outbox", legacy);
    expect(Object.keys((await r.entries())[0])).not.toContain("revision");

    await expect(r.engine.flush("manual")).resolves.toMatchObject({ pushed: 1, remaining: 0 });
    expect(await r.entries()).toEqual([]);
  });
});

describe("P0-02 — Outbox.ack(id, expectedRevision)", () => {
  it("deletes only while the entry holds the claimed revision; a stale ack leaves the newer content claimable", async () => {
    const r = (rig = makeIdbSyncRig());
    const { outbox } = r.engine;
    await r.repo.save(logWithNotes("v1"));
    const [mine] = await outbox.claimDue(r.clock.now(), 10, 30_000);
    r.clock.advance(10);
    await r.repo.save(logWithNotes("v2")); // replaces mine's record under the same id
    const [again] = await outbox.claimDue(r.clock.now(), 10, 30_000); // e.g. another tab's flush
    expect(again.id).toBe(mine.id);

    await outbox.ack(mine.id, mine.revision); // stale: v1 was pushed, v2 is queued
    const kept = await r.entries();
    expect(kept.map((e) => notesOf(e.record)), "a stale ack keeps the newer content").toEqual(["v2"]);
    expect(kept.map((e) => e.leaseUntil), "and leaves it immediately claimable").toEqual([undefined]);

    await outbox.ack(again.id, again.revision); // current
    expect(await r.entries()).toEqual([]);
  });
});
