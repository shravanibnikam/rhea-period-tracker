import { describe, it, expect } from "vitest";
import { MemoryDriver } from "@/data/drivers/MemoryDriver";
import { Outbox } from "@/sync/outbox";
import { sealPlain, type SyncRecord } from "@/data/envelope";
import { encodeHlc } from "@/domain/hlc";
import { makeFakeClock } from "../../helpers/fakeClock";

const T = 1_770_000_000_000;

const record = (key: string, pt: number, payload: unknown = { v: key }): SyncRecord => ({
  key,
  scope: "owner",
  payload: sealPlain(payload),
  updatedAt: encodeHlc(pt, 0, "dev-a"),
  deviceId: "dev-a",
  deleted: false,
});

function make() {
  const clock = makeFakeClock(T);
  const driver = new MemoryDriver();
  return { clock, driver, outbox: new Outbox(driver, clock.now) };
}

describe("Outbox (M1.8 / RHEA-047)", () => {
  it("enqueues and claims due entries oldest-first", async () => {
    const { outbox, clock } = make();
    await outbox.enqueueCoalesced(record("log:2026-01-01", T), "owner");
    clock.advance(10);
    await outbox.enqueueCoalesced(record("log:2026-01-02", T + 10), "owner");

    expect(await outbox.depth()).toBe(2);
    const due = await outbox.claimDue(clock.now(), 10, 1000);
    expect(due.map((e) => e.record.key)).toEqual(["log:2026-01-01", "log:2026-01-02"]);
  });

  it("coalesces re-saves of the same key by LWW (§4.6)", async () => {
    const { outbox } = make();
    await outbox.enqueueCoalesced(record("log:2026-01-01", T, { flow: "light" }), "owner");
    await outbox.enqueueCoalesced(record("log:2026-01-01", T + 5, { flow: "heavy" }), "owner");
    expect(await outbox.depth()).toBe(1);
    const only = await outbox.peekOldest();
    expect(only!.record.updatedAt).toBe(encodeHlc(T + 5, 0, "dev-a"));

    // An OLDER record never replaces newer pending content.
    await outbox.enqueueCoalesced(record("log:2026-01-01", T - 5), "owner");
    expect((await outbox.peekOldest())!.record.updatedAt).toBe(encodeHlc(T + 5, 0, "dev-a"));
  });

  it("leases prevent double-claim; expired leases are re-claimable (crash recovery)", async () => {
    const { outbox, clock } = make();
    await outbox.enqueueCoalesced(record("log:2026-01-01", T), "owner");

    const first = await outbox.claimDue(clock.now(), 10, 1000);
    expect(first).toHaveLength(1);
    // Still leased → not claimable.
    expect(await outbox.claimDue(clock.now(), 10, 1000)).toHaveLength(0);
    // Lease expiry (crash mid-push) → claimable again.
    clock.advance(1001);
    expect(await outbox.claimDue(clock.now(), 10, 1000)).toHaveLength(1);
  });

  it("ack deletes; fail backs off and clears the lease", async () => {
    const { outbox, clock } = make();
    await outbox.enqueueCoalesced(record("log:2026-01-01", T), "owner");
    const [entry] = await outbox.claimDue(clock.now(), 10, 1000);

    await outbox.fail(entry.id, "offline", clock.now() + 5000);
    const failed = await outbox.peekOldest();
    expect(failed!.attempts).toBe(1);
    expect(failed!.lastError).toBe("offline");
    expect(failed!.leaseUntil).toBeUndefined();
    // Not due until the backoff elapses.
    expect(await outbox.claimDue(clock.now(), 10, 1000)).toHaveLength(0);
    clock.advance(5000);
    const [again] = await outbox.claimDue(clock.now(), 10, 1000);
    await outbox.ack(again.id);
    expect(await outbox.depth()).toBe(0);
  });

  it("survives restart (a new Outbox over the same driver sees pending entries)", async () => {
    const { outbox, driver, clock } = make();
    await outbox.enqueueCoalesced(record("log:2026-01-01", T), "owner");
    const reborn = new Outbox(driver, clock.now);
    expect(await reborn.depth()).toBe(1);
    expect((await reborn.peekOldest())!.record.key).toBe("log:2026-01-01");
  });
});
