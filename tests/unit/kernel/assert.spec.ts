import { describe, it, expect } from "vitest";
import { invariant, assertNever } from "@/kernel/assert";
import { asDateKey, asHlc, isDateKey, isHlc, asUid } from "@/kernel/brand";
import { ErrorCode, isRheaError } from "@/kernel/errors";

describe("assert", () => {
  it("invariant passes on truthy and narrows", () => {
    const maybe: string | null = "x" as string | null;
    invariant(maybe, "must exist");
    expect(maybe.length).toBe(1); // type narrowed to string
  });

  it("invariant throws RheaError(INVARIANT) on falsy", () => {
    try {
      invariant(false, "broken");
      expect.unreachable();
    } catch (e) {
      expect(isRheaError(e) && e.code === ErrorCode.INVARIANT).toBe(true);
    }
  });

  it("assertNever throws when reached", () => {
    expect(() => assertNever("oops" as never)).toThrow(/Unexpected variant/);
  });
});

describe("branded primitives", () => {
  it("asDateKey accepts YYYY-MM-DD and rejects garbage", () => {
    expect(asDateKey("2026-07-15")).toBe("2026-07-15");
    expect(() => asDateKey("15/07/2026")).toThrow();
    expect(() => asDateKey("2026-7-5")).toThrow();
    expect(isDateKey("2026-07-15")).toBe(true);
    expect(isDateKey("nope")).toBe(false);
  });

  it("asHlc accepts the §0.5 format and rejects garbage", () => {
    const epoch0 = "000000000000:0000:dev-1";
    expect(asHlc(epoch0)).toBe(epoch0);
    expect(isHlc("018f6a7b2c3d:00ff:abc")).toBe(true);
    expect(() => asHlc("2026-07-15T00:00:00Z")).toThrow();
    expect(isHlc("xyz")).toBe(false);
  });

  it("brand casts are zero-cost at runtime", () => {
    expect(asUid("u-1")).toBe("u-1");
  });

  it("brand error context never contains the raw value (no health leak)", () => {
    try {
      asDateKey("heavy-flow-day");
      expect.unreachable();
    } catch (e) {
      expect(JSON.stringify(isRheaError(e) ? e.context : {})).not.toContain("heavy");
    }
  });
});
