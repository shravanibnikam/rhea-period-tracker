import { describe, it, expect } from "vitest";
import { MemoryDriver } from "@/data/drivers/MemoryDriver";
import { Reconciler } from "@/sync/reconcile";
import { sealPlain, type TombstoneRow } from "@/data/envelope";
import type { RemoteRow } from "@/sync/transports/Transport";
import { encodeHlc } from "@/domain/hlc";
import { emptyLog, type DailyLog } from "@/domain/types";
import type { SyncedRow } from "@/data/envelope";
import { makeFakeClock } from "../../helpers/fakeClock";

const T = 1_770_000_000_000;
const SELF = "dev-self";

const remote = (
  date: string,
  pt: number,
  deviceId = "dev-peer",
  opts: { deleted?: boolean; log?: Partial<DailyLog>; cursor?: string } = {}
): RemoteRow => ({
  key: `log:${date}`,
  scope: "owner",
  payload: opts.deleted ? null : sealPlain({ ...emptyLog(date), ...opts.log }),
  updatedAt: encodeHlc(pt, 0, deviceId),
  deviceId,
  deleted: opts.deleted ?? false,
  serverCursor: opts.cursor ?? "0000000001",
});

function make() {
  const clock = makeFakeClock(T);
  const driver = new MemoryDriver();
  const reconciler = new Reconciler({ driver, selfDeviceId: SELF, now: clock.now });
  return { clock, driver, reconciler };
}

describe("Reconciler (M1.8 / RHEA-048)", () => {
  it("applies new remote rows into logs with their remote stamps", async () => {
    const { driver, reconciler } = make();
    const r = await reconciler.apply(
      [remote("2026-01-01", T, "dev-peer", { log: { flow: "heavy" } })],
      "owner",
      true
    );
    expect(r).toEqual({ applied: 1, skipped: 0, conflicts: 0 });
    const row = await driver.get<SyncedRow<DailyLog>>("logs", "2026-01-01");
    expect(row).toMatchObject({ flow: "heavy", updatedAt: encodeHlc(T, 0, "dev-peer") });
  });

  it("is idempotent: replaying the same page applies nothing new", async () => {
    const { reconciler } = make();
    const page = [remote("2026-01-01", T)];
    await reconciler.apply(page, "owner", true);
    const replay = await reconciler.apply(page, "owner", true);
    expect(replay.applied).toBe(0);
    expect(replay.skipped).toBe(1);
  });

  it("suppresses echoes of this device's own pushes (local copy present)", async () => {
    // A real echo: we authored the row, so the local store already holds it
    // with the identical stamp — the round-trip must not churn the row.
    const { reconciler, driver } = make();
    const stamped = {
      ...emptyLog("2026-01-01"),
      updatedAt: encodeHlc(T, 0, SELF),
      deviceId: SELF,
      deleted: false,
    };
    await driver.put("logs", stamped); // keyPath store: key derives from .date
    const r = await reconciler.apply([remote("2026-01-01", T, SELF)], "owner", false);
    expect(r.applied).toBe(0);
    expect(await driver.get("logs", "2026-01-01")).toEqual(stamped);
  });

  it("H2 fix: a self-authored row MISSING locally is restored, not echo-dropped", async () => {
    const { reconciler, driver } = make();
    const r = await reconciler.apply(
      [remote("2026-01-01", T, SELF, { log: { flow: "medium" } })],
      "owner",
      true
    );
    expect(r.applied).toBe(1);
    expect((await driver.get<DailyLog>("logs", "2026-01-01"))?.flow).toBe("medium");
  });

  it("LWW: keeps the local row when it is newer; conflicts are counted", async () => {
    const { reconciler, driver } = make();
    await reconciler.apply(
      [remote("2026-01-01", T + 10, "dev-b", { log: { flow: "heavy" } })],
      "owner",
      true
    );
    const r = await reconciler.apply(
      [remote("2026-01-01", T, "dev-c", { log: { flow: "light" } })],
      "owner",
      false
    );
    expect(r).toEqual({ applied: 0, skipped: 1, conflicts: 1 });
    expect((await driver.get<DailyLog>("logs", "2026-01-01"))?.flow).toBe("heavy");
  });

  it("winning tombstone removes the row and persists; older insert cannot resurrect", async () => {
    const { reconciler, driver } = make();
    await reconciler.apply([remote("2026-01-01", T)], "owner", true);
    const del = await reconciler.apply(
      [remote("2026-01-01", T + 10, "dev-b", { deleted: true })],
      "owner",
      false
    );
    expect(del.applied).toBe(1);
    expect(await driver.get("logs", "2026-01-01")).toBeUndefined();
    const tomb = await driver.get<TombstoneRow>("tombstones", "log:2026-01-01");
    expect(tomb?.deletedAt).toBe(encodeHlc(T + 10, 0, "dev-b"));

    // Out-of-order older insert loses to the tombstone.
    const late = await reconciler.apply([remote("2026-01-01", T + 5)], "owner", false);
    expect(late.applied).toBe(0);
    expect(await driver.get("logs", "2026-01-01")).toBeUndefined();

    // Rebirth: strictly newer edit supersedes the tombstone.
    const rebirth = await reconciler.apply([remote("2026-01-01", T + 20)], "owner", false);
    expect(rebirth.applied).toBe(1);
    expect(await driver.get("logs", "2026-01-01")).toBeDefined();
    expect(await driver.get("tombstones", "log:2026-01-01")).toBeUndefined();
  });

  it("full-pull tombstones for never-seen keys are skipped (§4.4)", async () => {
    const { reconciler, driver } = make();
    const r = await reconciler.apply(
      [remote("2026-01-01", T, "dev-b", { deleted: true })],
      "owner",
      true
    );
    expect(r.applied).toBe(0);
    expect(await driver.count("tombstones")).toBe(0);

    // …but incremental-pull tombstones ARE materialized.
    const r2 = await reconciler.apply(
      [remote("2026-01-02", T, "dev-b", { deleted: true })],
      "owner",
      false
    );
    expect(r2.applied).toBe(1);
    expect(await driver.count("tombstones")).toBe(1);
  });

  it("meta scope: applies values with merge bookkeeping", async () => {
    const { reconciler, driver } = make();
    const row: RemoteRow = {
      key: "meta:cycleLengthOverride",
      scope: "meta",
      payload: sealPlain(31),
      updatedAt: encodeHlc(T, 0, "dev-b"),
      deviceId: "dev-b",
      deleted: false,
      serverCursor: "0000000001",
    };
    await reconciler.apply([row], "meta", true);
    expect(await driver.get("meta", "cycleLengthOverride")).toBe(31);

    // Older meta update loses.
    const older = { ...row, updatedAt: encodeHlc(T - 5, 0, "dev-c"), payload: sealPlain(25) };
    const r = await reconciler.apply([older], "meta", false);
    expect(r.applied).toBe(0);
    expect(await driver.get("meta", "cycleLengthOverride")).toBe(31);
  });

  it("folds every remote HLC so the next local stamp dominates the page", async () => {
    const { reconciler, driver, clock } = make();
    await reconciler.apply([remote("2026-01-01", T + 999_999, "dev-fast")], "owner", true);
    // Next local stamp (via repositories) must exceed the observed remote.
    const { LogRepository } = await import("@/data/repositories");
    const repo = new LogRepository(driver);
    void clock; // repository uses Date.now, but observe() already lifted state
    await repo.save(emptyLog("2026-02-02"));
    const row = await driver.get<SyncedRow<DailyLog>>("logs", "2026-02-02");
    expect(row!.updatedAt > encodeHlc(T + 999_999, 0, "dev-fast")).toBe(true);
  });
});
