import { describe, it, expect } from "vitest";
import { decideMerge, lwwWinner, type MergeMeta } from "@/domain/merge";
import { encodeHlc } from "@/domain/hlc";

const SELF = "device-self";
const meta = (pt: number, c: number, deviceId: string, deleted = false): MergeMeta => ({
  updatedAt: encodeHlc(pt, c, deviceId),
  deviceId,
  deleted,
});

const T = 1_770_000_000_000;

describe("decideMerge (LWW / tombstone / echo)", () => {
  it("echo: a self-authored row that ties local is skipped as echo", () => {
    const d = decideMerge({
      remote: meta(T, 0, SELF),
      local: meta(T, 0, SELF),
      selfDeviceId: SELF,
      fullPull: false,
    });
    expect(d).toEqual({ action: "skip", reason: "echo" });
  });

  it("echo: a stale self-authored row (older than local) is skipped as echo", () => {
    const d = decideMerge({
      remote: meta(T, 0, SELF),
      local: meta(T + 1, 0, SELF),
      selfDeviceId: SELF,
      fullPull: false,
    });
    expect(d).toEqual({ action: "skip", reason: "echo" });
  });

  it("H2 fix: a strictly-newer self-authored row APPLIES (rolled-back local)", () => {
    // A local store restored from an old backup holds an older copy of our own
    // record; the server's newer self-authored row must win, not be "echoed".
    const d = decideMerge({
      remote: meta(T + 999, 0, SELF),
      local: meta(T, 0, SELF),
      selfDeviceId: SELF,
      fullPull: false,
    });
    expect(d).toEqual({ action: "apply", tombstone: false });
  });

  it("H2 fix: a self-authored row missing locally APPLIES (wiped store restore)", () => {
    // Single-device owner wipes/loses the logs store and resyncs: every server
    // row is self-authored; the old pre-compare echo drop restored NOTHING.
    expect(
      decideMerge({ remote: meta(T, 0, SELF), local: undefined, selfDeviceId: SELF, fullPull: true })
    ).toEqual({ action: "apply", tombstone: false });
  });

  it("new key applies (insert), including incremental-pull tombstones", () => {
    expect(
      decideMerge({ remote: meta(T, 0, "a"), local: undefined, selfDeviceId: SELF, fullPull: false })
    ).toEqual({ action: "apply", tombstone: false });
    expect(
      decideMerge({
        remote: meta(T, 0, "a", true),
        local: undefined,
        selfDeviceId: SELF,
        fullPull: false, // incremental: materialize — it may delete an in-flight row
      })
    ).toEqual({ action: "apply", tombstone: true });
  });

  it("full-pull tombstone for a never-seen key is skipped (§4.4)", () => {
    expect(
      decideMerge({
        remote: meta(T, 0, "a", true),
        local: undefined,
        selfDeviceId: SELF,
        fullPull: true,
      })
    ).toEqual({ action: "skip", reason: "unknown-tombstone" });
  });

  it("newer remote wins; older remote is skipped", () => {
    const local = meta(T, 5, "a");
    expect(
      decideMerge({ remote: meta(T, 6, "b"), local, selfDeviceId: SELF, fullPull: false })
    ).toEqual({ action: "apply", tombstone: false });
    expect(
      decideMerge({ remote: meta(T, 4, "b"), local, selfDeviceId: SELF, fullPull: false })
    ).toEqual({ action: "skip", reason: "older" });
  });

  it("identical stamp is a duplicate (idempotent replay)", () => {
    const local = meta(T, 5, "a");
    expect(
      decideMerge({ remote: meta(T, 5, "a"), local, selfDeviceId: SELF, fullPull: false })
    ).toEqual({ action: "skip", reason: "duplicate" });
  });

  it("exact (pt,c) tie broken deterministically by deviceId", () => {
    const local = meta(T, 5, "bbb");
    expect(
      decideMerge({ remote: meta(T, 5, "ccc"), local, selfDeviceId: SELF, fullPull: false })
    ).toEqual({ action: "apply", tombstone: false });
    expect(
      decideMerge({ remote: meta(T, 5, "aaa"), local, selfDeviceId: SELF, fullPull: false })
    ).toEqual({ action: "skip", reason: "tiebreak" });
  });

  it("tombstone beats a stale write; newer edit resurrects (rebirth)", () => {
    const tomb = meta(T, 5, "a", true);
    // Stale write vs tombstone → tombstone survives.
    expect(
      decideMerge({ remote: meta(T, 4, "b"), local: tomb, selfDeviceId: SELF, fullPull: false })
    ).toEqual({ action: "skip", reason: "older" });
    // Winning tombstone applies as a tombstone.
    expect(
      decideMerge({ remote: meta(T, 6, "b", true), local: meta(T, 5, "a"), selfDeviceId: SELF, fullPull: false })
    ).toEqual({ action: "apply", tombstone: true });
    // Rebirth: strictly-newer live edit supersedes the tombstone.
    expect(
      decideMerge({ remote: meta(T, 6, "b"), local: tomb, selfDeviceId: SELF, fullPull: false })
    ).toEqual({ action: "apply", tombstone: false });
  });

  it("PROPERTY: applying two versions in either order converges (commutativity)", () => {
    const versions: MergeMeta[] = [];
    for (let pt = 0; pt < 3; pt++)
      for (let c = 0; c < 2; c++)
        for (const dev of ["aaa", "zzz"])
          for (const del of [false, true]) versions.push(meta(T + pt, c, dev, del));

    const apply = (local: MergeMeta | undefined, remote: MergeMeta): MergeMeta | undefined => {
      const d = decideMerge({ remote, local, selfDeviceId: SELF, fullPull: false });
      return d.action === "apply" ? remote : local;
    };

    for (const a of versions) {
      for (const b of versions) {
        for (const start of [undefined, meta(T, 0, "mmm")]) {
          const ab = apply(apply(start, a), b);
          const ba = apply(apply(start, b), a);
          expect(ab?.updatedAt).toBe(ba?.updatedAt);
        }
      }
    }
  });

  it("PROPERTY: idempotent — reapplying the winner is always a skip", () => {
    const winner = meta(T, 5, "abc");
    const d = decideMerge({ remote: winner, local: winner, selfDeviceId: SELF, fullPull: false });
    expect(d.action).toBe("skip");
  });
});

describe("lwwWinner (outbox coalescing §4.6)", () => {
  it("keeps the newest version deterministically", () => {
    const older = meta(T, 1, "a");
    const newer = meta(T, 2, "b");
    expect(lwwWinner(older, newer)).toBe(newer);
    expect(lwwWinner(newer, older)).toBe(newer);
  });
});
