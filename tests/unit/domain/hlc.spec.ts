import { describe, it, expect } from "vitest";
import {
  encodeHlc,
  decodeHlc,
  compareHlc,
  hlcNow,
  hlcObserve,
  epochZeroHlc,
  isValidHlc,
  HLC_INITIAL_STATE,
  HLC_MAX_COUNTER,
  HLC_MAX_DRIFT_MS,
  type HlcState,
} from "@/domain/hlc";

// Seeded PRNG so the randomized properties are reproducible.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const T0 = 1_770_000_000_000; // fixed "wall clock" base for determinism

describe("HLC encode/decode/compare", () => {
  it("round-trips and validates", () => {
    const s = encodeHlc(T0, 7, "dev-a");
    const d = decodeHlc(s);
    expect(d).toEqual({ pt: T0, c: 7, deviceId: "dev-a" });
    expect(isValidHlc(s)).toBe(true);
    expect(isValidHlc("garbage")).toBe(false);
    expect(() => decodeHlc("garbage")).toThrow();
  });

  it("epoch-0 sentinel is the lowest possible HLC", () => {
    const zero = epochZeroHlc("dev-a");
    expect(zero).toBe("000000000000:0000:dev-a");
    expect(compareHlc(zero, encodeHlc(1, 0, "dev-a"))).toBeLessThan(0);
  });

  it("PROPERTY: causal order == lexicographic string order", () => {
    const rand = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const a = encodeHlc(
        Math.floor(rand() * 2 ** 44),
        Math.floor(rand() * 0x10000),
        rand() < 0.5 ? "aaa" : "bbb"
      );
      const b = encodeHlc(
        Math.floor(rand() * 2 ** 44),
        Math.floor(rand() * 0x10000),
        rand() < 0.5 ? "aaa" : "bbb"
      );
      const byCompare = Math.sign(compareHlc(a, b));
      const byString = a < b ? -1 : a > b ? 1 : 0;
      expect(byCompare).toBe(byString);
    }
  });
});

describe("hlcNow (stamping)", () => {
  it("PROPERTY: stamps are strictly monotonic under arbitrary clock movement", () => {
    const rand = mulberry32(7);
    let state: HlcState = HLC_INITIAL_STATE;
    let prev = epochZeroHlc("dev");
    let wall = T0;
    for (let i = 0; i < 1000; i++) {
      // Wall clock may jump forward or BACKWARD (skew); stamps must still grow.
      wall += Math.floor(rand() * 20) - 5;
      const r = hlcNow(state, wall, "dev");
      state = r.state;
      expect(compareHlc(r.hlc, prev)).toBeGreaterThan(0);
      prev = r.hlc;
    }
  });

  it("same-ms edits bump the counter; new ms resets it", () => {
    let s: HlcState = { pt: T0, c: 0 };
    const a = hlcNow(s, T0, "dev");
    expect(decodeHlc(a.hlc)).toMatchObject({ pt: T0, c: 1 });
    const b = hlcNow(a.state, T0 + 5, "dev");
    expect(decodeHlc(b.hlc)).toMatchObject({ pt: T0 + 5, c: 0 });
  });

  it("counter overflow at 0xffff spills into the next millisecond", () => {
    const s: HlcState = { pt: T0, c: HLC_MAX_COUNTER };
    const r = hlcNow(s, T0, "dev");
    expect(decodeHlc(r.hlc)).toMatchObject({ pt: T0 + 1, c: 0 });
  });
});

describe("hlcObserve (folding remote)", () => {
  it("next local stamp dominates any observed remote", () => {
    const remote = encodeHlc(T0 + 60_000, 12, "other"); // remote a minute ahead
    const o = hlcObserve(HLC_INITIAL_STATE, remote, T0);
    expect(o.drifted).toBe(false);
    const stamp = hlcNow(o.state, T0, "dev");
    expect(compareHlc(stamp.hlc, remote)).toBeGreaterThan(0);
  });

  it("counter chains when all three clocks collide on one ms", () => {
    const remote = encodeHlc(T0, 9, "other");
    const o = hlcObserve({ pt: T0, c: 4 }, remote, T0);
    expect(o.state).toEqual({ pt: T0, c: 10 }); // max(4, 9) + 1
  });

  it("clamps a far-future remote pt and reports drift", () => {
    const evil = encodeHlc(T0 + HLC_MAX_DRIFT_MS + 999_999, 0, "evil");
    const o = hlcObserve(HLC_INITIAL_STATE, evil, T0);
    expect(o.drifted).toBe(true);
    expect(o.state.pt).toBeLessThanOrEqual(T0 + HLC_MAX_DRIFT_MS);
  });

  it("PROPERTY: interleaved now/observe never regresses the stamp", () => {
    const rand = mulberry32(1234);
    let state: HlcState = HLC_INITIAL_STATE;
    let prev = epochZeroHlc("dev");
    for (let i = 0; i < 500; i++) {
      const wall = T0 + Math.floor(rand() * 1000);
      if (rand() < 0.5) {
        const remote = encodeHlc(
          T0 + Math.floor(rand() * 2000),
          Math.floor(rand() * 16),
          "peer"
        );
        state = hlcObserve(state, remote, wall).state;
      } else {
        const r = hlcNow(state, wall, "dev");
        state = r.state;
        expect(compareHlc(r.hlc, prev)).toBeGreaterThan(0);
        prev = r.hlc;
      }
    }
  });
});
