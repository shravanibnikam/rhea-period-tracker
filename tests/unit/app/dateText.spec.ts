import { describe, it, expect } from "vitest";
import { daysFrom, fmtSpan, inDays } from "@/app/views/tracker/dateText";

describe("Today/Calendar date text", () => {
  it("counts calendar days, ignoring the time of day", () => {
    const now = new Date(2026, 9, 27, 15, 30);
    expect(daysFrom(now, new Date(2026, 10, 7))).toBe(11); // Oct 27 → Nov 7
    expect(daysFrom(now, new Date(2026, 9, 27))).toBe(0);
    expect(daysFrom(now, new Date(2026, 9, 25))).toBe(-2);
  });

  it("rounds across a 23-hour (DST) day", () => {
    const tz = process.env.TZ;
    process.env.TZ = "America/New_York";
    try {
      expect(daysFrom(new Date(2026, 2, 7), new Date(2026, 2, 9))).toBe(2); // spans Mar 8
    } finally {
      process.env.TZ = tz;
    }
  });

  it("words relative days and date spans", () => {
    expect([0, 1, -1, 5, -3].map(inDays)).toEqual(["today", "tomorrow", "yesterday", "in 5 days", "3 days ago"]);
    expect(fmtSpan(new Date(2026, 9, 19), new Date(2026, 9, 25))).toBe("Oct 19–25");
    expect(fmtSpan(new Date(2026, 9, 30), new Date(2026, 10, 5))).toBe("Oct 30 – Nov 5");
    expect(fmtSpan(new Date(2026, 9, 19), new Date(2026, 9, 19))).toBe("Oct 19");
  });
});
