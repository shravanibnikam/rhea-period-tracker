import { describe, it, expect } from "vitest";
import { MemoryDriver } from "@/data/drivers/MemoryDriver";
import { LogRepository } from "@/data/repositories";
import { SyncEngine } from "@/sync/SyncEngine";
import { NullTransport } from "@/sync/transports/NullTransport";
import { emptyLog, type DailyLog } from "@/domain/types";
import type { SyncedRow } from "@/data/envelope";
import { FakeTransport } from "../../helpers/fakeTransport";
import { makeFakeClock } from "../../helpers/fakeClock";

const OWNER = "owner-uid-1";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeDevice(name: string, transport: FakeTransport | NullTransport, clock = makeFakeClock()) {
  const driver = new MemoryDriver({ dbName: `rhea-${name}` });
  const engine = new SyncEngine({
    deviceId: name,
    selfPeerId: OWNER,
    scopes: ["owner"],
    transport,
    driver,
    backoff: { baseMs: 1000, capMs: 60_000, random: () => 0.5 }, // deterministic
    now: clock.now,
    wakeDebounceMs: 0,
    batchSize: 2, // small pages to exercise paging
  });
  const repo = new LogRepository(driver, { outbox: engine.outbox, now: clock.now });
  return { driver, engine, repo, clock };
}

describe("SyncEngine end-to-end (M1.8 / RHEA-049/050)", () => {
  it("enqueue → flush pushes to the server and drains the outbox", async () => {
    const server = new FakeTransport();
    const a = makeDevice("dev-a", server);

    await a.repo.save({ ...emptyLog("2026-01-01"), flow: "heavy" });
    expect(await a.engine.outbox.depth()).toBe(1); // atomic enqueue with the write

    const result = await a.engine.flush("manual");
    expect(result).toMatchObject({ pushed: 1, failed: 0, remaining: 0 });
    expect(server.rows(OWNER, "owner")).toHaveLength(1);
  });

  it("two devices converge through the server (paging included)", async () => {
    const server = new FakeTransport();
    const a = makeDevice("dev-a", server);
    const b = makeDevice("dev-b", server);

    // A logs five days (batchSize 2 → multi-page pull for B).
    for (const d of ["01", "02", "03", "04", "05"]) {
      a.clock.advance(10);
      await a.repo.save({ ...emptyLog(`2026-01-${d}`), flow: "medium" });
    }
    await a.engine.flush();

    await b.engine.pull();
    expect((await b.repo.getAll()).map((l) => l.date)).toEqual([
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
      "2026-01-04",
      "2026-01-05",
    ]);

    // B edits one day later in time; A converges to B's edit.
    b.clock.set(a.clock.now() + 60_000);
    await b.repo.save({ ...emptyLog("2026-01-03"), flow: "light", notes: "from B" });
    await b.engine.flush();
    await a.engine.pull();
    expect((await a.repo.get("2026-01-03"))?.notes).toBe("from B");
  });

  it("pulling your own pushes is a no-op (echo suppression, no churn)", async () => {
    const server = new FakeTransport();
    const a = makeDevice("dev-a", server);
    await a.repo.save(emptyLog("2026-01-01"));
    await a.engine.flush();

    const before = await a.driver.get<SyncedRow<DailyLog>>("logs", "2026-01-01");
    const r = await a.engine.pull();
    expect(r.applied).toBe(0);
    const after = await a.driver.get<SyncedRow<DailyLog>>("logs", "2026-01-01");
    expect(after).toEqual(before);
  });

  it("deletes propagate as tombstones", async () => {
    const server = new FakeTransport();
    const a = makeDevice("dev-a", server);
    const b = makeDevice("dev-b", server);

    await a.repo.save(emptyLog("2026-01-01"));
    await a.engine.flush();
    await b.engine.pull();
    expect(await b.repo.get("2026-01-01")).toBeDefined();

    a.clock.advance(1000);
    await a.repo.delete("2026-01-01");
    await a.engine.flush();
    await b.engine.pull();
    expect(await b.repo.get("2026-01-01")).toBeUndefined();
    expect(await b.driver.get("tombstones", "log:2026-01-01")).toBeDefined();
  });

  it("offline: failures back off; a later flush succeeds after the delay", async () => {
    const server = new FakeTransport();
    const a = makeDevice("dev-a", server);
    await a.repo.save(emptyLog("2026-01-01"));

    server.failPushes = 1;
    const failed = await a.engine.flush();
    expect(failed).toMatchObject({ pushed: 0, failed: 1, remaining: 1 });
    expect((await a.engine.statusAsync()).online).toBe(false);

    // Immediately retrying does nothing — the entry is backoff-gated.
    const gated = await a.engine.flush();
    expect(gated).toMatchObject({ pushed: 0, failed: 0, remaining: 1 });

    // After the (deterministic) backoff window, the push succeeds.
    a.clock.advance(1001);
    const ok = await a.engine.flush();
    expect(ok).toMatchObject({ pushed: 1, remaining: 0 });
    expect((await a.engine.statusAsync()).online).toBe(true);
  });

  it("stale-write rejections drop the entry (server already newer)", async () => {
    const server = new FakeTransport();
    const a = makeDevice("dev-a", server);
    const b = makeDevice("dev-b", server);

    // B pushes a NEWER edit first.
    b.clock.set(a.clock.now() + 60_000);
    await b.repo.save({ ...emptyLog("2026-01-01"), notes: "newer" });
    await b.engine.flush();

    // A pushes an older edit — server guard rejects; A drops it and pulls B's.
    await a.repo.save({ ...emptyLog("2026-01-01"), notes: "older" });
    const r = await a.engine.flush();
    expect(r.remaining).toBe(0); // dropped, not stuck
    await a.engine.pull();
    expect((await a.repo.get("2026-01-01"))?.notes).toBe("newer");
  });

  it("realtime wake triggers an authoritative pull on the other device", async () => {
    const server = new FakeTransport();
    const a = makeDevice("dev-a", server);
    const b = makeDevice("dev-b", server);
    await b.engine.start(); // subscribes

    await a.repo.save({ ...emptyLog("2026-01-07"), flow: "medium" });
    await a.engine.flush(); // fan-out fires B's wake → debounced pull

    await sleep(10); // let the 0ms debounce + pull settle
    expect(await b.repo.get("2026-01-07")).toBeDefined();
    await b.engine.stop();
  });

  it("resync() re-pulls everything from epoch-0", async () => {
    const server = new FakeTransport();
    const a = makeDevice("dev-a", server);
    const b = makeDevice("dev-b", server);
    await a.repo.save(emptyLog("2026-01-01"));
    await a.engine.flush();
    await b.engine.pull();

    // Wipe B's local logs, then resync.
    await b.driver.clear("logs");
    await b.engine.resync("owner");
    expect(await b.repo.get("2026-01-01")).toBeDefined();
  });

  it("resync() restores a SINGLE-device owner's own rows (critique H2 / R-OFF-1)", async () => {
    // Every server row is self-authored here — the old pre-compare echo drop
    // made this exact restore a silent no-op.
    const server = new FakeTransport();
    const a = makeDevice("dev-a", server);
    await a.repo.save({ ...emptyLog("2026-01-01"), flow: "medium" });
    await a.repo.save(emptyLog("2026-01-02"));
    await a.engine.flush();

    await a.driver.clear("logs"); // meta survives → same deviceId
    expect(await a.repo.get("2026-01-01")).toBeUndefined();

    await a.engine.resync("owner");
    expect((await a.repo.get("2026-01-01"))?.flow).toBe("medium");
    expect(await a.repo.get("2026-01-02")).toBeDefined();
  });

  it("runs cleanly over NullTransport (local-only shadow mode)", async () => {
    const a = makeDevice("dev-a", new NullTransport());
    await a.engine.start();
    await a.repo.save(emptyLog("2026-01-01"));
    const r = await a.engine.flush();
    expect(r).toMatchObject({ pushed: 1, failed: 0, remaining: 0 });
    expect(await a.repo.get("2026-01-01")).toBeDefined(); // zero user-facing change
    await a.engine.stop();
  });
});
