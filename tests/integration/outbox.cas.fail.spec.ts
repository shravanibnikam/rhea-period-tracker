/**
 * P0-03 — the outbox fail() is a compare-and-swap (RED-on-parent).
 *
 * fail() read the entry and wrote it back outside any transaction, without
 * asking whether it still held the content whose push failed:
 * - a save that replaced the entry while the push was in flight inherited the
 *   old content's failure (attempts + 1, the backoff, its lastError);
 * - a save committing between fail()'s read and its write was overwritten by
 *   the OLD record, which the retry then pushed: superseded content restored.
 * releaseLease() had the same read-modify-write shape. And a fresh save that
 * replaced an entry which had failed earlier inherited its attempt count.
 *
 * Real IndexedDbDriver on fake-indexeddb + the latched transport (G-03); see
 * tests/helpers/idbSyncRig.ts for why this cannot run on MemoryDriver.
 */
import { afterEach, describe, expect, it } from "vitest";
import type { ParkedPush, PushVerdict } from "../helpers/latchedTransport";
import { logWithNotes, makeIdbSyncRig, notesOf, type IdbSyncRig } from "../helpers/idbSyncRig";

let rig: IdbSyncRig | undefined;
afterEach(async () => {
  await rig?.dispose();
  rig = undefined;
});

const serverNotes = (r: IdbSyncRig) => r.serverRows().map(notesOf);
const pushedNotes = (r: IdbSyncRig) => r.transport.calls.map((c) => c.rows.map(notesOf));

/** The queue as the retry logic sees it, at the rig's current instant. */
async function queueState(r: IdbSyncRig) {
  const now = r.clock.now();
  return (await r.entries()).map((e) => ({
    notes: notesOf(e.record),
    attempts: e.attempts,
    lastError: e.lastError,
    leased: e.leaseUntil !== undefined && e.leaseUntil > now,
    due: e.nextAttemptAt <= now,
  }));
}

/** What a fresh save must look like in the queue: no inherited failure, claimable now. */
const FRESH_V2 = { notes: "v2", attempts: 0, lastError: undefined, leased: false, due: true };

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

/** Park v1's push and arm a save of v2 to land INSIDE the engine's settle of v1. */
async function saveInsideSettle(r: IdbSyncRig) {
  await r.repo.save(logWithNotes("v1"));
  const parked = r.transport.latchNextPush();
  const flush = r.engine.flush("manual");
  const first = await parked;
  const [claimed] = await r.entries();
  r.clock.advance(10);
  const inside = r.driver.interleaveAt("outbox", claimed.id, () =>
    r.repo.save(logWithNotes("v2"))
  );
  return { first, flush, inside };
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

describe("P0-03 — a newer save never inherits the old content's failure", () => {
  it("per-entry rejection: the newer save keeps attempts 0 and the next round transmits it", async () => {
    const r = (rig = makeIdbSyncRig());
    const { first, flush } = await saveDuringPush(r, () => r.repo.save(logWithNotes("v2")));

    const malformed: PushVerdict = { kind: "reject", reason: "malformed" };
    const second = await releaseThenNextRound(r, first, flush, malformed);

    const queued = (await queueState(r)).map((e) => [e.notes, e.attempts, e.lastError]);
    expect(queued, "the newer save does not inherit the old content's failure").toEqual([
      ["v2", 0, undefined],
    ]);
    expect(second?.rows.map(notesOf), "due and unleased at once: the next round sends it").toEqual([
      "v2",
    ]);
    second!.release();
    await expect(flush).resolves.toMatchObject({ remaining: 0 });
    expect(serverNotes(r)).toEqual(["v2"]);
  });

  it("whole-batch failure: the newer save keeps attempts 0, is due now and unleased; the next flush transmits it", async () => {
    const r = (rig = makeIdbSyncRig());
    const { first, flush } = await saveDuringPush(r, () => r.repo.save(logWithNotes("v2")));

    first.release({ kind: "throw", message: "offline" });
    await expect(flush).resolves.toMatchObject({ pushed: 0 });

    expect(await queueState(r), "the newer save does not inherit the batch's failure").toEqual([
      FRESH_V2,
    ]);
    await expect(r.engine.flush("manual")).resolves.toMatchObject({ pushed: 1, remaining: 0 });
    expect(serverNotes(r)).toEqual(["v2"]);
    expect(pushedNotes(r)).toEqual([["v1"], ["v2"]]);
  });

  it("a save replacing an entry that failed EARLIER starts again at attempts 0, due now", async () => {
    const r = (rig = makeIdbSyncRig());
    await r.repo.save(logWithNotes("v1"));
    r.transport.server.failPushes = 1;
    await expect(r.engine.flush("manual")).resolves.toMatchObject({ failed: 1, remaining: 1 });
    expect(await queueState(r)).toMatchObject([{ notes: "v1", attempts: 1, due: false }]);

    r.clock.advance(10);
    await r.repo.save(logWithNotes("v2"));

    expect(await queueState(r), "fresh content gets a fresh retry budget").toEqual([FRESH_V2]);
    await expect(r.engine.flush("manual")).resolves.toMatchObject({ pushed: 1, remaining: 0 });
    expect(serverNotes(r)).toEqual(["v2"]);
  });
});

describe("P0-03 — fail() is ONE transaction: a save landing inside it is never overwritten", () => {
  it("per-entry rejection: the old record does not overwrite the newer save, nor pass its failure on", async () => {
    const r = (rig = makeIdbSyncRig());
    const { first, flush, inside } = await saveInsideSettle(r);

    const malformed: PushVerdict = { kind: "reject", reason: "malformed" };
    const second = await releaseThenNextRound(r, first, flush, malformed);
    await inside.done;

    expect(inside.hit, "the save landed inside fail()").not.toBeNull();
    const queued = await queueState(r);
    expect(queued.map((e) => e.notes), "superseded content is not restored").toEqual(["v2"]);
    expect(queued.map((e) => [e.attempts, e.lastError]), "nor its failure inherited").toEqual([
      [0, undefined],
    ]);
    expect(second?.rows.map(notesOf), "the next round transmits the newer save").toEqual(["v2"]);
    second!.release();
    await expect(flush).resolves.toMatchObject({ remaining: 0 });
    expect(serverNotes(r)).toEqual(["v2"]);
    expect(pushedNotes(r)).toEqual([["v1"], ["v2"]]); // v1 is never re-sent
  });

  it("whole-batch failure: the newer save survives with attempts 0, due now; the next flush transmits it", async () => {
    const r = (rig = makeIdbSyncRig());
    const { first, flush, inside } = await saveInsideSettle(r);

    first.release({ kind: "throw", message: "offline" });
    await expect(flush).resolves.toMatchObject({ pushed: 0 });
    await inside.done;

    expect(inside.hit, "the save landed inside fail()").not.toBeNull();
    const queued = await queueState(r);
    expect(queued.map((e) => e.notes), "superseded content is not restored").toEqual(["v2"]);
    expect(queued, "nor its failure inherited").toEqual([FRESH_V2]);
    await expect(r.engine.flush("manual")).resolves.toMatchObject({ pushed: 1, remaining: 0 });
    expect(serverNotes(r)).toEqual(["v2"]);
    expect(pushedNotes(r)).toEqual([["v1"], ["v2"]]);
  });
});

describe("P0-03 — releaseLease() never writes back a stale record", () => {
  it("a save landing inside releaseLease() (between its read and its write) is kept", async () => {
    const r = (rig = makeIdbSyncRig());
    const { outbox } = r.engine;
    await r.repo.save(logWithNotes("v1"));
    const [claimed] = await outbox.claimDue(r.clock.now(), 10, 30_000);
    r.clock.advance(10);
    const inside = r.driver.interleaveAt("outbox", claimed.id, () =>
      r.repo.save(logWithNotes("v2"))
    );

    await outbox.releaseLease(claimed.id);
    await inside.done;

    expect(inside.hit, "the save landed inside releaseLease()").not.toBeNull();
    expect(await queueState(r), "the newer save is kept, unleased and due").toEqual([FRESH_V2]);
    await expect(r.engine.flush("manual")).resolves.toMatchObject({ pushed: 1, remaining: 0 });
    expect(serverNotes(r)).toEqual(["v2"]);
  });
});

describe("P0-03 — an unchanged entry's failure still counts and backs off (happy paths)", () => {
  it("per-entry rejection: attempts + 1, lastError, backoff, lease cleared; retried once the backoff elapses", async () => {
    const r = (rig = makeIdbSyncRig());
    await r.repo.save(logWithNotes("v1"));
    const parked = r.transport.latchNextPush();
    const flush = r.engine.flush("manual");
    (await parked).release({ kind: "reject", reason: "malformed" });

    await expect(flush).resolves.toMatchObject({ pushed: 0, failed: 1, remaining: 1 });
    const [entry] = await r.entries();
    expect(entry).toMatchObject({
      attempts: 1,
      lastError: "malformed",
      nextAttemptAt: r.clock.now() + 1_000,
    });
    expect(entry.leaseUntil).toBeUndefined();
    // Backoff-gated: nothing is retried before nextAttemptAt.
    await expect(r.engine.flush("manual")).resolves.toMatchObject({ pushed: 0, remaining: 1 });
    expect(r.transport.calls).toHaveLength(1);

    r.clock.advance(1_000);
    await expect(r.engine.flush("manual")).resolves.toMatchObject({ pushed: 1, remaining: 0 });
    expect(serverNotes(r)).toEqual(["v1"]);
  });

  it("whole-batch failure: every claimed entry counts the attempt and backs off", async () => {
    const r = (rig = makeIdbSyncRig());
    await r.repo.save(logWithNotes("a", "2026-03-14"));
    await r.repo.save(logWithNotes("b", "2026-03-15"));
    const parked = r.transport.latchNextPush();
    const flush = r.engine.flush("manual");
    (await parked).release({ kind: "throw", message: "offline" });

    await expect(flush).resolves.toMatchObject({ pushed: 0, failed: 2, remaining: 2 });
    const entries = await r.entries();
    expect(entries.map((e) => [notesOf(e.record), e.attempts, e.lastError, e.leaseUntil])).toEqual([
      ["a", 1, "offline", undefined],
      ["b", 1, "offline", undefined],
    ]);
    expect(entries.every((e) => e.nextAttemptAt === r.clock.now() + 1_000)).toBe(true);
  });

  it("per-entry rejection: an entry replaced BEFORE its claim counts the failure and backs off", async () => {
    const r = (rig = makeIdbSyncRig());
    await r.repo.save(logWithNotes("v1"));
    r.clock.advance(10);
    await r.repo.save(logWithNotes("v2")); // coalesced before any push: a non-zero revision
    const parked = r.transport.latchNextPush();
    const flush = r.engine.flush("manual");
    const first = await parked;
    const malformed: PushVerdict = { kind: "reject", reason: "malformed" };

    const again = await releaseThenNextRound(r, first, flush, malformed);

    expect(again?.rows.map(notesOf), "a counted failure is not retried at once").toBeUndefined();
    expect(await queueState(r)).toEqual([
      { notes: "v2", attempts: 1, lastError: "malformed", leased: false, due: false },
    ]);
  });

  it("whole-batch failure: an entry replaced BEFORE its claim counts the failure and backs off", async () => {
    const r = (rig = makeIdbSyncRig());
    await r.repo.save(logWithNotes("v1"));
    r.clock.advance(10);
    await r.repo.save(logWithNotes("v2"));
    const parked = r.transport.latchNextPush();
    const flush = r.engine.flush("manual");
    (await parked).release({ kind: "throw", message: "offline" });

    await expect(flush).resolves.toMatchObject({ pushed: 0, failed: 1, remaining: 1 });
    expect(await queueState(r)).toEqual([
      { notes: "v2", attempts: 1, lastError: "offline", leased: false, due: false },
    ]);
  });

  it("releaseLease: a claimed entry becomes claimable again at once", async () => {
    const r = (rig = makeIdbSyncRig());
    const { outbox } = r.engine;
    await r.repo.save(logWithNotes("v1"));
    const [claimed] = await outbox.claimDue(r.clock.now(), 10, 30_000);
    expect(await outbox.claimDue(r.clock.now(), 10, 30_000)).toEqual([]); // leased

    await outbox.releaseLease(claimed.id);

    const again = await outbox.claimDue(r.clock.now(), 10, 30_000);
    expect(again.map((e) => [e.id, notesOf(e.record)])).toEqual([[claimed.id, "v1"]]);
  });
});
