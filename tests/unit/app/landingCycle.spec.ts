import { describe, it, expect, afterEach } from "vitest";
import { estimateCycle, type Estimate } from "@/app/views/landing/cycle";

// The visitor's estimate on the landing page (views/landing/cycle.ts): pure, so no DOM.
const estimate = (key: string, length: number, now: Date) => (estimateCycle(key, length, now) as { estimate: Estimate }).estimate;

describe("landing estimate", () => {
  const tz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = tz; // tests/setup.ts pins UTC
  });

  it("counts calendar days across a spring-forward night (America/New_York, Mar 8 2026)", () => {
    process.env.TZ = "America/New_York";
    // Mar 1 to Mar 11 is ten calendar days but ten days less an hour: day 11, not day 10.
    expect(estimate("2026-03-01", 28, new Date(2026, 2, 11, 9)).cycleDay).toBe(11);
    // Mar 1 to the next period on Mar 20 (started Feb 20) is 19 days, not 18.
    expect(estimate("2026-02-20", 28, new Date(2026, 2, 1, 9)).daysToNext).toBe(19);
  });

  it("treats a year before 1900 as still being typed: no error, no estimate", () => {
    const now = new Date(2026, 9, 29);
    for (const key of ["0002-10-01", "0020-10-01", "0202-10-01", "1899-12-31"]) expect(estimateCycle(key, 28, now)).toBeNull();
    expect(estimateCycle("2026-10-01", 28, now)).not.toBeNull();
  });

  it("refuses a start more than one and a half cycles back, and says so", () => {
    const now = new Date(2026, 9, 29);
    expect(estimate("2026-09-17", 28, now).cycleDay).toBe(43); // 42 days ago: one and a half cycles
    expect(estimateCycle("2026-09-16", 28, now)).toEqual({
      error: "That was 43 days ago, more than one and a half cycles back. Pick the first day of your most recent period.",
    });
  });
});
